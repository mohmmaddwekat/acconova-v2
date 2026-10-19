<?php

namespace App\Services\Production;

use App\Models\FinancialDocumentLine;
use App\Models\Product;
use App\Models\ProductionRecipe;
use Illuminate\Support\Facades\DB;

class RecipeCostCalculator
{
    /**
     * Unit cost of every product that has an active recipe: the sum of each
     * component's default raw material cost times its quantity per unit.
     *
     * @return array<int, string>
     */
    public function costs(): array
    {
        $costs = [];

        foreach (ProductionRecipe::query()->where('is_active', true)->with('components.options.rawMaterial')->get() as $recipe) {
            $total = 0.0;

            foreach ($recipe->components as $component) {
                $option = $component->options->firstWhere('is_default', true) ?? $component->options->first();

                if ($option?->rawMaterial) {
                    $total += (float) $option->quantity_per_unit * (float) $option->rawMaterial->cost_price;
                }
            }

            $costs[$recipe->product_id] = number_format($total, 4, '.', '');
        }

        return $costs;
    }

    /**
     * Store recipe costs on the products and fill the missing cost snapshot of
     * sale invoice lines so margins reflect materials instead of showing 100%.
     *
     * @return array{products: int, lines: int}
     */
    public function apply(): array
    {
        return DB::transaction(function (): array {
            $products = 0;

            foreach ($this->costs() as $productId => $cost) {
                $products += Product::query()->whereKey($productId)->update(['cost_price' => $cost]);
            }

            $lines = FinancialDocumentLine::query()
                ->whereIn('financial_document_id', DB::table('financial_documents')->where('kind', 'sale_invoice')->select('id'))
                ->where(fn ($query) => $query->whereNull('cost_price_snapshot')->orWhere('cost_price_snapshot', 0))
                ->whereIn('product_id', Product::query()->where('cost_price', '>', 0)->select('id'))
                ->update(['cost_price_snapshot' => DB::raw('(select cost_price from products where products.id = financial_document_lines.product_id)')]);

            return ['products' => $products, 'lines' => $lines];
        });
    }
}
