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
     * Create one Product or Service atomically inside the active organization.
     *
     * Every new catalog item starts without inventory tracking. Physical stock
     * is activated explicitly through Inventory after the catalog item exists.
     * Services can therefore never accidentally acquire warehouse state.
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

                /*
                 * Inventory state is intentionally not accepted from normal
                 * catalog creation. Products opt in later; Services never do.
                 */
                $data['track_inventory'] =
                    false;

                $data['low_stock_threshold'] =
                    null;

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
