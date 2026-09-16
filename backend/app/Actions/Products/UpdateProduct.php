<?php

namespace App\Actions\Products;

use App\Events\ProductUpdated;
use App\Models\Product;
use App\Services\ProductSkuGenerator;
use Illuminate\Support\Facades\DB;

class UpdateProduct
{
    /**
     * Build Product updates around the same stable SKU sequence used during
     * creation and imports.
     */
    public function __construct(
        private readonly ProductSkuGenerator $skuGenerator,
    ) {}

    /**
     * Update one active Product under a database lock.
     *
     * Existing SKUs remain stable. Older catalog records that still have no SKU
     * receive one automatically the next time they are saved.
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
                    if (
                        $locked->sku ===
                        null ||
                        trim(
                            $locked->sku,
                        ) === ''
                    ) {
                        $data['sku'] =
                            $this
                                ->skuGenerator
                                ->next();
                    } else {
                        $data['sku'] =
                            $locked->sku;
                    }
                } else {
                    $data['sku'] =
                        $requestedSku;

                    $this
                        ->skuGenerator
                        ->observe(
                            $requestedSku,
                        );
                }

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

                return $locked
                    ->refresh();
            },
        );
    }
}
