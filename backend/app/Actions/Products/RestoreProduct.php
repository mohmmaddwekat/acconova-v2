<?php

namespace App\Actions\Products;

use App\Events\ProductRestored;
use App\Models\Product;
use Illuminate\Support\Facades\DB;

class RestoreProduct
{
    /**
     * Restore one archived catalog item to active business use.
     */
    public function execute(
        Product $product,
    ): Product {
        return DB::transaction(
            function () use (
                $product,
            ): Product {
                $locked =
                    Product::onlyTrashed()
                        ->lockForUpdate()
                        ->findOrFail(
                            $product->id,
                        );

                $locked->restore();

                ProductRestored::dispatch(
                    $locked,
                );

                return $locked->refresh();
            },
        );
    }
}
