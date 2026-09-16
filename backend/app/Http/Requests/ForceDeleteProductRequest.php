<?php

namespace App\Http\Requests;

use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class ForceDeleteProductRequest extends FormRequest
{
    private ?Product $resolvedProduct =
        null;

    /**
     * Resolve only an archived Product from the current organization and
     * authorize its permanent deletion independently from normal archival.
     */
    public function authorize(): bool
    {
        $this->resolvedProduct =
            Product::query()
                ->onlyTrashed()
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
            'forceDelete',
            $this->resolvedProduct,
        ) ?? false;
    }

    /**
     * Permanent deletion carries no client-controlled body values.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Return the archived Product resolved during authorization.
     */
    public function product(): Product
    {
        return $this->resolvedProduct
            ?? throw new LogicException(
                'Product was not resolved.',
            );
    }
}
