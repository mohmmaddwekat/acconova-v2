<?php

namespace App\Services;

use App\Models\CashAllocation;
use App\Models\Department;
use App\Models\FinancialDocument;
use App\Models\FinancialDocumentLine;
use App\Models\Party;
use App\Models\Product;
use App\Models\TaxRule;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class FinanceDocumentService
{
    public function __construct(
        private readonly FinanceNumberService $numbers,
        private readonly FinanceAuditService $audit,
        private readonly FinanceInventoryService $inventory,
    ) {}

    public function createDraft(array $data, int $actorId): FinancialDocument
    {
        return DB::transaction(function () use ($data, $actorId): FinancialDocument {
            $kind = $data['kind'];
            $this->assertPartyRole((int) $data['party_id'], $kind);
            $this->assertHeaderReferences($data);

            $document = FinancialDocument::create([
                ...$this->headerPayload($data),
                'number' => $this->numbers->next(
                    $kind === 'sale_invoice' ? 'sales_invoice' : 'purchase_invoice',
                    $kind === 'sale_invoice'
                        ? (string) (app(\App\Tenancy\TenantContext::class)->organization()->preferences['invoice_prefix'] ?? 'SAL')
                        : (string) (app(\App\Tenancy\TenantContext::class)->organization()->preferences['purchase_prefix'] ?? 'PUR'),
                ),
                'revision' => 1,
                'status' => 'draft',
                'created_by' => $actorId,
                'updated_by' => $actorId,
            ]);

            $document->root_document_id = $document->id;
            $document->save();

            $this->syncLines($document, $data['lines']);
            $this->recalculateTotals($document, (string) ($data['shipping_total'] ?? '0'));

            $this->audit->record(
                $document,
                'draft_created',
                $actorId,
                null,
                null,
                $this->snapshot($document),
            );

            return $document->fresh($this->relations());
        }, 3);
    }

    public function updateDraft(FinancialDocument $document, array $data, int $actorId): FinancialDocument
    {
        return DB::transaction(function () use ($document, $data, $actorId): FinancialDocument {
            $locked = FinancialDocument::query()->lockForUpdate()->findOrFail($document->id);

            if (! $locked->isDraft()) {
                throw ValidationException::withMessages([
                    'status' => ['Issued financial documents are immutable. Start a correction instead.'],
                ]);
            }

            $before = $this->snapshot($locked);
            $kind = $locked->kind;
            $this->assertPartyRole((int) $data['party_id'], $kind);
            $this->assertHeaderReferences($data);

            $locked->fill([
                ...$this->headerPayload($data),
                'kind' => $kind,
                'updated_by' => $actorId,
            ]);
            $locked->save();

            $this->syncLines($locked, $data['lines']);
            $this->recalculateTotals($locked, (string) ($data['shipping_total'] ?? '0'));

            $this->audit->record(
                $locked,
                'draft_updated',
                $actorId,
                null,
                $before,
                $this->snapshot($locked),
            );

            return $locked->fresh($this->relations());
        }, 3);
    }

    public function deleteDraft(FinancialDocument $document, int $actorId): void
    {
        DB::transaction(function () use ($document, $actorId): void {
            $locked = FinancialDocument::query()
                ->with(['lines', 'allocations'])
                ->lockForUpdate()
                ->findOrFail($document->id);

            if (! $locked->isDraft()) {
                throw ValidationException::withMessages([
                    'status' => ['Only draft invoices can be deleted. Issued invoices must be voided or corrected so the audit trail stays intact.'],
                ]);
            }

            if ($locked->allocations->isNotEmpty()) {
                throw ValidationException::withMessages([
                    'payments' => ['Remove linked payment allocations before deleting this draft.'],
                ]);
            }

            $snapshot = $this->snapshot($locked);

            $this->audit->record(
                $locked,
                'draft_deleted',
                $actorId,
                'Draft deleted before issue',
                $snapshot,
                null,
            );

            $locked->lines()->delete();
            $locked->delete();
        }, 3);
    }

    public function issue(
        FinancialDocument $document,
        int $actorId,
        bool $acknowledgeWarnings,
    ): FinancialDocument {
        return DB::transaction(function () use ($document, $actorId, $acknowledgeWarnings): FinancialDocument {
            $locked = FinancialDocument::query()
                ->with('lines')
                ->lockForUpdate()
                ->findOrFail($document->id);

            if (! $locked->isDraft()) {
                throw ValidationException::withMessages([
                    'status' => ['Only draft documents can be issued.'],
                ]);
            }

            if ($locked->lines->isEmpty()) {
                throw ValidationException::withMessages([
                    'lines' => ['At least one invoice line is required.'],
                ]);
            }

            if ($locked->isSale()) {
                /*
                 * Refresh cost snapshots at issue time so profitability does
                 * not drift later when the catalog cost changes. This is a
                 * reporting snapshot only; it does not change accounting or
                 * inventory valuation entries.
                 */
                $locked->load('lines.product');

                foreach ($locked->lines as $line) {
                    if (! $line->product) {
                        continue;
                    }

                    $line->cost_price_snapshot =
                        $line->product->cost_price;
                    $line->save();
                }
            }

            $warnings = $this->warnings($locked);

            if ($warnings !== [] && ! $acknowledgeWarnings) {
                throw ValidationException::withMessages([
                    'warnings' => $warnings,
                ]);
            }

            $previous = null;

            if ($locked->corrected_from_id) {
                $previous = FinancialDocument::query()
                    ->with('lines')
                    ->lockForUpdate()
                    ->findOrFail($locked->corrected_from_id);

                if (! in_array($previous->status, ['issued', 'partially_paid', 'paid', 'overpaid'], true)) {
                    throw ValidationException::withMessages([
                        'correction' => ['The source document can no longer be corrected.'],
                    ]);
                }
            }

            $this->inventory->applyDocumentDelta(
                $previous,
                $locked,
                $actorId,
                $locked->id,
            );

            if ($previous) {
                CashAllocation::query()
                    ->where('financial_document_id', $previous->id)
                    ->update([
                        'financial_document_id' => $locked->id,
                    ]);

                $previous->status = 'superseded';
                $previous->updated_by = $actorId;
                $previous->save();

                $this->audit->record(
                    $previous,
                    'superseded',
                    $actorId,
                    $locked->correction_reason,
                    null,
                    ['replacement_document_id' => $locked->id],
                );
            }

            $before = $this->snapshot($locked);
            $locked->status = 'issued';
            $locked->issued_at = now();
            $locked->warning_acknowledged_at = $warnings !== [] ? now() : null;
            $locked->updated_by = $actorId;
            $locked->save();

            $this->recalculatePaymentState($locked);

            $this->audit->record(
                $locked,
                $previous ? 'correction_issued' : 'issued',
                $actorId,
                $locked->correction_reason,
                $before,
                $this->snapshot($locked),
            );

            return $locked->fresh($this->relations());
        }, 3);
    }

    public function startCorrection(
        FinancialDocument $document,
        string $reason,
        int $actorId,
    ): FinancialDocument {
        return DB::transaction(function () use ($document, $reason, $actorId): FinancialDocument {
            $locked = FinancialDocument::query()
                ->with('lines')
                ->lockForUpdate()
                ->findOrFail($document->id);

            if (! in_array($locked->status, ['issued', 'partially_paid', 'paid', 'overpaid'], true)) {
                throw ValidationException::withMessages([
                    'status' => ['Only active issued documents can be corrected.'],
                ]);
            }

            $existing = FinancialDocument::query()
                ->where('corrected_from_id', $locked->id)
                ->where('status', 'draft')
                ->first();

            if ($existing) {
                return $existing->fresh($this->relations());
            }

            $revision = (int) $locked->revision + 1;
            $root = FinancialDocument::query()->findOrFail($locked->root_document_id ?: $locked->id);

            $replacement = FinancialDocument::create([
                'root_document_id' => $root->id,
                'corrected_from_id' => $locked->id,
                'party_id' => $locked->party_id,
                'warehouse_id' => $locked->warehouse_id,
                'department_id' => $locked->department_id,
                'kind' => $locked->kind,
                'number' => $root->number.'-R'.$revision,
                'external_number' => $locked->external_number,
                'revision' => $revision,
                'status' => 'draft',
                'issue_date' => now()->toDateString(),
                'due_date' => $locked->due_date?->format('Y-m-d'),
                'activity_type' => $locked->activity_type,
                'market_type' => $locked->market_type,
                'branch_label' => $locked->branch_label,
                'currency' => $locked->currency,
                'exchange_rate' => $locked->exchange_rate,
                'subtotal' => $locked->subtotal,
                'discount_total' => $locked->discount_total,
                'tax_total' => $locked->tax_total,
                'shipping_total' => $locked->shipping_total,
                'total' => $locked->total,
                'paid_total' => '0',
                'balance_due' => $locked->total,
                'credit_total' => '0',
                'payment_terms' => $locked->payment_terms,
                'notes' => $locked->notes,
                'internal_notes' => $locked->internal_notes,
                'correction_reason' => $reason,
                'created_by' => $actorId,
                'updated_by' => $actorId,
            ]);

            foreach ($locked->lines as $line) {
                FinancialDocumentLine::create([
                    'financial_document_id' => $replacement->id,
                    'product_id' => $line->product_id,
                    'warehouse_id' => $line->warehouse_id,
                    'tax_rule_id' => $line->tax_rule_id,
                    'position' => $line->position,
                    'description' => $line->description,
                    'sku_snapshot' => $line->sku_snapshot,
                    'unit_snapshot' => $line->unit_snapshot,
                    'quantity' => $line->quantity,
                    'unit_price' => $line->unit_price,
                    'cost_price_snapshot' => $line->cost_price_snapshot,
                    'price_status' => $line->price_status,
                    'discount_percent' => $line->discount_percent,
                    'discount_type' => $line->discount_type,
                    'discount_value' => $line->discount_value,
                    'tax_name_snapshot' => $line->tax_name_snapshot,
                    'tax_rate' => $line->tax_rate,
                    'line_subtotal' => $line->line_subtotal,
                    'line_discount' => $line->line_discount,
                    'line_tax' => $line->line_tax,
                    'line_total' => $line->line_total,
                    'affects_inventory' => $line->affects_inventory,
                ]);
            }

            $this->audit->record(
                $locked,
                'correction_started',
                $actorId,
                $reason,
                $this->snapshot($locked),
                ['replacement_document_id' => $replacement->id],
            );

            return $replacement->fresh($this->relations());
        }, 3);
    }

    public function void(FinancialDocument $document, string $reason, int $actorId): FinancialDocument
    {
        return DB::transaction(function () use ($document, $reason, $actorId): FinancialDocument {
            $locked = FinancialDocument::query()
                ->with('lines')
                ->lockForUpdate()
                ->findOrFail($document->id);

            if (! in_array($locked->status, ['issued', 'partially_paid'], true)) {
                throw ValidationException::withMessages([
                    'status' => ['This document cannot be voided.'],
                ]);
            }

            $hasBlockingAllocations = CashAllocation::query()
                ->where('financial_document_id', $locked->id)
                ->whereHas('movement', function ($query): void {
                    $query
                        ->where('status', 'draft')
                        ->orWhere(function ($posted): void {
                            $posted
                                ->where('status', 'posted')
                                ->where(function ($effective): void {
                                    $effective
                                        ->where('method', '!=', 'check')
                                        ->orWhereNull('check_status')
                                        ->orWhereNotIn('check_status', ['bounced', 'cancelled']);
                                });
                        });
                })
                ->exists();

            if ($hasBlockingAllocations) {
                throw ValidationException::withMessages([
                    'payments' => ['Remove linked draft allocations, or reverse/correct active posted payments, before voiding this document.'],
                ]);
            }

            $before = $this->snapshot($locked);

            $this->inventory->applyDocumentDelta(
                $locked,
                null,
                $actorId,
                $locked->id,
            );

            $locked->status = 'voided';
            $locked->updated_by = $actorId;
            $locked->save();

            $this->audit->record(
                $locked,
                'voided',
                $actorId,
                $reason,
                $before,
                $this->snapshot($locked),
            );

            return $locked->fresh($this->relations());
        }, 3);
    }

    public function recalculatePaymentState(FinancialDocument $document): void
    {
        if (in_array($document->status, ['draft', 'superseded', 'voided'], true)) {
            return;
        }

        $paid = (float) CashAllocation::query()
            ->where('financial_document_id', $document->id)
            ->whereHas('movement', function ($query): void {
                $query
                    ->where('status', 'posted')
                    ->where(function ($movement): void {
                        $movement
                            ->where('method', '!=', 'check')
                            ->orWhereNull('check_status')
                            ->orWhereNotIn('check_status', ['bounced', 'cancelled']);
                    });
            })
            ->sum('amount');

        $total = (float) $document->total;
        $balance = max($total - $paid, 0);
        $credit = max($paid - $total, 0);

        $document->paid_total = number_format($paid, 4, '.', '');
        $document->balance_due = number_format($balance, 4, '.', '');
        $document->credit_total = number_format($credit, 4, '.', '');

        if ($paid <= 0) {
            $document->status = 'issued';
        } elseif ($paid < $total) {
            $document->status = 'partially_paid';
        } elseif ($paid > $total) {
            $document->status = 'overpaid';
        } else {
            $document->status = 'paid';
        }

        $document->save();
    }

    /** @return list<string> */
    public function warnings(FinancialDocument $document): array
    {
        $document->loadMissing('lines.product');
        $warnings = [];

        foreach ($document->lines as $line) {
            $product = $line->product;

            if (! $product) {
                continue;
            }

            $baseline = (float) ($document->isSale() ? $product->unit_price : $product->cost_price);
            $entered = (float) $line->unit_price;

            if ($baseline <= 0 || $entered <= 0) {
                continue;
            }

            $ratio = $entered / $baseline;

            if ($ratio >= 5 || $ratio <= 0.2) {
                $warnings[] = sprintf(
                    '%s: entered unit price %s differs sharply from the catalog reference %s.',
                    $line->description,
                    $line->unit_price,
                    $document->isSale() ? $product->unit_price : $product->cost_price,
                );
            }
        }

        if ($document->kind === 'purchase_invoice') {
            $duplicates = FinancialDocument::query()
                ->where('id', '!=', $document->id)
                ->where('kind', 'purchase_invoice')
                ->where('party_id', $document->party_id)
                ->whereIn('status', [
                    'draft',
                    'issued',
                    'partially_paid',
                    'paid',
                    'overpaid',
                ])
                ->where(function ($query) use ($document): void {
                    if ($document->external_number) {
                        $query->where(
                            'external_number',
                            $document->external_number,
                        );
                    }

                    $query->orWhere(function ($similar) use ($document): void {
                        $similar
                            ->whereBetween('issue_date', [
                                $document->issue_date
                                    ->copy()
                                    ->subDays(3)
                                    ->format('Y-m-d'),
                                $document->issue_date
                                    ->copy()
                                    ->addDays(3)
                                    ->format('Y-m-d'),
                            ])
                            ->whereRaw(
                                'ABS(total - ?) <= 0.0001',
                                [(float) $document->total],
                            );
                    });
                })
                ->latest('id')
                ->limit(3)
                ->get([
                    'id',
                    'number',
                    'external_number',
                    'issue_date',
                    'total',
                ]);

            foreach ($duplicates as $duplicate) {
                $warnings[] = sprintf(
                    'Possible duplicate purchase invoice: %s%s on %s for %s.',
                    $duplicate->number,
                    $duplicate->external_number
                        ? ' / supplier ref '.$duplicate->external_number
                        : '',
                    $duplicate->issue_date?->format('Y-m-d') ?? 'unknown date',
                    $duplicate->total,
                );
            }
        }

        return $warnings;
    }

    /** @return array<string, mixed> */
    private function headerPayload(array $data): array
    {
        return [
            'party_id' => $data['party_id'],
            'warehouse_id' => $data['warehouse_id'] ?? null,
            'department_id' => $data['department_id'] ?? null,
            'kind' => $data['kind'],
            'external_number' => $data['external_number'] ?? null,
            'issue_date' => $data['issue_date'],
            'due_date' => $data['due_date'] ?? null,
            'activity_type' => $data['activity_type'] ?? null,
            'market_type' => $data['market_type'] ?? null,
            'branch_label' => $data['branch_label'] ?? null,
            'currency' => $data['currency'],
            'exchange_rate' => $data['exchange_rate'] ?? '1',
            'payment_terms' => $data['payment_terms'] ?? null,
            'notes' => $data['notes'] ?? null,
            'internal_notes' => $data['internal_notes'] ?? null,
        ];
    }

    private function syncLines(FinancialDocument $document, array $lines): void
    {
        $document->lines()->delete();

        $productIds = collect($lines)
            ->pluck('product_id')
            ->filter()
            ->map(fn ($id) => (int) $id);

        if ($productIds->count() !== $productIds->unique()->count()) {
            throw ValidationException::withMessages([
                'lines' => ['The same product cannot appear twice on one invoice. Increase the quantity on the existing line instead.'],
            ]);
        }

        $manualDescriptions = collect($lines)
            ->filter(fn (array $line): bool => empty($line['product_id']))
            ->map(fn (array $line): string => mb_strtolower(trim((string) ($line['description'] ?? ''))))
            ->filter();

        if ($manualDescriptions->count() !== $manualDescriptions->unique()->count()) {
            throw ValidationException::withMessages([
                'lines' => ['The same manual line cannot appear twice on one invoice. Increase the quantity or edit the existing line instead.'],
            ]);
        }

        foreach (array_values($lines) as $index => $line) {
            $product = isset($line['product_id']) && $line['product_id']
                ? Product::query()->findOrFail((int) $line['product_id'])
                : null;

            $taxRule = isset($line['tax_rule_id']) && $line['tax_rule_id']
                ? TaxRule::query()->findOrFail((int) $line['tax_rule_id'])
                : null;

            if ($taxRule) {
                $requiredScope = $document->isSale() ? 'sales' : 'purchases';

                if (
                    ! $taxRule->active
                    || ! in_array($taxRule->applies_to, ['both', $requiredScope], true)
                    || ($taxRule->effective_from && $document->issue_date->lt($taxRule->effective_from))
                    || ($taxRule->effective_to && $document->issue_date->gt($taxRule->effective_to))
                ) {
                    throw ValidationException::withMessages([
                        "lines.$index.tax_rule_id" => ['The selected tax rule is not valid for this document date and transaction type.'],
                    ]);
                }
            }

            $warehouseId = $line['warehouse_id'] ?? $document->warehouse_id;

            if ($warehouseId) {
                Warehouse::query()->findOrFail((int) $warehouseId);
            }

            if (! $product && trim((string) ($line['description'] ?? '')) === '') {
                throw ValidationException::withMessages([
                    "lines.$index.description" => ['A description is required for a manual line.'],
                ]);
            }

            $quantity = (float) $line['quantity'];
            $unitPrice = (float) $line['unit_price'];
            $priceStatus = $document->isPurchase()
                ? ($line['price_status'] ?? 'final')
                : 'final';
            $discountType = in_array(
                ($line['discount_type'] ?? 'percent'),
                ['percent', 'fixed'],
                true,
            )
                ? ($line['discount_type'] ?? 'percent')
                : 'percent';
            $discountValue = (float) (
                $line['discount_value']
                ?? $line['discount_percent']
                ?? 0
            );
            $subtotal = round($quantity * $unitPrice, 4);

            if ($discountType === 'percent' && ($discountValue < 0 || $discountValue > 100)) {
                throw ValidationException::withMessages([
                    "lines.$index.discount_value" => ['Percentage discount must be between 0 and 100.'],
                ]);
            }

            if ($discountType === 'fixed' && ($discountValue < 0 || $discountValue > $subtotal)) {
                throw ValidationException::withMessages([
                    "lines.$index.discount_value" => ['Fixed discount cannot exceed the line subtotal.'],
                ]);
            }

            $discountPercent = $discountType === 'percent'
                ? $discountValue
                : 0;
            $discount = $discountType === 'fixed'
                ? round($discountValue, 4)
                : round($subtotal * ($discountValue / 100), 4);
            $taxRate = (float) ($taxRule?->rate ?? $line['tax_rate'] ?? 0);
            $taxable = max($subtotal - $discount, 0);

            if ($taxRule?->inclusive && $taxRate > 0) {
                $tax = round($taxable - ($taxable / (1 + ($taxRate / 100))), 4);
                $total = $taxable;
            } else {
                $tax = round($taxable * ($taxRate / 100), 4);
                $total = round($taxable + $tax, 4);
            }

            $affectsInventory = (bool) ($line['affects_inventory'] ?? false);

            if ($affectsInventory && (! $product || ! $product->tracksInventory() || ! $warehouseId)) {
                throw ValidationException::withMessages([
                    "lines.$index.affects_inventory" => ['Inventory impact requires a tracked product and warehouse.'],
                ]);
            }

            FinancialDocumentLine::create([
                'financial_document_id' => $document->id,
                'product_id' => $product?->id,
                'warehouse_id' => $warehouseId,
                'tax_rule_id' => $taxRule?->id,
                'position' => $index + 1,
                'description' => $line['description'] ?? $product?->name ?? 'Line item',
                'sku_snapshot' => $product?->sku,
                'unit_snapshot' => $line['unit'] ?? $product?->unit,
                'quantity' => number_format($quantity, 4, '.', ''),
                'unit_price' => number_format($unitPrice, 4, '.', ''),
                'cost_price_snapshot' => $product?->cost_price,
                'price_status' => $priceStatus,
                'discount_percent' => number_format($discountPercent, 4, '.', ''),
                'discount_type' => $discountType,
                'discount_value' => number_format($discountValue, 4, '.', ''),
                'tax_name_snapshot' => $taxRule?->name,
                'tax_rate' => number_format($taxRate, 4, '.', ''),
                'line_subtotal' => number_format($subtotal, 4, '.', ''),
                'line_discount' => number_format($discount, 4, '.', ''),
                'line_tax' => number_format($tax, 4, '.', ''),
                'line_total' => number_format($total, 4, '.', ''),
                'affects_inventory' => $affectsInventory,
            ]);
        }
    }

    private function recalculateTotals(FinancialDocument $document, string $shippingTotal): void
    {
        $document->load('lines');
        $subtotal = (float) $document->lines->sum(fn ($line) => (float) $line->line_subtotal);
        $discount = (float) $document->lines->sum(fn ($line) => (float) $line->line_discount);
        $tax = (float) $document->lines->sum(fn ($line) => (float) $line->line_tax);
        $linesTotal = (float) $document->lines->sum(fn ($line) => (float) $line->line_total);
        $shipping = max((float) $shippingTotal, 0);
        $total = round($linesTotal + $shipping, 4);

        $document->subtotal = number_format($subtotal, 4, '.', '');
        $document->discount_total = number_format($discount, 4, '.', '');
        $document->tax_total = number_format($tax, 4, '.', '');
        $document->shipping_total = number_format($shipping, 4, '.', '');
        $document->total = number_format($total, 4, '.', '');
        $document->paid_total = '0.0000';
        $document->balance_due = number_format($total, 4, '.', '');
        $document->credit_total = '0.0000';
        $document->save();
    }

    private function assertHeaderReferences(array $data): void
    {
        if ($data['warehouse_id'] ?? null) {
            Warehouse::query()
                ->findOrFail((int) $data['warehouse_id']);
        }

        if ($data['department_id'] ?? null) {
            Department::query()
                ->findOrFail((int) $data['department_id']);
        }
    }

    private function assertPartyRole(int $partyId, string $kind): void
    {
        $required = $kind === 'sale_invoice' ? 'customer' : 'supplier';

        $valid = Party::query()
            ->whereKey($partyId)
            ->usableForNewBusiness()
            ->whereHas('roles', fn ($query) => $query->where('role', $required))
            ->exists();

        if (! $valid) {
            throw ValidationException::withMessages([
                'party_id' => ["The selected party must have the {$required} role."],
            ]);
        }
    }

    /** @return array<int, string> */
    private function relations(): array
    {
        return [
            'party.roles',
            'warehouse',
            'department',
            'lines.product',
            'lines.warehouse',
            'lines.taxRule',
            'allocations.movement',
        ];
    }

    /** @return array<string, mixed> */
    private function snapshot(FinancialDocument $document): array
    {
        $document->loadMissing('lines');

        return [
            'id' => $document->id,
            'number' => $document->number,
            'status' => $document->status,
            'party_id' => $document->party_id,
            'issue_date' => $document->issue_date?->format('Y-m-d'),
            'due_date' => $document->due_date?->format('Y-m-d'),
            'currency' => $document->currency,
            'subtotal' => $document->subtotal,
            'tax_total' => $document->tax_total,
            'total' => $document->total,
            'lines' => $document->lines->map(fn ($line) => [
                'product_id' => $line->product_id,
                'description' => $line->description,
                'quantity' => $line->quantity,
                'unit_price' => $line->unit_price,
                'discount_type' => $line->discount_type,
                'discount_value' => $line->discount_value,
                'line_discount' => $line->line_discount,
                'line_total' => $line->line_total,
            ])->all(),
        ];
    }
}
