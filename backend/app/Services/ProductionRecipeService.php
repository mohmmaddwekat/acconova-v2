<?php

namespace App\Services;

use App\Enums\ProductType;
use App\Events\ProductionRecipeActivated;
use App\Models\Product;
use App\Models\ProductionRecipe;
use App\Models\ProductionRecipeComponent;
use App\Models\ProductionRecipeOption;
use App\Support\InventoryQuantity;
use App\Support\MeasurementUnits;
use App\Support\ProductionConsumption;
use App\Support\RecipeQuantity;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

class ProductionRecipeService
{
    /**
     * Create and activate a new immutable Recipe version.
     *
     * Recipe quantities submitted by the UI are expressed in each option's
     * usage_unit and normalized into the Raw Material's stock unit here.
     *
     * @param  list<array{
     *     name: string,
     *     options: list<array{
     *         raw_material_id: int,
     *         quantity_per_unit: string,
     *         usage_unit?: string|null,
     *         is_default?: bool
     *     }>
     * }>  $components
     */
    public function activate(
        Product $product,
        array $components,
        ?string $notes,
        int $actorId,
    ): ProductionRecipe {
        return DB::transaction(
            function () use (
                $product,
                $components,
                $notes,
                $actorId,
            ): ProductionRecipe {
                $rawIds =
                    collect(
                        $components,
                    )
                        ->flatMap(
                            fn (
                                array $component,
                            ): array => array_column(
                                $component[
                                    'options'
                                ],
                                'raw_material_id',
                            ),
                        )
                        ->map(
                            fn (
                                mixed $id,
                            ): int => (int) $id,
                        )
                        ->unique()
                        ->values();

                /*
                 * Collection::push() mutates the original Collection. Clone the
                 * Raw Material IDs before adding the finished Product solely
                 * for deterministic row locking.
                 */
                $allProductIds =
                    collect(
                        $rawIds->all(),
                    )
                        ->push(
                            $product->id,
                        )
                        ->unique()
                        ->sort()
                        ->values();

                $products =
                    Product::query()
                        ->whereIn(
                            'id',
                            $allProductIds,
                        )
                        ->orderBy(
                            'id',
                        )
                        ->lockForUpdate()
                        ->get()
                        ->keyBy(
                            'id',
                        );

                if (
                    $products->count() !==
                    $allProductIds->count()
                ) {
                    throw ValidationException::withMessages([
                        'components' => [
                            __(
                                'production.recipe_invalid_material',
                            ),
                        ],
                    ]);
                }

                /** @var Product $lockedProduct */
                $lockedProduct =
                    $products->get(
                        $product->id,
                    );

                if (
                    $lockedProduct->type !==
                    ProductType::Product
                ) {
                    throw ValidationException::withMessages([
                        'recipe' => [
                            __(
                                'production.recipe_products_only',
                            ),
                        ],
                    ]);
                }

                foreach (
                    $rawIds as $rawId
                ) {
                    /** @var Product|null $raw */
                    $raw =
                        $products->get(
                            $rawId,
                        );

                    if (
                        ! $raw
                        || $raw->type !==
                            ProductType::RawMaterial
                    ) {
                        throw ValidationException::withMessages([
                            'components' => [
                                __(
                                    'production.recipe_raw_materials_only',
                                ),
                            ],
                        ]);
                    }
                }

                $latest =
                    ProductionRecipe::query()
                        ->where(
                            'product_id',
                            $lockedProduct->id,
                        )
                        ->orderByDesc(
                            'version',
                        )
                        ->lockForUpdate()
                        ->first();

                $nextVersion =
                    ($latest?->version ?? 0)
                    + 1;

                ProductionRecipe::query()
                    ->where(
                        'product_id',
                        $lockedProduct->id,
                    )
                    ->where(
                        'is_active',
                        true,
                    )
                    ->update([
                        'is_active' => false,
                    ]);

                $recipe =
                    ProductionRecipe::create([
                        'product_id' => $lockedProduct->id,

                        'created_by' => $actorId,

                        'version' => $nextVersion,

                        'is_active' => true,

                        'notes' => $notes,
                    ]);

                foreach (
                    $components as $componentPosition => $componentData
                ) {
                    $component =
                        ProductionRecipeComponent::create([
                            'production_recipe_id' => $recipe->id,

                            'name' => trim(
                                $componentData[
                                    'name'
                                ],
                            ),

                            'position' => $componentPosition
                                + 1,
                        ]);

                    $defaultCount =
                        collect(
                            $componentData[
                                'options'
                            ],
                        )
                            ->filter(
                                fn (
                                    array $option,
                                ): bool => (bool) (
                                    $option[
                                        'is_default'
                                    ]
                                    ?? false
                                ),
                            )
                            ->count();

                    if (
                        $defaultCount >
                        1
                    ) {
                        throw ValidationException::withMessages([
                            'components' => [
                                __(
                                    'production.recipe_one_default',
                                ),
                            ],
                        ]);
                    }

                    $seenRawMaterials =
                        [];

                    foreach (
                        $componentData[
                            'options'
                        ] as $optionPosition => $optionData
                    ) {
                        $rawMaterialId =
                            (int) $optionData[
                                'raw_material_id'
                            ];

                        if (
                            isset(
                                $seenRawMaterials[
                                    $rawMaterialId
                                ],
                            )
                        ) {
                            throw ValidationException::withMessages([
                                'components' => [
                                    __(
                                        'production.recipe_duplicate_option',
                                    ),
                                ],
                            ]);
                        }

                        $seenRawMaterials[
                            $rawMaterialId
                        ] =
                            true;

                        /** @var Product $rawMaterial */
                        $rawMaterial =
                            $products->get(
                                $rawMaterialId,
                            );

                        $usageUnit =
                            trim(
                                (string) (
                                    $optionData[
                                        'usage_unit'
                                    ]
                                    ?? $rawMaterial
                                        ->unit
                                ),
                            );

                        try {
                            $usageUnit =
                                MeasurementUnits::normalizeUnit(
                                    $usageUnit,
                                );

                            if (
                                ! MeasurementUnits::areCompatible(
                                    $usageUnit,
                                    (string) $rawMaterial
                                        ->unit,
                                )
                            ) {
                                throw new InvalidArgumentException(
                                    'Incompatible Recipe usage unit.',
                                );
                            }

                            /*
                             * The request rate is expressed in the human usage
                             * unit. Persist the canonical equivalent in the Raw
                             * Material's stock unit.
                             */
                            $canonicalRate =
                                MeasurementUnits::convertRecipeRate(
                                    (string) $optionData[
                                        'quantity_per_unit'
                                    ],
                                    $usageUnit,
                                    (string) $rawMaterial
                                        ->unit,
                                );
                        } catch (
                            InvalidArgumentException
                        ) {
                            throw ValidationException::withMessages([
                                'components' => [
                                    __(
                                        'production.recipe_incompatible_unit',
                                    ),
                                ],
                            ]);
                        }

                        if (
                            ! RecipeQuantity::isPositive(
                                $canonicalRate,
                            )
                        ) {
                            throw ValidationException::withMessages([
                                'components' => [
                                    __(
                                        'production.quantity_positive',
                                    ),
                                ],
                            ]);
                        }

                        ProductionRecipeOption::create([
                            'production_recipe_component_id' => $component->id,

                            'raw_material_id' => $rawMaterialId,

                            'usage_unit' => $usageUnit,

                            'quantity_per_unit' => $canonicalRate,

                            'is_default' => count(
                                $componentData[
                                    'options'
                                ],
                            ) === 1
                                || (
                                    $defaultCount ===
                                        0
                                    && $optionPosition ===
                                        0
                                )
                                || (bool) (
                                    $optionData[
                                        'is_default'
                                    ]
                                    ?? false
                                ),

                            'position' => $optionPosition
                                + 1,
                        ]);
                    }
                }

                ProductionRecipeActivated::dispatch(
                    (int) $lockedProduct
                        ->organization_id,
                    $lockedProduct->id,
                    $recipe->id,
                    $recipe->version,
                    $actorId,
                );

                return $recipe->load(
                    'components.options.rawMaterial',
                );
            },
            3,
        );
    }

