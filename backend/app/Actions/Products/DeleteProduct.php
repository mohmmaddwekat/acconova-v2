<?php

namespace App\Actions\Products;

use App\Events\ProductArchived;
use App\Exceptions\SafeValidationException;
use App\Models\InventoryBalance;
use App\Models\Product;
use Illuminate\Support\Facades\DB;

class DeleteProduct
{
    /**
     * Archive one Product so it remains historical but becomes unavailable
     * for new business.
     *
     * A physical Product carrying stock cannot be archived because that would
     * hide real inventory from normal operations.
     */
    public function execute(
        Product $product,
    ): void {
        DB::transaction(
            function () use (
                $product,
            ): void {
                $locked =
                    Product::query()
                        ->lockForUpdate()
                        ->findOrFail(
                            $product->id,
                        );

                $hasInventory =
                    InventoryBalance::query()
                        ->where(
                            'product_id',
                            $locked->id,
                        )
                        ->where(
                            function (
                                $query,
                            ): void {
                                $query
                                    ->where(
                                        'on_hand',
                                        '!=',
                                        0,
                                    )
                                    ->orWhere(
                                        'reserved',
                                        '!=',
                                        0,
                                    );
                            },
                        )
                        ->exists();

                if ($hasInventory) {
                    throw SafeValidationException::forField(
                        'product',
                        'product_stock_archive_blocked',
                    );
                }

                $locked->delete();

                ProductArchived::dispatch(
                    $locked,
                );
            },
        );
    }
}
