<?php

namespace App\Actions\Products;

use App\Models\Product;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class BulkProductAction
{
    /**
     * Reuse normal single-Product lifecycle actions so bulk operations preserve
     * locking, domain events, and archive semantics.
     */
    public function __construct(
        private readonly DeleteProduct $deleteProduct,
        private readonly RestoreProduct $restoreProduct,
    ) {}

    /**
     * Archive or restore an authorized Product collection atomically.
     *
     * @param  Collection<int, Product>  $products
     */
    public function execute(
        Collection $products,
        string $action,
    ): int {
        if (
            ! in_array(
                $action,
                [
                    'archive',
                    'restore',
                ],
                true,
            )
        ) {
            throw new InvalidArgumentException(
                'Unsupported bulk Product action.',
            );
        }

        return DB::transaction(
            function () use (
                $products,
                $action,
            ): int {
                foreach (
                    $products as $product
                ) {
                    if (
                        $action === 'archive'
                    ) {
                        $this->deleteProduct
                            ->execute(
                                $product,
                            );

                        continue;
                    }

                    $this->restoreProduct
                        ->execute(
                            $product,
                        );
                }

                return $products->count();
            },
        );
    }
}