    /**
     * Resolve a Recipe into suggested Raw Material consumption.
     *
     * The Recipe is only a planning suggestion. Actual Production Run material
     * rows remain authoritative for physical Inventory consumption.
     *
     * @param  array<int|string, int|string>  $selections
     * @return array{
     *     materials:list<array{product_id:int,quantity:string}>,
     *     snapshot:array<string,mixed>
     * }
     */
    public function resolveForProduction(
        Product $product,
        ProductionRecipe $recipe,
        string $outputQuantity,
        array $selections,
    ): array {
        if (
            $recipe->product_id !==
            $product->id
            || ! $recipe->is_active
        ) {
            throw ValidationException::withMessages([
                'recipe_id' => [
                    __(
                        'production.recipe_outdated',
                    ),
                ],
            ]);
        }

        $recipe->loadMissing(
            'components.options.rawMaterial',
        );

        $materialUnits =
            [];

        $snapshotComponents =
            [];

        foreach (
            $recipe->components as $component
        ) {
            $selectedOptionId =
                isset(
                    $selections[
                        (string) $component->id
                    ],
                )
                    ? (int) $selections[
                        (string) $component->id
                    ]
                    : (
                        isset(
                            $selections[
                                $component->id
                            ],
                        )
                            ? (int) $selections[
                                $component->id
                            ]
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
                throw ValidationException::withMessages([
                    'selections' => [
                        __(
                            'production.recipe_invalid_option',
                        ),
                    ],
                ]);
            }

            $rawMaterial =
                $option->rawMaterial;

            if (
                ! $rawMaterial
                || $rawMaterial->type !==
                    ProductType::RawMaterial
            ) {
                throw ValidationException::withMessages([
                    'selections' => [
                        __(
                            'production.recipe_invalid_material',
                        ),
                    ],
                ]);
            }

            $required =
                ProductionConsumption::calculate(
                    $outputQuantity,
                    $option->quantity_per_unit,
                );

            $requiredUnits =
                InventoryQuantity::toUnits(
                    $required,
                );

            $materialUnits[
                $rawMaterial->id
            ] =
                (
                    $materialUnits[
                        $rawMaterial->id
                    ]
                    ?? 0
                )
                + $requiredUnits;

            $usageUnit =
                $option->usage_unit
                ?: $rawMaterial->unit;

            $usageRate =
                MeasurementUnits::convertRecipeRate(
                    $option->quantity_per_unit,
                    (string) $rawMaterial
                        ->unit,
                    (string) $usageUnit,
                );

            $snapshotComponents[] = [
                'component_id' => $component->id,

                'component_name' => $component->name,

                'option_id' => $option->id,

                'raw_material_id' => $rawMaterial->id,

                'raw_material_name' => $rawMaterial->name,

                'raw_material_sku' => $rawMaterial->sku,

                'unit' => $rawMaterial->unit,

                'usage_unit' => $usageUnit,

                'usage_quantity_per_unit' => $usageRate,

                'quantity_per_unit' => $option
                    ->quantity_per_unit,

                'required_quantity' => $required,

                'is_substitute' => ! $option
                    ->is_default,
            ];
        }

        $materials =
            collect(
                $materialUnits,
            )
                ->map(
                    fn (
                        int $units,
                        int|string $productId,
                    ): array => [
                        'product_id' => (int) $productId,

                        'quantity' => InventoryQuantity::fromUnits(
                            $units,
                        ),
                    ],
                )
                ->values()
                ->all();

        return [
            'materials' => $materials,

            'snapshot' => [
                'recipe_id' => $recipe->id,

                'recipe_version' => $recipe->version,

                'finished_product_id' => $product->id,

                'finished_product_name' => $product->name,

                'finished_product_unit' => $product->unit,

                'output_quantity' => $outputQuantity,

                'components' => $snapshotComponents,
            ],
        ];
    }
}
