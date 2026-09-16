<?php

namespace App\Actions\Products;

use App\Exceptions\SafeValidationException;
use App\Models\Product;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

class ForceDeleteProduct
{
    /**
     * Permanently delete an already archived Product only when database
     * integrity allows it.
     *
     * Future invoice/quote foreign keys must use RESTRICT semantics. Those
     * constraints become the final safety net preventing historical business
     * records from losing their Product reference.
     */
    public function execute(
        Product $product,
    ): void {
        if (
            ! $product->trashed()
        ) {
            throw SafeValidationException::forField(
                'record',
                'permanent_delete_requires_archive',
            );
        }

        try {
            DB::transaction(
                function () use (
                    $product,
                ): void {
                    $product
                        ->forceDelete();
                },
                3,
            );
        } catch (
            QueryException $exception
        ) {
            report(
                $exception,
            );

            throw SafeValidationException::forField(
                'record',
                'permanent_delete_blocked',
            );
        }
    }
}
