<?php

namespace App\Services\Production;

use App\Enums\ProductType;
use App\Models\Product;
use App\Services\Products\InvoiceProductBackfill;
use RuntimeException;

class RecipeYieldImporter
{
    public function __construct(
        private readonly InvoiceProductBackfill $names,
        private readonly ProductionRecipeService $recipes,
    ) {}

    /**
     * Read "raw material, units produced per 1 unit of it, product" rows from
     * the legacy SQL dump. When the same material appears twice for a product
     * the last row wins.
     *
     * @return list<array{material: string, yield: float, product: string}>
     */
    public function parse(string $path): array
    {
        if (! is_file($path)) {
            throw new RuntimeException("File not found: {$path}");
        }

        $rows = [];

        foreach (file($path) as $line) {
            if (preg_match("/VALUES\('([^']*)', ([\d.]+), '([^']*)'\)/u", $line, $match) === 1 && (float) $match[2] > 0) {
                $rows[] = ['material' => $match[1], 'yield' => (float) $match[2], 'product' => $match[3]];
            }
        }

        return $rows;
    }

    /**
     * Resolve every row against the catalog and describe the recipes to build,
     * without writing anything.
     *
     * @param  list<array{material: string, yield: float, product: string}>  $rows
     * @return array{
     *     recipes: array<int, array{product: Product, components: list<array<string, mixed>>}>,
     *     missingProducts: list<string>,
     *     newMaterials: array<string, string>,
     *     conflicts: list<string>
     * }
     */
    public function plan(array $rows): array
    {
        $products = Product::query()->where('type', '!=', ProductType::RawMaterial->value)->get()
            ->keyBy(fn (Product $product): string => $this->names->normalize($product->name));
        $materials = Product::query()->where('type', ProductType::RawMaterial->value)->get()
            ->keyBy(fn (Product $product): string => $this->names->normalize($product->name));

        $resolve = function (string $name) use ($products): string {
            $key = $this->names->normalize($name);

            return ! isset($products[$key]) && str_starts_with($key, '3.5كلور') && isset($products[mb_substr($key, 3)])
                ? mb_substr($key, 3)
                : $key;
        };

        $latest = [];
        $conflicts = [];

        foreach ($rows as $row) {
            $key = $resolve($row['product']).'|'.$this->names->normalize($row['material']);

            if (isset($latest[$key]) && $latest[$key]['yield'] !== $row['yield']) {
                $conflicts[$key] = $row['product'].' / '.$row['material'].': '.$latest[$key]['yield'].' -> '.$row['yield'];
            }

            $latest[$key] = $row;
        }

        $recipes = [];
        $missing = [];
        $newMaterials = [];

        foreach ($latest as $row) {
            $product = $products[$resolve($row['product'])] ?? null;

            if (! $product) {
                $missing[$row['product']] = $row['product'];

                continue;
            }

            $materialKey = $this->names->normalize($row['material']);
            $material = $materials[$materialKey] ?? null;

            if (! $material) {
                $newMaterials[$materialKey] = $row['material'];
            }

            $recipes[$product->id]['product'] = $product;
            $recipes[$product->id]['components'][$this->componentName($row['material'])][] = [
                'material_key' => $materialKey,
                'material_name' => $row['material'],
                'raw_material_id' => $material?->id,
                'quantity_per_unit' => number_format(1 / $row['yield'], 8, '.', ''),
            ];
        }

        return [
            'recipes' => $recipes,
            'missingProducts' => array_values($missing),
            'newMaterials' => $newMaterials,
            'conflicts' => array_values($conflicts),
        ];
    }

    /**
     * Create missing raw materials and activate one recipe per product.
     *
     * @param  array<string, mixed>  $plan
     * @return array{recipes: int, materials_created: int}
     */
    public function apply(array $plan, int $actorId, string $notes = 'Imported from raw material productivity file'): array
    {
        $created = [];

        foreach ($plan['newMaterials'] as $key => $name) {
            $created[$key] = Product::query()->create([
                'type' => ProductType::RawMaterial,
                'name' => $this->names->cleanName($name),
                'unit' => 'piece',
                'unit_price' => 0,
                'cost_price' => 0,
                'tax_rate' => 0,
                'track_inventory' => true,
            ])->id;
        }

        $count = 0;

        foreach ($plan['recipes'] as $entry) {
            $components = [];

            foreach ($entry['components'] as $name => $options) {
                $built = [];

                foreach ($options as $index => $option) {
                    $built[] = [
                        'raw_material_id' => $option['raw_material_id'] ?? $created[$option['material_key']],
                        'quantity_per_unit' => $option['quantity_per_unit'],
                        'is_default' => $index === count($options) - 1,
                    ];
                }

                $components[] = ['name' => $name, 'is_optional' => $name === 'خومر جير', 'options' => $built];
            }

            $this->recipes->activate($entry['product'], $components, $notes, $actorId);
            $count++;
        }

        return ['recipes' => $count, 'materials_created' => count($created)];
    }

    private function componentName(string $material): string
    {
        $key = $this->names->normalize($material);

        return match (true) {
            str_starts_with($key, 'صبغ') => 'صبغة',
            str_starts_with($key, 'خومرجير') => 'خومر جير',
            str_starts_with($key, 'نايل') => 'نايلون',
            default => trim($material),
        };
    }
}
