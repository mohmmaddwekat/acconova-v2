<?php

namespace App\Actions\Products;

use App\Enums\ProductType;
use App\Events\InventoryTrackingChanged;
use App\Events\ProductTypeChanged;
use App\Events\ProductUpdated;
use App\Exceptions\SafeValidationException;
use App\Models\Product;
use App\Services\ProductSkuGenerator;
use Illuminate\Database\Eloquent\Builder;
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
     * Update one active Product or Service under a database lock.
     *
     * Product-to-Service conversion is allowed only before physical inventory
     * history exists. Service-to-Product conversion always starts untracked so
     * warehouse stock must be intentionally initialized through Inventory.
     *
     * @param  array<string, mixed>  $data
     */
    public function execute(
        Product $product,
        array $data,
        ?int $actorId = null,
    ): Product {
        return DB::transaction(
            function () use (
                $product,
                $data,
                $actorId,
            ): Product {
                $locked =
                    Product::query()
                        ->lockForUpdate()
                        ->findOrFail(
                            $product->id,
                        );

                $previousType =
                    $locked->type;

                $targetType =
                    ProductType::from(
                        (string) $data['type'],
                    );

                $typeChanged =
                    $previousType !==
                    $targetType;

                $trackingBefore =
                    (bool) $locked
                        ->track_inventory;

                if (
                    $previousType !== ProductType::Service
                    && $previousType !== $targetType
                ) {
                    $this->guardPhysicalTypeConversion(
                        $locked,
                    );

                    /*
                     * Remove disposable zero-value balances before changing
                     * the physical item's catalog classification.
                     */
                    $locked
                        ->inventoryBalances()
                        ->delete();
                }

                /*
                 * A Service can never track inventory. When a Service becomes
                 * a Product it also starts untracked until explicitly enabled.
                 */
                if (
                    $targetType ===
                    ProductType::Service
                    || (
                        $previousType ===
                        ProductType::Service
                        && $targetType !== ProductType::Service
                    )
                ) {
                    $data['track_inventory'] =
                        false;

                    $data['low_stock_threshold'] =
                        null;
                }

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
                        null
                        || trim(
                            $locked->sku,
                        ) ===
                        ''
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

                    if (
                        $typeChanged
                    ) {
                        ProductTypeChanged::dispatch(
                            (int) $locked
                                ->organization_id,
                            $locked->id,
                            $previousType->value,
                            $targetType->value,
                            $actorId,
                        );
                    }

                    if (
                        $trackingBefore !==
                        (bool) $locked
                            ->track_inventory
                    ) {
                        InventoryTrackingChanged::dispatch(
                            (int) $locked
                                ->organization_id,
                            $locked->id,
                            (bool) $locked
                                ->track_inventory,
                            $locked
                                ->low_stock_threshold,
                            $actorId,
                        );
                    }
                }

                return $locked
                    ->refresh();
            },
        );
    }

    /**
     * Preserve physical catalog classifications once stock or history exists.
     *
     * Historical movements remain immutable accounting/operational evidence
     * and cannot suddenly become movements belonging to a Service.
     */
    private function guardPhysicalTypeConversion(
        Product $product,
    ): void {
        $hasStock =
            $product
                ->inventoryBalances()
                ->where(
                    function (
                        Builder $query,
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

        if ($hasStock) {
            throw SafeValidationException::forField(
                'type',
                'product_to_service_stock_blocked',
            );
        }

        if (
            $product
                ->stockMovements()
                ->exists()
        ) {
            throw SafeValidationException::forField(
                'type',
                'product_to_service_history_blocked',
            );
        }
    }
}
