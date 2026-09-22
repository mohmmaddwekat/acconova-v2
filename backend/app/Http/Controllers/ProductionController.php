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
use App\Services\ProductionRecipeService;
use App\Services\ProductionRunService;
use App\Services\WorkspaceFeaturePermissions;
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
        ProductionRecipeService $recipes,
        ProductionRunService $runs,
        string $product,
    ): JsonResponse {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'production.runs.create',
        );

        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'production.runs.post',
        );

        $data = $request->validated();

        $movement = DB::transaction(
            function () use (
                $request,
                $recipes,
                $runs,
                $data,
            ): StockMovement {
                $item = Product::query()
                    ->findOrFail(
                        $request->product()->id,
                    );

                $recipe = ProductionRecipe::query()
                    ->where(
                        'product_id',
                        $item->id,
                    )
                    ->findOrFail(
                        (int) $data['recipe_id'],
                    );

                $resolved = $recipes->resolveForProduction(
                    $item,
                    $recipe,
                    (string) $data['quantity'],
                    $data['selections'] ?? [],
                );

                $materials = collect(
                    $resolved['materials'],
                )
                    ->map(
                        fn (array $material): array => [
                            'raw_material_id' => (int) $material['product_id'],
                            'warehouse_id' => (int) $data['warehouse_id'],
                            'actual_quantity' => (string) $material['quantity'],
                        ],
                    )
                    ->values()
                    ->all();

                /*
                 * This endpoint is only a backwards-compatible adapter.
                 * Physical inventory changes still happen exclusively through
                 * ProductionRunService / ProductionRunStockService.
                 */
                $draft = $runs->createDraft(
                    [
                        'occurred_on' => today()->toDateString(),
                        'note' => $data['note'] ?? null,
                        'outputs' => [[
                            'product_id' => $item->id,
                            'warehouse_id' => (int) $data['warehouse_id'],
                            'quantity' => (string) $data['quantity'],
                            'recipe_id' => $recipe->id,
                            'selections' => $data['selections'] ?? [],
                            'materials' => $materials,
                        ]],
                    ],
                    $request->user()->id,
                );

                $posted = $runs->post(
                    $draft,
                    1,
                    $request->user()->id,
                );

                $output = $posted->outputs->first();

                abort_unless(
                    $output
                    && $output->postedMovement,
                    500,
                    'Posted production movement missing.',
                );

                return $output->postedMovement;
            },
            3,
        );

        $movement->load([
            'warehouse',
            'recipeUsage.recipe',
        ]);

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
