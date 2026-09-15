<?php

namespace App\Actions\Products;

use App\Events\ProductCreated;
use App\Models\Product;
use Illuminate\Support\Facades\DB;

class CreateProduct
{
    /**
     * Create one Product atomically inside the active organization.
     *
     * @param  array<string, mixed>  $data
     */
    public function execute(
        array $data,
    ): Product {
        return DB::transaction(
            function () use (
                $data,
            ): Product {
                $product =
                    Product::create(
                        $data,
                    );

                ProductCreated::dispatch(
                    $product,
                );

                return $product;
            },
        );
    }
}
