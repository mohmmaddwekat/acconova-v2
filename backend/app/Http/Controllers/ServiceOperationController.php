<?php

namespace App\Http\Controllers;

use App\Enums\ProductType;
use App\Http\Requests\StoreServiceOperationRequest;
use App\Http\Resources\ServiceOperationResource;
use App\Models\Party;
use App\Models\Product;
use App\Models\ServiceOperation;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class ServiceOperationController extends Controller
{
    /** Return immutable service history, including archived catalog items. */
    public function index(Request $request, string $product): AnonymousResourceCollection
    {
        $catalogItem = Product::withTrashed()->findOrFail($product);
        Gate::authorize('view', $catalogItem);
        $request->validate(['page' => ['sometimes', 'integer', 'min:1']]);

        return ServiceOperationResource::collection(
            ServiceOperation::query()->where('product_id', $catalogItem->id)->latest('id')->paginate(10),
        );
    }

    /** Record customer or supplier quantities and prices without changing stock. */
    public function store(StoreServiceOperationRequest $request, string $product): JsonResponse
    {
        $operation = DB::transaction(function () use ($request, $product): ServiceOperation {
            $service = Product::query()->where('type', ProductType::Service)->lockForUpdate()->findOrFail($product);
            $data = $request->validated();
            $party = Party::query()->whereHas('roles', fn ($query) => $query->whereIn('role', ['customer', 'supplier', 'contact']))
                ->lockForUpdate()->find($data['party_id']);

            if ($party === null) {
                throw ValidationException::withMessages([
                    'party_id' => [__('validation.exists', ['attribute' => 'party_id'])],
                ]);
            }

            $subtotal = BigDecimal::of((string) $data['quantity'])
                ->multipliedBy((string) $data['unit_price'])->toScale(4, RoundingMode::HalfUp);

            return ServiceOperation::create([
                'product_id' => $service->id,
                'party_id' => $party->id,
                'created_by' => $request->user()->id,
                'service_name' => $service->name,
                'customer_name' => $party->company_name ?: $party->name,
                'unit' => $service->unit,
                'performed_on' => $data['performed_on'],
                'quantity' => $data['quantity'],
                'unit_price' => $data['unit_price'],
                'subtotal' => (string) $subtotal,
                'notes' => $data['notes'] ?? null,
            ]);
        }, 3);

        return (new ServiceOperationResource($operation))->response()->setStatusCode(201);
    }
}
