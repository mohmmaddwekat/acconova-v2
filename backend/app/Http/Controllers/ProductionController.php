<?php

namespace App\Http\Controllers;

use App\Enums\StockMovementType;
use App\Http\Requests\RecordProductionRequest;
use App\Http\Resources\ProductionResource;
use App\Models\Product;
use App\Models\StockMovement;
use App\Services\InventoryStockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class ProductionController extends Controller
{
    public function index(Request $request, string $product): AnonymousResourceCollection
    {
        $item = Product::withTrashed()->findOrFail($product);
        Gate::authorize('view', $item);
        $request->validate(['page' => ['sometimes', 'integer', 'min:1']]);
        $batches = StockMovement::query()->where('product_id', $item->id)
            ->where('type', StockMovementType::ProductionIn)->with('warehouse')->latest('id')->paginate(10);
        $materials = StockMovement::query()->where('reference_type', 'production')
            ->where('type', StockMovementType::ProductionOut)->whereIn('reference_id', $batches->pluck('id'))
            ->with('product')->get()->groupBy('reference_id');
        foreach ($batches as $batch) {
            $batch->setRelation('materials', $materials->get($batch->id, collect()));
        }

        return ProductionResource::collection($batches);
    }

    public function store(RecordProductionRequest $request, InventoryStockService $inventory, string $product): JsonResponse
    {
        $data = $request->validated();
        $movement = $inventory->recordProduction(Product::findOrFail($product), (int) $data['warehouse_id'], (string) $data['quantity'], $data['materials'], $data['note'] ?? null, $request->user()->id);
        $movement->load('warehouse');
        $movement->setRelation('materials', StockMovement::query()->where('reference_type', 'production')
            ->where('reference_id', $movement->id)->where('type', StockMovementType::ProductionOut)->with('product')->get());

        return (new ProductionResource($movement))->response()->setStatusCode(201);
    }
}
