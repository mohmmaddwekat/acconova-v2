<?php

namespace App\Http\Requests;

use App\Enums\ProductType;
use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class ShowInventoryProductRequest extends FormRequest
{
    private ?Product $resolvedProduct =
        null;

    /**
     * Resolve one active physical Product under the current tenant.
     */
    public function authorize(): bool
    {
        $this->resolvedProduct =
            Product::query()
                ->whereIn(
                    'type',
                    [ProductType::Product->value, ProductType::RawMaterial->value],
                )
                ->find(
                    $this->route(
                        'product',
                    ),
                );

        abort_if(
            $this->resolvedProduct ===
                null,
            404,
        );

        return $this->user()?->can(
            'view',
            $this->resolvedProduct,
        ) ?? false;
    }

    /**
     * Inventory Product Show has no request payload.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Return the authorized tenant-scoped Product.
     */
    public function product(): Product
    {
        return $this->resolvedProduct
            ?? throw new LogicException(
                'Inventory Product was not resolved.',
            );
    }
}
