<?php

namespace App\Http\Requests;

use App\Enums\ProductType;
use App\Models\Product;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use LogicException;

class UpdateProductRequest extends FormRequest
{
    private ?Product $resolvedProduct = null;

    /**
     * Resolve and authorize one active tenant-scoped catalog item.
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
            'update',
            $this->resolvedProduct,
        ) ?? false;
    }

    /**
     * Validate a Product update.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $product =
            $this->product();

        return [
            'type' => [
                'required',
                Rule::enum(
                    ProductType::class,
                ),
            ],

            'name' => [
                'required',
                'string',
                'max:255',
            ],

            'sku' => [
                'nullable',
                'string',
                'max:100',

                Rule::unique(
                    'products',
                    'sku',
                )
                    ->where(
                        /**
                         * Keep SKU uniqueness scoped to the active workspace.
                         */
                        fn ($query) => $query->where(
                            'organization_id',
                            app(
                                TenantContext::class,
                            )->id(),
                        ),
                    )
                    ->ignore(
                        $product->id,
                    ),
            ],

            'description' => [
                'nullable',
                'string',
                'max:5000',
            ],

            'unit' => [
                'required',
                'string',
                'max:50',
            ],

            'unit_price' => [
                'required',
                'numeric',
                'min:0',
            ],

            'cost_price' => [
                'nullable',
                'numeric',
                'min:0',
            ],

            'tax_rate' => [
                'required',
                'numeric',
                'min:0',
                'max:100',
            ],
        ];
    }

    /**
     * Normalize editable Product values.
     */
    protected function prepareForValidation(): void
    {
        $sku =
            trim(
                (string) (
                    $this->input(
                        'sku',
                    ) ?? ''
                ),
            );

        $description =
            trim(
                (string) (
                    $this->input(
                        'description',
                    ) ?? ''
                ),
            );

        $this->merge([
            'name' => trim(
                (string) $this->input(
                    'name',
                ),
            ),

            'sku' => $sku === ''
                ? null
                : strtoupper(
                    $sku,
                ),

            'description' => $description === ''
                ? null
                : $description,

            'unit' => trim(
                (string) $this->input(
                    'unit',
                    'unit',
                ),
            ),
        ]);
    }

    /**
     * Return the active Product resolved during authorization.
     */
    public function product(): Product
    {
        return $this->resolvedProduct
            ?? throw new LogicException(
                'Product was not resolved.',
            );
    }
}
