<?php

namespace App\Http\Requests;

use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class ShowProductRequest extends FormRequest
{
    private ?Product $resolvedProduct = null;

    /**
     * Resolve and authorize one active Product.
     */
    public function authorize(): bool
    {
        $this->resolvedProduct =
            Product::query()
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
     * No additional input is required for Product display.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Return the authorized Product.
     */
    public function product(): Product
    {
        return $this->resolvedProduct
            ?? throw new LogicException(
                'Product was not resolved.',
            );
    }
}
