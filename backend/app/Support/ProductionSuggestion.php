<?php

namespace App\Support;

use App\Enums\ProductType;
use App\Exceptions\SafeValidationException;
use App\Models\Product;
use App\Models\ProductionRecipe;

final class ProductionSuggestion
{
    /**
     * Build an optional immutable Recipe suggestion snapshot.
     *
     * An inactive historical Recipe may still be used as a suggestion because
     * Recipe data never moves Inventory. Actual ProductionRunMaterial rows are
     * the only authoritative consumption quantities.
     *
     * @param  array<int|string, int|string>  $selections
     * @return array<string, mixed>|null
     */
    public function snapshot(
        Product $product,
        ?ProductionRecipe $recipe,
        string $outputQuantity,
        array $selections,
    ): ?array {
        if ($recipe === null) {
            if ($selections !== []) {
                throw SafeValidationException::forField(
                    'outputs',
                    'production_run_recipe_invalid',
                );
            }

            return null;
        }

        if (
            (int) $recipe->product_id !==
            (int) $product->id
        ) {
            throw SafeValidationException::forField(
                'outputs',
                'production_run_recipe_invalid',
            );
        }

        $recipe->loadMissing(
            'components.options',
        );

        $snapshotComponents = [];

        foreach (
            $recipe->components as $component
        ) {
            $selectedOptionId =
                isset(
                    $selections[(string) $component->id],
                )
                ? (int) $selections[(string) $component->id]
                : (
                    isset(
                        $selections[$component->id],
                    )
                    ? (int) $selections[$component->id]
                    : null
                );

            $option =
                $selectedOptionId !==
                null
                ? $component
                    ->options
                    ->firstWhere(
                        'id',
                        $selectedOptionId,
                    )
                : $component
                    ->options
                    ->firstWhere(
                        'is_default',
                        true,
                    );

            if (! $option) {
                throw SafeValidationException::forField(
                    'outputs',
                    'production_run_recipe_invalid',
                );
            }

            /*
             * Historical recipes are allowed to reference an archived Raw
             * Material because the snapshot is informational only.
             */
            $rawMaterial =
                Product::withTrashed()
                    ->find(
                        $option->raw_material_id,
                    );

            if (
                ! $rawMaterial
                || $rawMaterial->type !==
                ProductType::RawMaterial
            ) {
                throw SafeValidationException::forField(
                    'outputs',
                    'production_run_recipe_invalid',
                );
            }

            $required =
                ProductionConsumption::calculate(
                    $outputQuantity,
                    $option->quantity_per_unit,
                );

            $snapshotComponents[] = [
                'component_id' => $component->id,

                'component_name' => $component->name,

                'option_id' => $option->id,

                'raw_material_id' => $rawMaterial->id,

                'raw_material_name' => $rawMaterial->name,

                'raw_material_sku' => $rawMaterial->sku,

                'raw_material_archived' => $rawMaterial->trashed(),

                'unit' => $rawMaterial->unit,

                'quantity_per_unit' => $option
                    ->quantity_per_unit,

                'required_quantity' => $required,

                'is_substitute' => ! $option->is_default,
            ];
        }

        return [
            'recipe_id' => $recipe->id,

            'recipe_version' => $recipe->version,

            'recipe_active_at_snapshot' => (bool) $recipe->is_active,

            'finished_product_id' => $product->id,

            'finished_product_name' => $product->name,

            'finished_product_unit' => $product->unit,

            'output_quantity' => $outputQuantity,

            'components' => $snapshotComponents,
        ];
    }
}
