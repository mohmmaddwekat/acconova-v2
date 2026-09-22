<?php

namespace App\Http\Controllers;

use App\Actions\Products\UpdateProduct;
use App\Models\Product;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class ProductBulkEditController extends Controller
{
    public function __invoke(
        Request $request,
        UpdateProduct $updateProduct,
    ): JsonResponse {
        Gate::authorize(
            'viewAny',
            Product::class,
        );

        $data = $request->validate([
            'product_ids' => [
                'required',
                'array',
                'min:1',
                'max:100',
            ],
            'product_ids.*' => [
                'required',
                'integer',
                'distinct',
                'min:1',
            ],
            'changes' => [
                'required',
                'array',
            ],
            'changes.unit' => [
                'sometimes',
                'required',
                'string',
                'max:50',
            ],
            'changes.unit_price' => [
                'sometimes',
                'required',
                'numeric',
                'min:0',
            ],
            'changes.tax_rate' => [
                'sometimes',
                'required',
                'numeric',
                'min:0',
                'max:100',
            ],
        ]);

        $changes = collect(
            $data['changes'],
        )
            ->only([
                'unit',
                'unit_price',
                'tax_rate',
            ])
            ->map(
                fn ($value) => is_string($value)
                        ? trim($value)
                        : $value,
            )
            ->all();

        if ($changes === []) {
            throw ValidationException::withMessages([
                'changes' => [
                    'Choose at least one field to update.',
                ],
            ]);
        }

        $ids = collect(
            $data['product_ids'],
        )
            ->map(
                fn ($id): int => (int) $id,
            )
            ->values();

        $products = Product::query()
            ->whereKey(
                $ids->all(),
            )
            ->get()
            ->keyBy('id');

        abort_if(
            $products->count()
            !== $ids->count(),
            404,
        );

        $ordered = $ids->map(
            fn (int $id): Product => $products->get($id),
        );

        $ordered->each(
            fn (Product $product) => Gate::authorize(
                'update',
                $product,
            ),
        );

        DB::transaction(
            function () use (
                $ordered,
                $changes,
                $updateProduct,
                $request,
            ): void {
                foreach (
                    $ordered as $product
                ) {
                    $updateProduct->execute(
                        $product,
                        [
                            'type' => $product
                                ->type
                                ->value,
                            'name' => $product->name,
                            'sku' => $product->sku,
                            'description' => $product->description,
                            'unit' => $changes['unit']
                                ?? $product->unit,
                            'unit_price' => $changes['unit_price']
                                ?? $product->unit_price,
                            'cost_price' => $product->cost_price,
                            'tax_rate' => $changes['tax_rate']
                                ?? $product->tax_rate,
                        ],
                        $request->user()->id,
                    );
                }

                DB::table(
                    'bulk_action_history',
                )->insert([
                    'organization_id' => app(
                        TenantContext::class,
                    )->id(),
                    'user_id' => $request->user()->id,
                    'entity_type' => 'product',
                    'action' => 'bulk_edit',
                    'record_count' => $ordered->count(),
                    'record_ids' => json_encode(
                        $ordered
                            ->pluck('id')
                            ->map(
                                fn ($id): int => (int) $id,
                            )
                            ->values()
                            ->all(),
                        JSON_THROW_ON_ERROR,
                    ),
                    'changes' => json_encode(
                        $changes,
                        JSON_THROW_ON_ERROR,
                    ),
                    'created_at' => now(),
                ]);
            },
            3,
        );

        return response()->json([
            'data' => [
                'affected' => $ordered->count(),
                'changes' => $changes,
            ],
        ]);
    }
}
