<?php

namespace App\Actions\Products;

use App\Events\ProductUpdated;
use App\Models\Product;
use Illuminate\Support\Facades\DB;

class UpdateProduct
{
    /**
     * Update one active Product under a database lock.
     *
     * @param  array<string, mixed>  $data
     */
    public function execute(
        Product $product,
        array $data,
    ): Product {
        return DB::transaction(
            function () use (
                $product,
                $data,
            ): Product {
                $locked =
                    Product::query()
                        ->lockForUpdate()
                        ->findOrFail(
                            $product->id,
                        );

                $locked->fill(
                    $data,
                );

                if (
                    $locked->isDirty()
                ) {
                    $locked->save();

                    ProductUpdated::dispatch(
                        $locked,
                    );
                }

                return $locked->refresh();
            },
        );
    }
}
