<?php

namespace App\Http\Controllers;

use App\Models\InventoryBalance;
use App\Models\Product;
use App\Models\Warehouse;
use App\Services\InventoryStockService;
use App\Services\WorkspacePermissions;
use App\Support\InventoryQuantity;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class InventoryTransferWorkflowController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $status = $request->validate([
            'status' => [
                'nullable',
                Rule::in([
                    'requested',
                    'approved',
                    'shipped',
                    'received',
                    'rejected',
                    'all',
                ]),
            ],
        ])['status'] ?? 'all';

        $query = DB::table('inventory_transfer_requests as transfers')
            ->join('products as products', 'products.id', '=', 'transfers.product_id')
            ->join('warehouses as source', 'source.id', '=', 'transfers.source_warehouse_id')
            ->join('warehouses as destination', 'destination.id', '=', 'transfers.destination_warehouse_id')
            ->leftJoin('users as requester', 'requester.id', '=', 'transfers.requested_by')
            ->leftJoin('users as approver', 'approver.id', '=', 'transfers.approved_by')
            ->where(
                'transfers.organization_id',
                app(TenantContext::class)->id(),
            );

        if ($status !== 'all') {
            $query->where('transfers.status', $status);
        }

        return response()->json([
            'data' => $query
                ->latest('transfers.id')
                ->limit(250)
                ->get([
                    'transfers.id',
                    'transfers.product_id',
                    'products.name as product_name',
                    'products.sku',
                    'transfers.source_warehouse_id',
                    'source.name as source_warehouse_name',
                    'transfers.destination_warehouse_id',
                    'destination.name as destination_warehouse_name',
                    'transfers.quantity',
                    'transfers.status',
                    'transfers.note',
                    'transfers.requested_by',
                    'requester.name as requested_by_name',
                    'transfers.approved_by',
                    'approver.name as approved_by_name',
                    'transfers.approved_at',
                    'transfers.shipped_at',
                    'transfers.received_at',
                    'transfers.created_at',
                ]),
            'options' => [
                'products' => Product::query()
                    ->usableForNewBusiness()
                    ->where('track_inventory', true)
                    ->orderBy('name')
                    ->limit(1000)
                    ->get([
                        'id',
                        'name',
                        'sku',
                        'unit',
                    ]),
                'warehouses' => Warehouse::query()
                    ->orderByDesc('is_default')
                    ->orderBy('name')
                    ->get([
                        'id',
                        'name',
                        'code',
                    ]),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer'],
            'source_warehouse_id' => ['required', 'integer', 'different:destination_warehouse_id'],
            'destination_warehouse_id' => ['required', 'integer'],
            'quantity' => ['required', 'numeric', 'gt:0', 'max:999999999'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $product = Product::query()
            ->usableForNewBusiness()
            ->findOrFail((int) $data['product_id']);

        abort_unless($product->tracksInventory(), 422);

        Warehouse::query()->findOrFail((int) $data['source_warehouse_id']);
        Warehouse::query()->findOrFail((int) $data['destination_warehouse_id']);

        $id = DB::table('inventory_transfer_requests')
            ->insertGetId([
                'organization_id' => app(TenantContext::class)->id(),
                'product_id' => $product->id,
                'source_warehouse_id' => (int) $data['source_warehouse_id'],
                'destination_warehouse_id' => (int) $data['destination_warehouse_id'],
                'quantity' => $data['quantity'],
                'status' => 'requested',
                'note' => isset($data['note'])
                    ? trim((string) $data['note']) ?: null
                    : null,
                'requested_by' => $request->user()->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' => [
                'id' => $id,
                'status' => 'requested',
            ],
        ], 201);
    }

    public function transition(
        Request $request,
        string $transfer,
        InventoryStockService $inventory,
    ): JsonResponse {
        $data = $request->validate([
            'action' => [
                'required',
                Rule::in([
                    'approve',
                    'reject',
                    'ship',
                    'receive',
                ]),
            ],
        ]);

        $updated = DB::transaction(
            function () use (
                $request,
                $transfer,
                $inventory,
                $data,
            ): object {
                $row = DB::table('inventory_transfer_requests')
                    ->where(
                        'organization_id',
                        app(TenantContext::class)->id(),
                    )
                    ->where('id', (int) $transfer)
                    ->lockForUpdate()
                    ->first();

                abort_unless($row, 404);

                $action = $data['action'];

                if (
                    in_array(
                        $action,
                        ['approve', 'reject'],
                        true,
                    )
                ) {
                    $this->authorizeApprover(
                        $request,
                    );

                    abort_unless(
                        in_array(
                            $row->status,
                            ['requested', 'approved'],
                            true,
                        ),
                        422,
                    );
                }

                if ($action === 'approve') {
                    DB::table('inventory_transfer_requests')
                        ->where('id', $row->id)
                        ->update([
                            'status' => 'approved',
                            'approved_by' => $request->user()->id,
                            'approved_at' => now(),
                            'updated_at' => now(),
                        ]);
                } elseif ($action === 'reject') {
                    DB::table('inventory_transfer_requests')
                        ->where('id', $row->id)
                        ->update([
                            'status' => 'rejected',
                            'approved_by' => $request->user()->id,
                            'approved_at' => now(),
                            'updated_at' => now(),
                        ]);
                } elseif ($action === 'ship') {
                    abort_unless(
                        $row->status === 'approved',
                        422,
                    );

                    /*
                     * Shipping reserves the source quantity. That keeps the
                     * stock physically on hand until receipt, while removing it
                     * from available stock so another sale/transfer cannot
                     * consume the same units in transit.
                     */
                    $this->reserveShipment(
                        (int) $row->product_id,
                        (int) $row->source_warehouse_id,
                        (string) $row->quantity,
                    );

                    DB::table('inventory_transfer_requests')
                        ->where('id', $row->id)
                        ->update([
                            'status' => 'shipped',
                            'shipped_by' => $request->user()->id,
                            'shipped_at' => now(),
                            'updated_at' => now(),
                        ]);
                } else {
                    abort_unless(
                        $row->status === 'shipped',
                        422,
                    );

                    $product = Product::query()
                        ->findOrFail(
                            (int) $row->product_id,
                        );

                    /*
                     * Release only this workflow's transit reservation, then
                     * perform the normal atomic warehouse transfer. If the
                     * transfer fails, the outer transaction restores the
                     * reservation and leaves the request shipped.
                     */
                    $this->releaseShipmentReservation(
                        (int) $row->product_id,
                        (int) $row->source_warehouse_id,
                        (string) $row->quantity,
                    );

                    $inventory->transferStock(
                        $product,
                        (int) $row->source_warehouse_id,
                        (int) $row->destination_warehouse_id,
                        (string) $row->quantity,
                        'Transfer workflow #'.$row->id
                            .($row->note ? ' · '.$row->note : ''),
                        $request->user()->id,
                    );

                    DB::table('inventory_transfer_requests')
                        ->where('id', $row->id)
                        ->update([
                            'status' => 'received',
                            'received_by' => $request->user()->id,
                            'received_at' => now(),
                            'updated_at' => now(),
                        ]);
                }

                return DB::table('inventory_transfer_requests')
                    ->where('id', $row->id)
                    ->first();
            },
            3,
        );

        return response()->json([
            'data' => $updated,
        ]);
    }

    private function reserveShipment(
        int $productId,
        int $warehouseId,
        string $quantity,
    ): void {
        Product::query()
            ->lockForUpdate()
            ->findOrFail($productId);

        $balance = InventoryBalance::query()
            ->where('product_id', $productId)
            ->where('warehouse_id', $warehouseId)
            ->lockForUpdate()
            ->first();

        if (! $balance) {
            throw ValidationException::withMessages([
                'quantity' => [
                    'The source warehouse has no available stock for this transfer.',
                ],
            ]);
        }

        $units = InventoryQuantity::toUnits($quantity);
        $onHand = InventoryQuantity::toUnits(
            $balance->on_hand,
        );
        $reserved = InventoryQuantity::toUnits(
            $balance->reserved,
        );
        $available = $onHand - $reserved;

        if (
            $units <= 0
            || $available < $units
        ) {
            throw ValidationException::withMessages([
                'quantity' => [
                    'The source warehouse no longer has enough available stock to ship this transfer.',
                ],
            ]);
        }

        $balance->reserved =
            InventoryQuantity::fromUnits(
                $reserved + $units,
            );
        $balance->save();
    }

    private function releaseShipmentReservation(
        int $productId,
        int $warehouseId,
        string $quantity,
    ): void {
        $balance = InventoryBalance::query()
            ->where('product_id', $productId)
            ->where('warehouse_id', $warehouseId)
            ->lockForUpdate()
            ->first();

        abort_unless($balance, 422);

        $units = InventoryQuantity::toUnits($quantity);
        $reserved = InventoryQuantity::toUnits(
            $balance->reserved,
        );

        if (
            $units <= 0
            || $reserved < $units
        ) {
            throw ValidationException::withMessages([
                'quantity' => [
                    'The in-transit stock reservation is inconsistent. Review this transfer before receiving it.',
                ],
            ]);
        }

        $balance->reserved =
            InventoryQuantity::fromUnits(
                $reserved - $units,
            );
        $balance->save();
    }

    private function authorizeApprover(
        Request $request,
    ): void {
        $context =
            app(TenantContext::class);
        $role =
            $context->role()->value;

        if (
            in_array(
                $role,
                [
                    'owner',
                    'admin',
                    'manager',
                ],
                true,
            )
        ) {
            return;
        }

        $custom =
            WorkspacePermissions::custom(
                $request->user()->id,
                $context->id(),
            );

        abort_unless(
            $custom
            && in_array(
                'inventory.manage',
                $custom->permissions,
                true,
            ),
            403,
        );
    }
}
