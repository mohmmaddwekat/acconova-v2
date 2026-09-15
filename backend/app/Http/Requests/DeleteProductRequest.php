<?php

namespace App\Http\Requests;

use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class DeleteProductRequest extends FormRequest
{
    private ?Product $resolvedProduct = null;

    /**
     * Resolve and authorize an active Product before archival.
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
            'delete',
            $this->resolvedProduct,
        ) ?? false;
    }

    /**
     * No body fields are required for archival.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Return the Product being archived.
     */
    public function product(): Product
    {
        return $this->resolvedProduct
            ?? throw new LogicException(
                'Product was not resolved.',
            );
    }
}
