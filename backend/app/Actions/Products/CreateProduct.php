<?php

namespace App\Actions\Products;

use App\Events\ProductCreated;
use App\Models\Product;
use App\Services\ProductSkuGenerator;
use Illuminate\Support\Facades\DB;

class CreateProduct
{
    /**
     * Build Product creation around the workspace-local SKU generator.
     */
    public function __construct(
        private readonly ProductSkuGenerator $skuGenerator,
    ) {}

    /**
     * Create one Product atomically inside the active organization.
     *
     * Normal UI creation receives an automatically generated SKU. Explicit
     * legacy SKUs remain supported for imports and advance the sequence when
     * they follow the standard SKU-NNN format.
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
                $requestedSku =
                    strtoupper(
                        trim(
                            (string) (
                                $data['sku']
                                ?? ''
                            ),
                        ),
                    );

                if (
                    $requestedSku ===
                    ''
                ) {
                    $data['sku'] =
                        $this
                            ->skuGenerator
                            ->next();
                } else {
                    $data['sku'] =
                        $requestedSku;

                    $this
                        ->skuGenerator
                        ->observe(
                            $requestedSku,
                        );
                }

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
