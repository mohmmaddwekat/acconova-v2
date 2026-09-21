<?php

namespace App\Services;

use App\Events\StockMovementRecorded;
use App\Models\PaymentPlan;
use App\Models\PaymentRecord;
use App\Models\Product;
use App\Models\ServiceOperation;
use App\Support\InventoryQuantity;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class NotificationCenter
{
    public function message(object $conversation, int $messageId, int $senderId, string $senderName): void
    {
        $recipients = DB::table('workspace_conversation_members as cm')->join('memberships as m', 'm.user_id', '=', 'cm.user_id')
            ->where('m.organization_id', $conversation->organization_id)->where('cm.conversation_id', $conversation->id)
            ->where(function (Builder $query): void {
                $query->where('cm.notifications_muted', false)->orWhere('cm.notifications_muted_until', '<=', now());
            })
            ->where('cm.user_id', '!=', $senderId)->pluck('cm.user_id');
        foreach ($recipients as $recipientId) {
            DB::table('workspace_notifications')->insertOrIgnore([
                'organization_id' => $conversation->organization_id, 'user_id' => $recipientId,
                'event_key' => 'message:'.$conversation->id.':'.$messageId, 'kind' => 'message', 'category' => 'messages',
                'data' => json_encode(['name' => $senderName, 'detail' => $conversation->kind === 'group' ? $conversation->name : null], JSON_THROW_ON_ERROR),
                'url' => route('app.team-space', ['conversation' => $conversation->id]), 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    /** @param array<string, mixed> $data */
    public function publish(int $organizationId, string $key, string $kind, string $category, array $data, string $url, bool $finance = false): void
    {
        $recipients = DB::table('memberships')->where('organization_id', $organizationId);
        foreach ($recipients->get(['user_id', 'role']) as $recipient) {
            $userId = $recipient->user_id;
            if ($finance && ! in_array($recipient->role, ['owner', 'admin', 'manager', 'accountant'], true)) {
                $custom = WorkspacePermissions::custom($userId, $organizationId);
                if (! $custom || ! in_array($category === 'payments' ? 'payments.view' : 'products.view', $custom->permissions, true)) {
                    continue;
                }
            }

            if (! app(NotificationRuleService::class)->allows(
                $organizationId,
                (int) $userId,
                $kind,
                $category,
                $data,
            )) {
                continue;
            }

            DB::table('workspace_notifications')->insertOrIgnore([
                'organization_id' => $organizationId, 'user_id' => $userId, 'event_key' => $key,
                'kind' => $kind, 'category' => $category, 'data' => json_encode($data, JSON_THROW_ON_ERROR),
                'url' => $url, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    public function stock(StockMovementRecorded $event): void
    {
        $product = Product::withoutGlobalScopes()->where('organization_id', $event->organizationId)->find($event->productId);
        if (! $product) {
            return;
        }
        $previous = InventoryQuantity::toUnits($event->previousAvailable);
        $current = InventoryQuantity::toUnits($event->currentAvailable);
        $threshold = $event->lowStockThreshold === null ? 0 : InventoryQuantity::toUnits($event->lowStockThreshold);
        $kind = null;
        if ($previous > 0 && $current <= 0) {
            $kind = 'out_of_stock';
        } elseif ($threshold > 0 && $current > 0 && $current <= $threshold && ($previous <= 0 || $previous > $threshold)) {
            $kind = 'low_stock';
        }
        $warehouse = DB::table('warehouses')->where('organization_id', $event->organizationId)->where('id', $event->warehouseId)->value('name');
        if ($kind) {
            $this->publish($event->organizationId, 'stock:'.$event->movementId, $kind, 'stock',
                [
                    'name' => $product->name,
                    'detail' => $warehouse,
                    'amount' => $event->currentAvailable.' '.$product->unit,
                    'stock_quantity' => $current,
                    'amount_value' => $current,
                ], route('app.inventory'));
        }
        if ($event->movementType === 'production_in') {
            $this->publish($event->organizationId, 'production:'.$event->movementId, 'production', 'activity',
                ['name' => $product->name, 'detail' => $warehouse], route('app.products'), true);
        }
    }

    public function service(ServiceOperation $operation): void
    {
        $this->publish((int) $operation->organization_id, 'service:'.$operation->id, 'service', 'activity',
            ['name' => $operation->service_name, 'detail' => $operation->customer_name, 'amount' => $operation->subtotal],
            route('app.products'), true);
    }

    public function payment(PaymentRecord $record): void
    {
        $this->resolve((int) $record->organization_id, 'payment_due:'.$record->payment_plan_id.':'.$record->due_on->format('Y-m-d').':%');
        $this->publish((int) $record->organization_id, 'payment:'.$record->id, 'payment_recorded', 'payments',
            [
                'name' => $record->title,
                'detail' => $record->counterparty,
                'amount' => $record->amount.' '.$record->currency,
                'amount_value' => (float) $record->amount,
            ],
            route('app.payments'), true);
    }

    public function resolve(int $organizationId, string $keyPattern): void
    {
        DB::table('workspace_notifications')->where('organization_id', $organizationId)->where('event_key', 'like', $keyPattern)
            ->whereNull('read_at')->update(['read_at' => now(), 'updated_at' => now()]);
    }

    public function syncDue(int $organizationId): void
    {
        $this->syncRecordReminders($organizationId);
        $this->syncInventoryExpiry($organizationId);
        $this->syncContractExpiry($organizationId);
        $this->syncDocumentExpiry($organizationId);

        PaymentPlan::withoutGlobalScopes()->where('organization_id', $organizationId)->where('active', true)
            ->whereDate('next_due_on', '<=', today()->addDays(30))->chunkById(100, function ($plans) use ($organizationId): void {
                foreach ($plans as $plan) {
                    if ($plan->next_due_on->gt(today()->addDays($plan->reminder_days))) {
                        continue;
                    }
                    $phase = $plan->next_due_on->lte(today()) ? 'due' : 'soon';
                    if ($phase === 'due') {
                        $this->resolve($organizationId, 'payment_due:'.$plan->id.':'.$plan->next_due_on->format('Y-m-d').':soon');
                    }
                    $this->publish($organizationId, 'payment_due:'.$plan->id.':'.$plan->next_due_on->format('Y-m-d').':'.$phase,
                        $phase === 'due' ? 'payment_due' : 'payment_soon', 'payments',
                        [
                            'name' => $plan->title,
                            'detail' => $plan->next_due_on->format('Y-m-d'),
                            'amount' => $plan->amount.' '.$plan->currency,
                            'amount_value' => (float) $plan->amount,
                        ],
                        route('app.payments'), true);
                }
            });
    }

    private function syncInventoryExpiry(
        int $organizationId,
    ): void {
        DB::table('inventory_batches as batch')
            ->leftJoin(
                'products as product',
                'product.id',
                '=',
                'batch.product_id',
            )
            ->where(
                'batch.organization_id',
                $organizationId,
            )
            ->whereNotNull('batch.expiry_date')
            ->where('batch.quantity', '>', 0)
            ->whereNotIn(
                'batch.status',
                ['depleted', 'recalled'],
            )
            ->whereDate(
                'batch.expiry_date',
                '<=',
                today()->addDays(30),
            )
            ->orderBy('batch.id')
            ->limit(250)
            ->get([
                'batch.id',
                'batch.lot_code',
                'batch.expiry_date',
                'product.name as product_name',
            ])
            ->each(function ($batch) use ($organizationId): void {
                $days = today()->diffInDays(
                    \Carbon\CarbonImmutable::parse(
                        $batch->expiry_date,
                    ),
                    false,
                );

                $phase = match (true) {
                    $days < 0 => 'expired',
                    $days <= 7 => '7_days',
                    $days <= 15 => '15_days',
                    default => '30_days',
                };

                $this->publish(
                    $organizationId,
                    'inventory-expiry:'
                        .$batch->id
                        .':'
                        .$batch->expiry_date
                        .':'
                        .$phase,
                    'inventory_expiry',
                    'stock',
                    [
                        'name' =>
                            $batch->product_name
                            ?: 'Inventory batch',
                        'detail' =>
                            $batch->lot_code
                            .' · '
                            .$batch->expiry_date,
                    ],
                    '/app/inventory/expiry',
                );
            });
    }

    private function syncContractExpiry(
        int $organizationId,
    ): void {
        DB::table('party_contracts')
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where('status', 'active')
            ->whereDate(
                'ends_on',
                '<=',
                today()->addDays(365),
            )
            ->orderBy('id')
            ->limit(250)
            ->get([
                'id',
                'title',
                'ends_on',
                'reminder_days',
            ])
            ->each(function ($contract) use ($organizationId): void {
                $days = today()->diffInDays(
                    \Carbon\CarbonImmutable::parse(
                        $contract->ends_on,
                    ),
                    false,
                );

                if (
                    $days > (int) $contract->reminder_days
                ) {
                    return;
                }

                $phase = match (true) {
                    $days < 0 => 'expired',
                    $days <= 7 => '7_days',
                    $days <= 15 => '15_days',
                    default => '30_days',
                };

                $this->publish(
                    $organizationId,
                    'contract-expiry:'
                        .$contract->id
                        .':'
                        .$contract->ends_on
                        .':'
                        .$phase,
                    'contract_expiry',
                    'activity',
                    [
                        'name' => $contract->title,
                        'detail' =>
                            'Ends '
                            .$contract->ends_on,
                    ],
                    '/app/parties/contracts',
                );
            });
    }

    private function syncDocumentExpiry(
        int $organizationId,
    ): void {
        DB::table('expiring_documents')
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where('status', 'active')
            ->whereDate(
                'expires_on',
                '<=',
                today()->addDays(365),
            )
            ->orderBy('id')
            ->limit(250)
            ->get([
                'id',
                'subject_label',
                'document_type',
                'expires_on',
                'reminder_days',
            ])
            ->each(function ($document) use ($organizationId): void {
                $days = today()->diffInDays(
                    \Carbon\CarbonImmutable::parse(
                        $document->expires_on,
                    ),
                    false,
                );

                if (
                    $days > (int) $document->reminder_days
                ) {
                    return;
                }

                $phase = match (true) {
                    $days < 0 => 'expired',
                    $days <= 7 => '7_days',
                    $days <= 15 => '15_days',
                    default => '30_days',
                };

                $this->publish(
                    $organizationId,
                    'document-expiry:'
                        .$document->id
                        .':'
                        .$document->expires_on
                        .':'
                        .$phase,
                    'document_expiry',
                    'activity',
                    [
                        'name' =>
                            $document->document_type,
                        'detail' =>
                            (
                                $document->subject_label
                                ? $document->subject_label
                                    .' · '
                                : ''
                            )
                            .$document->expires_on,
                    ],
                    '/app/documents/expiry',
                );
            });
    }

    private function syncRecordReminders(int $organizationId): void
    {
        DB::table('record_reminders')
            ->where('organization_id', $organizationId)
            ->whereNull('completed_at')
            ->whereNull('notified_at')
            ->where('due_at', '<=', now())
            ->orderBy('id')
            ->limit(200)
            ->get()
            ->each(function ($reminder) use ($organizationId): void {
                $url = $this->recordUrl(
                    $organizationId,
                    (string) $reminder->record_type,
                    (int) $reminder->record_id,
                );

                $data = [
                    'name' =>
                        $reminder->note
                        ?: 'Follow-up reminder',
                    'detail' =>
                        $reminder->due_at,
                    'count' => 1,
                ];

                if (app(NotificationRuleService::class)->allows(
                    $organizationId,
                    (int) $reminder->user_id,
                    'follow_up_due',
                    'activity',
                    $data,
                )) {
                    DB::table('workspace_notifications')->insertOrIgnore([
                        'organization_id' => $organizationId,
                        'user_id' => $reminder->user_id,
                        'event_key' => 'record-reminder:'.$reminder->id,
                        'kind' => 'follow_up_due',
                        'category' => 'activity',
                        'data' => json_encode(
                            $data,
                            JSON_THROW_ON_ERROR,
                        ),
                        'url' => $url,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }

                DB::table('record_reminders')
                    ->where('id', $reminder->id)
                    ->update([
                        'notified_at' => now(),
                        'updated_at' => now(),
                    ]);
            });
    }

    private function recordUrl(
        int $organizationId,
        string $type,
        int $recordId,
    ): string
    {
        if ($type === 'party') {
            return '/app/parties?focus='.$recordId;
        }

        if ($type === 'product') {
            return '/app/products?focus='.$recordId;
        }

        if ($type === 'staff') {
            return '/app/staff/directory?staff='.$recordId;
        }

        if ($type === 'task') {
            return '/app/task-management/'.$recordId;
        }

        if ($type === 'document') {
            $document = DB::table('financial_documents')
                ->where('organization_id', $organizationId)
                ->where('id', $recordId)
                ->first(['id', 'kind']);

            if ($document) {
                return $document->kind === 'sale_invoice'
                    ? '/app/invoices/sales/'.$recordId
                    : '/app/invoices/purchases/'.$recordId;
            }
        }

        return '/app';
    }
}
