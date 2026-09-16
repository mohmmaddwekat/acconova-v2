<?php

namespace App\Http\Requests;

use App\Enums\ProductType;
use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class UpdateInventorySettingsRequest extends FormRequest
{
    private ?Product $resolvedProduct =
        null;

    /**
     * Resolve a physical Product and authorize inventory management.
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
            'manageInventory',
            $this->resolvedProduct,
        ) ?? false;
    }

    /**
     * Validate Product inventory settings.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'track_inventory' => [
                'required',
                'boolean',
            ],

            'low_stock_threshold' => [
                'nullable',
                'regex:/^\d{1,14}(?:\.\d{1,4})?$/',
            ],
        ];
    }

    /**
     * Normalize blank low-stock thresholds.
     */
    protected function prepareForValidation(): void
    {
        $threshold =
            trim(
                (string) (
                    $this->input(
                        'low_stock_threshold',
                    )
                    ?? ''
                ),
            );

        $this->merge([
            'low_stock_threshold' => $threshold === ''
                ? null
                : $threshold,
        ]);
    }

    /**
     * Return the authorized Product.
     */
    public function product(): Product
    {
        return $this->resolvedProduct
            ?? throw new LogicException(
                'Inventory Product was not resolved.',
            );
    }
}
