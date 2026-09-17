<?php

namespace App\Http\Controllers;

use App\Enums\ProductType;
use App\Http\Requests\SaveProductionRecipeRequest;
use App\Models\Product;
use App\Models\ProductionRecipe;
use App\Services\ProductionRecipeService;
use App\Support\MeasurementUnits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class ProductionRecipeController extends Controller
{
    /**
     * Return the active Recipe and version history for one finished Product.
     */
    public function show(
        Request $request,
        string $product,
    ): JsonResponse {
        $item =
            Product::query()
                ->where(
                    'type',
                    ProductType::Product->value,
                )
                ->findOrFail(
                    $product,
                );

        Gate::authorize(
            'view',
            $item,
        );

        $active =
            ProductionRecipe::query()
                ->where(
                    'product_id',
                    $item->id,
                )
                ->where(
                    'is_active',
                    true,
                )
                ->with(
                    'components.options.rawMaterial',
                )
                ->first();

        $versions =
            ProductionRecipe::query()
                ->where(
                    'product_id',
                    $item->id,
                )
                ->orderByDesc(
                    'version',
                )
                ->limit(
                    25,
                )
                ->get([
                    'id',
                    'version',
                    'is_active',
                    'notes',
                    'created_at',
                ]);

        return response()->json([
            'data' => [
                'active' => $active
                        ? $this->serializeRecipe(
                            $active,
                        )
                        : null,

                'versions' => $versions,
            ],
        ]);
    }

    /**
     * Create a new active immutable Recipe version.
     */
    public function store(
        SaveProductionRecipeRequest $request,
        ProductionRecipeService $recipes,
    ): JsonResponse {
        $data =
            $request->validated();

        $recipe =
            $recipes->activate(
                $request->product(),
                $data[
                    'components'
                ],
                $data[
                    'notes'
                ]
                    ?? null,
                $request->user()->id,
            );

        return response()->json([
            'data' => $this->serializeRecipe(
                $recipe,
            ),
        ], 201);
    }

    /**
     * Build the Recipe API representation used by the editor.
     *
     * Canonical quantity_per_unit always uses the Raw Material's stock unit.
     * usage_quantity_per_unit is the same physical rate translated back into
     * the user's preferred working unit.
     *
     * @return array<string, mixed>
     */
    private function serializeRecipe(
        ProductionRecipe $recipe,
    ): array {
        $recipe->loadMissing(
            'components.options.rawMaterial',
        );

        return [
            'id' => $recipe->id,

            'version' => $recipe->version,

            'is_active' => $recipe->is_active,

            'notes' => $recipe->notes,

            'created_at' => $recipe
                ->created_at
                ->toIso8601String(),

            'components' => $recipe
                ->components
                ->map(
                    fn (
                        $component,
                    ): array => [
                        'id' => $component->id,

                        'name' => $component->name,

                        'position' => $component->position,

                        'options' => $component
                            ->options
                            ->map(
                                function (
                                    $option,
                                ): array {
                                    $raw =
                                        $option
                                            ->rawMaterial;

                                    $usageUnit =
                                        $option
                                            ->usage_unit
                                        ?: $raw
                                            ->unit;

                                    $usageRate =
                                        MeasurementUnits::convertRecipeRate(
                                            $option
                                                ->quantity_per_unit,
                                            (string) $raw
                                                ->unit,
                                            (string) $usageUnit,
                                        );

                                    return [
                                        'id' => $option->id,

                                        'quantity_per_unit' => $option
                                            ->quantity_per_unit,

                                        'usage_unit' => $usageUnit,

                                        'usage_quantity_per_unit' => $usageRate,

                                        'is_default' => $option
                                            ->is_default,

                                        'raw_material' => [
                                            'id' => $raw->id,

                                            'name' => $raw
                                                ->name,

                                            'sku' => $raw
                                                ->sku,

                                            'unit' => $raw
                                                ->unit,

                                            'track_inventory' => $raw
                                                ->tracksInventory(),
                                        ],
                                    ];
                                },
                            )
                            ->values(),
                    ],
                )
                ->values(),
        ];
    }
}
