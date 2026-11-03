<?php

namespace App\Services\Finance;

use App\Models\FinancialDocument;
use App\Models\Party;
use App\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;

/**
 * Walk-in (متفرقات) sales: an anonymous customer, no manual payment step. Each sale is
 * issued as its own invoice and settled by a same-day cash receipt in one transaction.
 */
class MiscSaleService
{
    public const PARTY_NAME = 'متفرقات';

    public function __construct(
        private readonly FinanceDocumentService $documents,
        private readonly CashMovementService $cash,
        private readonly TenantContext $tenant,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data, int $actorId): FinancialDocument
    {
        return DB::transaction(function () use ($data, $actorId): FinancialDocument {
            $party = $this->party();
            $currency = strtoupper((string) ($this->tenant->organization()->preferences['currency'] ?? 'ILS'));
            $date = (string) $data['issue_date'];

            $draft = $this->documents->createDraft([
                'kind' => 'sale_invoice',
                'is_misc_sale' => true,
                'party_id' => $party->id,
                'warehouse_id' => null,
                'department_id' => null,
                'external_number' => null,
                'issue_date' => $date,
                'due_date' => null,
                'activity_type' => 'trade',
                'market_type' => 'local',
                'branch_label' => null,
                'currency' => $currency,
                'exchange_rate' => '1',
                'shipping_total' => '0',
                'payment_terms' => null,
                'notes' => $data['notes'] ?? null,
                'internal_notes' => null,
                'document_discount_type' => $data['document_discount_type'] ?? 'percent',
                'document_discount_value' => $data['document_discount_value'] ?? '0',
                'lines' => collect($data['lines'])->map(fn (array $line): array => [
                    'product_id' => $line['product_id'] ?? null,
                    'warehouse_id' => null,
                    'tax_rule_id' => null,
                    'description' => $line['description'] ?? null,
                    'unit' => $line['unit'] ?? null,
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'price_status' => 'final',
                    'discount_percent' => '0',
                    'discount_type' => 'percent',
                    'discount_value' => '0',
                    'tax_rate' => $line['tax_rate'] ?? '0',
                    'affects_inventory' => false,
                ])->all(),
            ], $actorId);

            $invoice = $this->documents->issue($draft, $actorId, true);
            $total = number_format((float) $invoice->total, 4, '.', '');

            $receipt = $this->cash->createDraft([
                'direction' => 'incoming',
                'is_misc_sale' => true,
                'party_id' => $party->id,
                'government_obligation_id' => null,
                'department_id' => null,
                'category' => 'customer_receipt',
                'amount' => $total,
                'currency' => $currency,
                'movement_date' => $date,
                'method' => 'cash',
                'account_label' => null,
                'branch_label' => null,
                'cost_center' => null,
                'reference' => $invoice->number,
                'check_number' => null,
                'check_bank' => null,
                'check_due_date' => null,
                'check_status' => null,
                'notes' => 'قبض نقدي لمبيعات متفرقات',
                'allocations' => [['financial_document_id' => $invoice->id, 'amount' => $total]],
            ], $actorId);

            $this->cash->post($receipt, $actorId);

            return $invoice->fresh();
        }, 3);
    }

    public function party(): Party
    {
        $party = Party::query()
            ->where(fn ($query) => $query->where('company_name', self::PARTY_NAME)->orWhere('name', self::PARTY_NAME))
            ->first();

        if (! $party) {
            $party = Party::create(['type' => 'company', 'company_name' => self::PARTY_NAME, 'name' => self::PARTY_NAME]);
        }

        if (! $party->roles()->where('role', 'customer')->exists()) {
            $party->roles()->create(['role' => 'customer']);
        }

        return $party;
    }
}
