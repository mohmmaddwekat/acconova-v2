<?php

namespace App\Http\Controllers;

use App\Actions\Parties\RestoreParty;
use App\Actions\Products\RestoreProduct;
use App\Models\Party;
use App\Models\Product;
use App\Models\Warehouse;
use App\Services\WarehouseService;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RestoreCenterController extends Controller
{
    public function index(
        Request $request,
    ): JsonResponse {
        $this->authorizeAccess();

        $items = collect();

        Party::onlyTrashed()
            ->latest('deleted_at')
            ->limit(250)
            ->get([
                'id',
                'name',
                'company_name',
                'deleted_at',
            ])
            ->each(
                function (Party $party) use (
                    $request,
                    $items,
                ): void {
                    if (
                        ! $request->user()->can(
                            'restore',
                            $party,
                        )
                    ) {
                        return;
                    }

                    $items->push([
                        'type' => 'party',
                        'id' => $party->id,
                        'name' =>
                            $party->company_name
                            ?: $party->name
                            ?: '#'.$party->id,
                        'deleted_at' =>
                            $party->deleted_at
                                ?->toIso8601String(),
                        'source_url' =>
                            '/app/parties',
                    ]);
                },
            );

        Product::onlyTrashed()
            ->latest('deleted_at')
            ->limit(250)
            ->get([
                'id',
                'name',
                'sku',
                'deleted_at',
            ])
            ->each(
                function (Product $product) use (
                    $request,
                    $items,
                ): void {
                    if (
                        ! $request->user()->can(
                            'restore',
                            $product,
                        )
                    ) {
                        return;
                    }

                    $items->push([
                        'type' => 'product',
                        'id' => $product->id,
                        'name' => $product->name,
                        'detail' => $product->sku,
                        'deleted_at' =>
                            $product->deleted_at
                                ?->toIso8601String(),
                        'source_url' =>
                            '/app/products',
                    ]);
                },
            );

        Warehouse::onlyTrashed()
            ->latest('deleted_at')
            ->limit(250)
            ->get([
                'id',
                'name',
                'code',
                'deleted_at',
            ])
            ->each(
                function (Warehouse $warehouse) use (
                    $request,
                    $items,
                ): void {
                    if (
                        ! $request->user()->can(
                            'restore',
                            $warehouse,
                        )
                    ) {
                        return;
                    }

                    $items->push([
                        'type' => 'warehouse',
                        'id' => $warehouse->id,
                        'name' => $warehouse->name,
                        'detail' => $warehouse->code,
                        'deleted_at' =>
                            $warehouse->deleted_at
                                ?->toIso8601String(),
                        'source_url' =>
                            '/app/inventory',
                    ]);
                },
            );

        return response()->json([
            'data' => $items
                ->sortByDesc(
                    'deleted_at',
                )
                ->values()
                ->all(),
            'reversible_changes_url' =>
                '/app/audit',
        ]);
    }

    public function restore(
        Request $request,
        string $type,
        string $record,
        RestoreParty $restoreParty,
        RestoreProduct $restoreProduct,
        WarehouseService $warehouses,
    ): JsonResponse {
        $this->authorizeAccess();

        validator(
            [
                'type' => $type,
                'record' => $record,
            ],
            [
                'type' => [
                    'required',
                    Rule::in([
                        'party',
                        'product',
                        'warehouse',
                    ]),
                ],
                'record' => [
                    'required',
                    'integer',
                    'min:1',
                ],
            ],
        )->validate();

        $id = (int) $record;

        $restored = match ($type) {
            'party' =>
                $this->restoreParty(
                    $request,
                    $id,
                    $restoreParty,
                ),
            'product' =>
                $this->restoreProduct(
                    $request,
                    $id,
                    $restoreProduct,
                ),
            'warehouse' =>
                $this->restoreWarehouse(
                    $request,
                    $id,
                    $warehouses,
                ),
        };

        return response()->json([
            'data' => $restored,
        ]);
    }

    private function restoreParty(
        Request $request,
        int $id,
        RestoreParty $action,
    ): array {
        $party = Party::onlyTrashed()
            ->findOrFail($id);

        abort_unless(
            $request->user()->can(
                'restore',
                $party,
            ),
            403,
        );

        $party = $action->execute(
            $party,
        );

        return [
            'type' => 'party',
            'id' => $party->id,
            'name' =>
                $party->company_name
                ?: $party->name,
            'url' =>
                '/app/parties?focus='
                .$party->id,
        ];
    }

    private function restoreProduct(
        Request $request,
        int $id,
        RestoreProduct $action,
    ): array {
        $product = Product::onlyTrashed()
            ->findOrFail($id);

        abort_unless(
            $request->user()->can(
                'restore',
                $product,
            ),
            403,
        );

        $product = $action->execute(
            $product,
        );

        return [
            'type' => 'product',
            'id' => $product->id,
            'name' => $product->name,
            'url' =>
                '/app/products?focus='
                .$product->id,
        ];
    }

    private function restoreWarehouse(
        Request $request,
        int $id,
        WarehouseService $warehouses,
    ): array {
        $warehouse = Warehouse::onlyTrashed()
            ->findOrFail($id);

        abort_unless(
            $request->user()->can(
                'restore',
                $warehouse,
            ),
            403,
        );

        $warehouse = $warehouses->restore(
            $warehouse,
        );

        return [
            'type' => 'warehouse',
            'id' => $warehouse->id,
            'name' => $warehouse->name,
            'url' => '/app/inventory',
        ];
    }

    private function authorizeAccess(): void
    {
        abort_unless(
            in_array(
                app(TenantContext::class)
                    ->role()
                    ->value,
                [
                    'owner',
                    'admin',
                    'manager',
                ],
                true,
            ),
            403,
        );
    }
}
