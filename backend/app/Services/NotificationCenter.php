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
                ['name' => $product->name, 'detail' => $warehouse, 'amount' => $event->currentAvailable.' '.$product->unit], route('app.inventory'));
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
            ['name' => $record->title, 'detail' => $record->counterparty, 'amount' => $record->amount.' '.$record->currency],
            route('app.payments'), true);
    }

    public function resolve(int $organizationId, string $keyPattern): void
    {
        DB::table('workspace_notifications')->where('organization_id', $organizationId)->where('event_key', 'like', $keyPattern)
            ->whereNull('read_at')->update(['read_at' => now(), 'updated_at' => now()]);
    }

    public function syncDue(int $organizationId): void
    {
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
                        ['name' => $plan->title, 'detail' => $plan->next_due_on->format('Y-m-d'), 'amount' => $plan->amount.' '.$plan->currency],
                        route('app.payments'), true);
                }
            });
    }
}
