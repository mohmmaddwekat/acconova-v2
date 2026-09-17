<?php

namespace App\Http\Controllers;

use App\Enums\StockMovementType;
use App\Events\ProductionRecorded;
use App\Http\Requests\RecordProductionRequest;
use App\Http\Resources\ProductionResource;
use App\Models\Product;
use App\Models\ProductionRecipe;
use App\Models\ProductionRecipeUsage;
use App\Models\StockMovement;
use App\Services\InventoryStockService;
use App\Services\ProductionRecipeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class ProductionController extends Controller
{
    /**
     * Return immutable production history for one finished Product.
     */
    public function index(
        Request $request,
        string $product,
    ): AnonymousResourceCollection {
        $item =
            Product::withTrashed()
                ->findOrFail(
                    $product,
                );

        Gate::authorize(
            'view',
            $item,
        );

        $request->validate([
            'page' => [
                'sometimes',
                'integer',
                'min:1',
            ],
        ]);

        $batches =
            StockMovement::query()
                ->where(
                    'product_id',
                    $item->id,
                )
                ->where(
                    'type',
                    StockMovementType::ProductionIn,
                )
                ->with(
                    'warehouse',
                )
                ->latest(
                    'id',
                )
                ->paginate(
                    10,
                );

        $batchIds =
            $batches
                ->getCollection()
                ->pluck(
                    'id',
                );

        $materials =
            StockMovement::query()
                ->where(
                    'reference_type',
                    'production',
                )
                ->where(
                    'type',
                    StockMovementType::ProductionOut,
                )
                ->whereIn(
                    'reference_id',
                    $batchIds,
                )
                ->with(
                    'product',
                )
                ->get()
                ->groupBy(
                    'reference_id',
                );

        $usages =
            ProductionRecipeUsage::query()
                ->whereIn(
                    'production_movement_id',
                    $batchIds,
                )
                ->with(
                    'recipe:id,version',
                )
                ->get()
                ->keyBy(
                    'production_movement_id',
                );

        foreach (
            $batches as $batch
        ) {
            $batch->setRelation(
                'materials',
                $materials->get(
                    $batch->id,
                    collect(),
                ),
            );

            $batch->setRelation(
                'recipeUsage',
                $usages->get(
                    $batch->id,
                ),
            );
        }

        return ProductionResource::collection(
            $batches,
        );
    }

    /**
     * Record one recipe-driven production batch atomically.
     *
     * The recipe usage snapshot joins the same outer transaction as physical
     * stock changes so a successful production movement can never exist
     * without its historical recipe identity.
     */
    public function store(
        RecordProductionRequest $request,
        InventoryStockService $inventory,
        ProductionRecipeService $recipes,
        string $product,
    ): JsonResponse {
        $data =
            $request->validated();

        $movement =
            DB::transaction(
                function () use (
                    $request,
                    $inventory,
                    $recipes,
                    $data,
                ): StockMovement {
                    /*
                     * Product-first locking matches recipe activation and stock
                     * workflows, reducing deadlock risk under concurrency.
                     */
                    $item =
                        Product::query()
                            ->lockForUpdate()
                            ->findOrFail(
                                $request
                                    ->product()
                                    ->id,
                            );

                    $recipe =
                        ProductionRecipe::query()
                            ->where(
                                'product_id',
                                $item->id,
                            )
                            ->lockForUpdate()
                            ->findOrFail(
                                (int) $data['recipe_id'],
                            );

                    $resolved =
                        $recipes->resolveForProduction(
                            $item,
                            $recipe,
                            (string) $data['quantity'],
                            $data['selections'] ?? [],
                        );

                    $movement =
                        $inventory->recordProduction(
                            $item,
                            (int) $data['warehouse_id'],
                            (string) $data['quantity'],
                            $resolved['materials'],
                            $data['note'] ?? null,
                            $request->user()->id,
                        );

                    $usage =
                        ProductionRecipeUsage::create([
                            'production_movement_id' => $movement->id,

                            'production_recipe_id' => $recipe->id,

                            'snapshot' => $resolved['snapshot'],
                        ]);

                    $usage->setRelation(
                        'recipe',
                        $recipe,
                    );

                    $movement->setRelation(
                        'recipeUsage',
                        $usage,
                    );

                    ProductionRecorded::dispatch(
                        (int) $item
                            ->organization_id,
                        $item->id,
                        $movement->id,
                        $recipe->id,
                        $recipe->version,
                        $request->user()->id,
                    );

                    return $movement;
                },
                3,
            );

        $movement->load(
            'warehouse',
        );

        $movement->setRelation(
            'materials',
            StockMovement::query()
                ->where(
                    'reference_type',
                    'production',
                )
                ->where(
                    'reference_id',
                    $movement->id,
                )
                ->where(
                    'type',
                    StockMovementType::ProductionOut,
                )
                ->with(
                    'product',
                )
                ->get(),
        );

        return (
            new ProductionResource(
                $movement,
            )
        )
            ->response()
            ->setStatusCode(
                201,
            );
    }
}
