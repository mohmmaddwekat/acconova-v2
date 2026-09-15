<?php

namespace App\Http\Requests;

use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class RestoreProductRequest extends FormRequest
{
    private ?Product $resolvedProduct = null;

    /**
     * Resolve an archived Product and authorize restoration.
     */
    public function authorize(): bool
    {
        $this->resolvedProduct =
            Product::onlyTrashed()
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
            'restore',
            $this->resolvedProduct,
        ) ?? false;
    }

    /**
     * No request body is required for restoration.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Return the archived Product being restored.
     */
    public function product(): Product
    {
        return $this->resolvedProduct
            ?? throw new LogicException(
                'Product was not resolved.',
            );
    }
}
