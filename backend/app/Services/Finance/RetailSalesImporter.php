<?php

namespace App\Services\Finance;

use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\Product;
use App\Services\Products\InvoiceProductBackfill;
use App\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class RetailSalesImporter
{
    public const PARTY_NAME = 'متفرقات';

    public function __construct(
        private readonly InvoiceProductBackfill $names,
        private readonly FinanceDocumentService $documents,
        private readonly CashMovementService $cash,
        private readonly TenantContext $tenant,
    ) {}

    /**
     * Read "sale id, date, item, quantity, unit price" rows from the legacy
     * SQL dump and group them into one invoice per day (the system allows a
     * single sales invoice per customer per day). Identical item and price
     * lines of the same day are added together.
     *
     * @return array<string, array{id: string, date: string, sale_count: int, lines: list<array{name: string, quantity: string, price: string}>}>
     */
    public function parse(string $path): array
    {
        if (! is_file($path)) {
            throw new RuntimeException("File not found: {$path}");
        }

        $sales = [];

        foreach (file($path) as $line) {
            if (preg_match("/VALUES\('([^']*)', '(\d{4}-\d{2}-\d{2})', '([^']*)', ([\d.]+), ([\d.]+)\)/u", $line, $match) !== 1) {
                continue;
            }

            $key = 'retail-'.$match[2];
            $lineKey = $this->names->normalize($match[3]);

            $sales[$key]['id'] = $key;
            $sales[$key]['date'] = $match[2];
            $sales[$key]['sale_ids'][$match[1]] = true;

            $sales[$key]['lines'][$lineKey]['name'] ??= $match[3];
            $sales[$key]['lines'][$lineKey]['quantity'] = ($sales[$key]['lines'][$lineKey]['quantity'] ?? 0) + (float) $match[4];
            $sales[$key]['lines'][$lineKey]['amount'] = ($sales[$key]['lines'][$lineKey]['amount'] ?? 0) + (float) $match[4] * (float) $match[5];
            $sales[$key]['lines'][$lineKey]['parts'][$match[5]] = ($sales[$key]['lines'][$lineKey]['parts'][$match[5]] ?? 0) + (float) $match[4];
        }

        foreach ($sales as $key => $sale) {
            $sales[$key]['sale_count'] = count($sale['sale_ids']);
            $sales[$key]['lines'] = array_values(array_map(function (array $line): array {
                $mixed = count($line['parts']) > 1;

                return [
                    'name' => $line['name'],
                    'quantity' => number_format($line['quantity'], 4, '.', ''),
                    'price' => $mixed
                        ? number_format($line['amount'] / $line['quantity'], 4, '.', '')
                        : (string) array_key_first($line['parts']),
                    'amount' => $line['amount'],
                    'detail' => $mixed
                        ? $line['name'].': '.implode(' + ', array_map(fn ($price, $quantity): string => $quantity.' × '.$price, array_keys($line['parts']), $line['parts']))
                        : null,
                ];
            }, $sale['lines']));
            unset($sales[$key]['sale_ids']);
        }

        ksort($sales);

        return $sales;
    }

    /**
     * Describe what would be imported: products that cannot be matched,
     * sales that already exist and the expected total.
     *
     * @param  array<string, array<string, mixed>>  $sales
     * @return array{new: int, existing: int, total: string, unmatched: list<string>}
     */
    public function plan(array $sales): array
    {
        $products = $this->productsByKey();
        $existing = FinancialDocument::query()->where('kind', 'sale_invoice')->whereIn('external_number', array_keys($sales))->pluck('external_number')->all();
        $unmatched = [];
        $total = 0.0;

        foreach ($sales as $id => $sale) {
            if (in_array($id, $existing, true)) {
                continue;
            }

            foreach ($sale['lines'] as $line) {
                if (! isset($products[$this->names->normalize($line['name'])])) {
                    $unmatched[$line['name']] = $line['name'];
                }

                $total += (float) $line['amount'];
            }
        }

        return [
            'new' => count($sales) - count($existing),
            'existing' => count($existing),
            'total' => number_format($total, 2, '.', ''),
            'unmatched' => array_values($unmatched),
        ];
    }

    /**
     * Create each sale as an issued invoice for the walk-in customer and
     * record the cash receipt that settled it on the same day.
     *
     * @param  array<string, array<string, mixed>>  $sales
     * @return array{created: int, skipped: int}
     */
    public function apply(array $sales, int $actorId): array
    {
        $products = $this->productsByKey();
        $currency = strtoupper((string) ($this->tenant->organization()->preferences['currency'] ?? 'ILS'));
        $party = $this->walkInCustomer();
        $created = 0;
        $skipped = 0;

        foreach ($sales as $id => $sale) {
            $exists = FinancialDocument::query()->where('kind', 'sale_invoice')->where('external_number', $id)->exists();

            if ($exists) {
                $skipped++;

                continue;
            }

            DB::transaction(function () use ($id, $sale, $products, $currency, $party, $actorId): void {
                $lines = [];

                foreach ($sale['lines'] as $line) {
                    $product = $products[$this->names->normalize($line['name'])] ?? null;

                    if (! $product) {
                        throw new RuntimeException("No product matches '{$line['name']}'.");
                    }

                    $lines[] = [
                        'product_id' => $product->id,
                        'warehouse_id' => null,
                        'tax_rule_id' => null,
                        'description' => $product->name,
                        'unit' => $product->unit,
                        'quantity' => $line['quantity'],
                        'unit_price' => $line['price'],
                        'price_status' => 'final',
                        'discount_percent' => '0',
                        'discount_type' => 'percent',
                        'discount_value' => '0',
                        'tax_rate' => (string) $product->tax_rate,
                        'affects_inventory' => false,
                    ];
                }

                $draft = $this->documents->createDraft([
                    'kind' => 'sale_invoice',
                    'party_id' => $party->id,
                    'warehouse_id' => null,
                    'department_id' => null,
                    'external_number' => $id,
                    'issue_date' => $sale['date'],
                    'due_date' => null,
                    'activity_type' => 'trade',
                    'market_type' => 'local',
                    'branch_label' => null,
                    'currency' => $currency,
                    'exchange_rate' => '1',
                    'shipping_total' => '0',
                    'payment_terms' => null,
                    'notes' => trim('مبيعات متفرقات (مستورد من retails) '.implode(' | ', array_filter(array_column($sale['lines'], 'detail')))),
                    'internal_notes' => 'Legacy retail sales of '.$sale['date'].' ('.$sale['sale_count'].' sales)',
                    'lines' => $lines,
                ], $actorId);

                $invoice = $this->documents->issue($draft, $actorId, true);
                $total = number_format((float) $invoice->total, 4, '.', '');

                $receipt = $this->cash->createDraft([
                    'direction' => 'incoming',
                    'party_id' => $party->id,
                    'government_obligation_id' => null,
                    'department_id' => null,
                    'category' => 'customer_receipt',
                    'amount' => $total,
                    'currency' => $currency,
                    'movement_date' => $sale['date'],
                    'method' => 'cash',
                    'account_label' => null,
                    'branch_label' => null,
                    'cost_center' => null,
                    'reference' => $id,
                    'check_number' => null,
                    'check_bank' => null,
                    'check_due_date' => null,
                    'check_status' => null,
                    'notes' => 'قبض نقدي لمبيعات متفرقات',
                    'allocations' => [['financial_document_id' => $invoice->id, 'amount' => $total]],
                ], $actorId);

                $this->cash->post($receipt, $actorId);
            }, 3);

            $created++;
        }

        return ['created' => $created, 'skipped' => $skipped];
    }

    /** @return array<string, Product> */
    private function productsByKey(): array
    {
        return Product::query()->get()->keyBy(fn (Product $product): string => $this->names->normalize($product->name))->all();
    }

    private function walkInCustomer(): Party
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
