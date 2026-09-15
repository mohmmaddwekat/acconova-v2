<?php

namespace App\Actions\Products;

use App\Events\ProductArchived;
use App\Models\Product;
use Illuminate\Support\Facades\DB;

class DeleteProduct
{
    /**
     * Archive one Product so it remains historical but becomes unavailable
     * for new business.
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

                $locked->delete();

                ProductArchived::dispatch(
                    $locked,
                );
            },
        );
    }
}
