<?php

namespace App\Services\Inventory;

use App\Enums\ProductType;
use App\Enums\StockMovementType;
use App\Models\Product;
use App\Models\ProductionRecipe;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Services\Production\ProductionRunNumberGenerator;
use App\Services\Products\InvoiceProductBackfill;
use App\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class HistoricalStockBackfill
{
    private const EFFECT_STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'overpaid'];

    public function __construct(
        private readonly InvoiceProductBackfill $names,
        private readonly ProductionRunNumberGenerator $runNumbers,
        private readonly TenantContext $tenant,
    ) {}

    /**
     * Build the dated ledger (production in, purchases in, sales out) with
     * running balances, without writing anything.
     *
     * @param  list<array{date: string, name: string, quantity: string}>  $production
     * @return array{
     *     entries: list<array<string, mixed>>,
     *     balances: array<string, string>,
     *     missingProducts: array<string, string>
     * }
     */
    public function plan(array $production): array
    {
        $byKey = Product::query()->get()->keyBy(fn (Product $product): string => $this->names->normalize($product->name));
        $entries = [];
        $missing = [];

        $recipes = $this->activeRecipes();

        foreach ($production as $uid => $row) {
            $key = $this->names->normalize($row['name']);
            $product = $byKey[$key] ?? null;
            $recipe = $product ? ($recipes[$product->id] ?? null) : null;

            if (! $product) {
                $missing[$key] = $row['name'];
            }

            $entries[] = [
                'date' => $row['date'],
                'order' => 0,
                'product_key' => $key,
                'product_id' => $product?->id,
                'delta' => $this->units($row['quantity']),
                'type' => StockMovementType::ProductionIn,
                'reference_id' => null,
                'line_id' => null,
                'uid' => $uid,
                'recipe_id' => $recipe['recipe_id'] ?? null,
            ];

            foreach ($recipe['materials'] ?? [] as $material) {
                $entries[] = [
                    'date' => $row['date'],
                    'order' => 2,
                    'product_key' => $material['key'],
                    'product_id' => $material['id'],
                    'delta' => -(int) round(((float) $row['quantity']) * (float) $material['quantity_per_unit'] * 10000),
                    'type' => StockMovementType::ProductionOut,
                    'reference_id' => null,
                    'line_id' => null,
                    'for_uid' => $uid,
                    'optional' => $material['optional'],
                ];
            }
        }

        $lines = DB::table('financial_document_lines as l')
            ->join('financial_documents as d', 'd.id', '=', 'l.financial_document_id')
            ->join('products as p', 'p.id', '=', 'l.product_id')
            ->where('l.organization_id', $this->tenant->id())
            ->whereIn('d.status', self::EFFECT_STATUSES)
            ->whereIn('d.kind', ['sale_invoice', 'purchase_invoice'])
            ->where('p.type', '!=', ProductType::Service->value)
            ->where('l.quantity', '>', 0)
            ->orderBy('d.issue_date')
            ->orderBy('l.id')
            ->get(['l.id', 'l.product_id', 'l.quantity', 'd.id as document_id', 'd.kind', 'd.issue_date', 'p.name']);

        foreach ($lines as $line) {
            $isSale = $line->kind === 'sale_invoice';
            $units = $this->units($line->quantity);

            $entries[] = [
                'date' => substr((string) $line->issue_date, 0, 10),
                'order' => $isSale ? 3 : 1,
                'product_key' => $this->names->normalize($line->name),
                'product_id' => (int) $line->product_id,
                'delta' => $isSale ? -$units : $units,
                'type' => $isSale ? StockMovementType::Sale : StockMovementType::Purchase,
                'reference_id' => (int) $line->document_id,
                'line_id' => (int) $line->id,
            ];
        }

        usort($entries, fn (array $a, array $b): int => [$a['date'], $a['order']] <=> [$b['date'], $b['order']]);

        $entries = $this->limitOptionalConsumption($entries);
        $entries = $this->addOpeningBalances($entries);

        $running = [];

        foreach ($entries as $index => $entry) {
            $running[$entry['product_key']] = ($running[$entry['product_key']] ?? 0) + $entry['delta'];
            $entries[$index]['balance_after'] = $running[$entry['product_key']];
        }

        return [
            'entries' => $entries,
            'balances' => array_map(fn (int $units): string => $this->fromUnits($units), $running),
            'missingProducts' => $missing,
        ];
    }

    /**
     * Write production runs, stock movements, balances and the inventory flag
     * on invoice lines in one transaction.
     *
     * @param  array<string, mixed>  $plan
     * @return array{runs: int, movements: int, products_created: int}
     */
    public function apply(array $plan): array
    {
        if (StockMovement::query()->exists()) {
            throw new RuntimeException('Stock movements already exist; refusing to backfill twice.');
        }

        return DB::transaction(function () use ($plan): array {
            $organizationId = $this->tenant->id();
            $warehouseId = (int) Warehouse::query()->where('is_default', true)->value('id');
            $now = now();
            $created = 0;
            $productIds = [];

            foreach ($plan['missingProducts'] as $key => $name) {
                $product = Product::query()->create([
                    'type' => ProductType::Product,
                    'name' => $name,
                    'unit' => 'piece',
                    'unit_price' => 0,
                    'cost_price' => 0,
                    'tax_rate' => 0,
                    'track_inventory' => true,
                ]);
                $productIds[$key] = $product->id;
                $created++;
            }

            $runs = 0;
            $balanceOf = [];
            $outputOf = [];
            $materialLines = [];

            foreach ($plan['entries'] as $entry) {
                $productId = $entry['product_id'] ?? $productIds[$entry['product_key']];
                $stamp = $entry['date'].' 12:00:00';
                $quantity = $this->fromUnits($entry['delta']);

                $movementId = DB::table('stock_movements')->insertGetId([
                    'organization_id' => $organizationId,
                    'warehouse_id' => $warehouseId,
                    'product_id' => $productId,
                    'type' => $entry['type']->value,
                    'quantity' => $quantity,
                    'balance_after' => $this->fromUnits($entry['balance_after']),
                    'reference_type' => $entry['reference_id'] ? 'financial_document' : null,
                    'reference_id' => $entry['reference_id'],
                    'note' => 'Historical backfill',
                    'created_at' => $stamp,
                    'updated_at' => $stamp,
                ]);

                $balanceOf[$productId] = $entry['balance_after'];

                if ($entry['type'] === StockMovementType::Opening) {
                    DB::table('stock_movements')->where('id', $movementId)->update(['note' => 'Estimated opening balance (stock held before records began)']);

                    continue;
                }

                if ($entry['line_id']) {
                    DB::table('financial_document_lines')
                        ->where('id', $entry['line_id'])
                        ->update(['affects_inventory' => true, 'warehouse_id' => $warehouseId]);

                    continue;
                }

                if (isset($entry['for_uid'])) {
                    $outputId = $outputOf[$entry['for_uid']];
                    $materialLines[$outputId] = ($materialLines[$outputId] ?? 0) + 1;

                    $materialId = DB::table('production_run_materials')->insertGetId([
                        'organization_id' => $organizationId,
                        'production_run_output_id' => $outputId,
                        'line_number' => $materialLines[$outputId],
                        'raw_material_id' => $productId,
                        'warehouse_id' => $warehouseId,
                        'actual_quantity' => $this->fromUnits(-$entry['delta']),
                        'created_at' => $stamp,
                        'updated_at' => $stamp,
                    ]);

                    DB::table('stock_movements')->where('id', $movementId)->update(['production_run_material_id' => $materialId]);

                    continue;
                }

                $runId = DB::table('production_runs')->insertGetId([
                    'organization_id' => $organizationId,
                    'run_number' => $this->runNumbers->next(),
                    'occurred_on' => $entry['date'],
                    'status' => 'posted',
                    'revision' => 1,
                    'note' => 'Historical import',
                    'posted_at' => $stamp,
                    'created_at' => $stamp,
                    'updated_at' => $stamp,
                ]);

                $outputId = DB::table('production_run_outputs')->insertGetId([
                    'organization_id' => $organizationId,
                    'production_run_id' => $runId,
                    'line_number' => 1,
                    'product_id' => $productId,
                    'warehouse_id' => $warehouseId,
                    'production_recipe_id' => $entry['recipe_id'] ?? null,
                    'quantity' => $quantity,
                    'posted_movement_id' => $movementId,
                    'created_at' => $stamp,
                    'updated_at' => $stamp,
                ]);

                DB::table('stock_movements')->where('id', $movementId)->update(['production_run_output_id' => $outputId]);
                $outputOf[$entry['uid']] = $outputId;
                $runs++;
            }

            foreach ($balanceOf as $productId => $units) {
                DB::table('inventory_balances')->insert([
                    'organization_id' => $organizationId,
                    'warehouse_id' => $warehouseId,
                    'product_id' => $productId,
                    'on_hand' => $this->fromUnits($units),
                    'reserved' => '0.0000',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            Product::query()
                ->whereIn('id', array_keys($balanceOf))
                ->update(['track_inventory' => true]);

            return ['runs' => $runs, 'movements' => count($plan['entries']), 'products_created' => $created];
        });
    }

    /**
     * Optional components (e.g. a filler) are consumed only while stock
     * lasts: cap each consumption at the running balance and drop it when
     * nothing is left.
     *
     * @param  list<array<string, mixed>>  $entries
     * @return list<array<string, mixed>>
     */
    private function limitOptionalConsumption(array $entries): array
    {
        $running = [];
        $kept = [];

        foreach ($entries as $entry) {
            $key = $entry['product_key'];

            if ($entry['optional'] ?? false) {
                $use = min(-$entry['delta'], max(0, $running[$key] ?? 0));

                if ($use <= 0) {
                    continue;
                }

                $entry['delta'] = -$use;
            }

            $running[$key] = ($running[$key] ?? 0) + $entry['delta'];
            $kept[] = $entry;
        }

        return $kept;
    }

    /**
     * Add an estimated opening balance for every product whose running
     * balance would dip below zero, so no stock is ever negative.
     *
     * @param  list<array<string, mixed>>  $entries
     * @return list<array<string, mixed>>
     */
    private function addOpeningBalances(array $entries): array
    {
        $running = [];
        $lowest = [];
        $first = [];

        foreach ($entries as $entry) {
            $key = $entry['product_key'];
            $first[$key] ??= $entry;
            $running[$key] = ($running[$key] ?? 0) + $entry['delta'];
            $lowest[$key] = min($lowest[$key] ?? 0, $running[$key]);
        }

        foreach ($lowest as $key => $units) {
            if ($units >= 0) {
                continue;
            }

            array_unshift($entries, [
                'date' => $first[$key]['date'],
                'order' => -1,
                'product_key' => $key,
                'product_id' => $first[$key]['product_id'],
                'delta' => -$units,
                'type' => StockMovementType::Opening,
                'reference_id' => null,
                'line_id' => null,
            ]);
        }

        usort($entries, fn (array $a, array $b): int => [$a['date'], $a['order']] <=> [$b['date'], $b['order']]);

        return $entries;
    }

    /**
     * Map each product to its active recipe and the default option of every
     * component (the material and the quantity consumed per unit produced).
     *
     * @return array<int, array{recipe_id: int, materials: list<array{id: int, key: string, quantity_per_unit: string}>}>
     */
    private function activeRecipes(): array
    {
        $map = [];

        foreach (ProductionRecipe::query()->where('is_active', true)->with('components.options.rawMaterial')->get() as $recipe) {
            $materials = [];

            foreach ($recipe->components as $component) {
                $option = $component->options->firstWhere('is_default', true) ?? $component->options->first();

                if ($option && $option->rawMaterial) {
                    $materials[] = [
                        'id' => (int) $option->raw_material_id,
                        'key' => $this->names->normalize($option->rawMaterial->name),
                        'quantity_per_unit' => (string) $option->quantity_per_unit,
                        'optional' => (bool) $component->is_optional,
                    ];
                }
            }

            $map[$recipe->product_id] = ['recipe_id' => $recipe->id, 'materials' => $materials];
        }

        return $map;
    }

    /**
     * Remove a previous backfill so it can be rebuilt from the current
     * invoices and production. Refuses to run when stock movements exist that
     * the backfill did not create (real operations must never be deleted).
     */
    public function reset(): void
    {
        $others = StockMovement::query()
            ->where(fn ($query) => $query->whereNull('note')->orWhere('note', 'not like', 'Historical backfill')->where('note', 'not like', 'Estimated opening balance%'))
            ->count();

        if ($others > 0) {
            throw new RuntimeException("{$others} stock movements were not created by the backfill; refusing to reset.");
        }

        DB::transaction(function (): void {
            DB::table('stock_movements')->update(['production_run_output_id' => null, 'production_run_material_id' => null]);
            DB::table('production_run_materials')->delete();
            DB::table('production_run_outputs')->update(['posted_movement_id' => null]);
            DB::table('stock_movements')->delete();
            DB::table('production_run_outputs')->delete();
            DB::table('production_runs')->where('note', 'Historical import')->delete();
            DB::table('inventory_balances')->delete();
            DB::table('organization_sequences')->where('organization_id', $this->tenant->id())->where('name', 'production_run')->delete();
            DB::table('financial_document_lines')->where('affects_inventory', true)->update(['affects_inventory' => false, 'warehouse_id' => null]);
        });
    }

    private function units(string $quantity): int
    {
        return (int) round(((float) $quantity) * 10000);
    }

    private function fromUnits(int $units): string
    {
        return number_format($units / 10000, 4, '.', '');
    }
}
