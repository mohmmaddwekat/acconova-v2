<?php

namespace App\Http\Requests;

use App\Enums\ProductType;
use App\Models\Product;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreProductRequest extends FormRequest
{
    /**
     * Authorize Product creation through ProductPolicy.
     */
    public function authorize(): bool
    {
        return $this->user()?->can(
            'create',
            Product::class,
        ) ?? false;
    }

    /**
     * Validate a new Product or Service.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
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
                )->where(
                    /**
                     * SKU uniqueness belongs to one organization.
                     */
                    fn ($query) => $query->where(
                        'organization_id',
                        app(
                            TenantContext::class,
                        )->id(),
                    ),
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
     * Normalize human-entered Product values before validation.
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
}
