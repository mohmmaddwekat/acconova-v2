<?php

namespace App\Http\Requests;

use App\Enums\ProductType;
use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class SaveProductionRecipeRequest extends FormRequest
{
    private ?Product $resolvedProduct =
        null;

    /**
     * Allow inventory managers to version recipes for physical finished goods.
     */
    public function authorize(): bool
    {
        $this->resolvedProduct =
            Product::query()
                ->where(
                    'type',
                    ProductType::Product->value,
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
     * Validate a complete production Recipe replacement.
     *
     * quantity_per_unit is entered in usage_unit. The service converts that
     * rate into the Raw Material's canonical stock unit before persistence.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'notes' => [
                'nullable',
                'string',
                'max:2000',
            ],

            'components' => [
                'required',
                'array',
                'min:1',
                'max:50',
            ],

            'components.*.name' => [
                'required',
                'string',
                'max:120',
            ],

            'components.*.options' => [
                'required',
                'array',
                'min:1',
                'max:10',
            ],

            'components.*.options.*.raw_material_id' => [
                'required',
                'integer',
                'min:1',
            ],

            'components.*.options.*.quantity_per_unit' => [
                'required',
                'numeric',
                'gt:0',
                'regex:/^\d{1,14}(?:\.\d{1,8})?$/',
            ],

            'components.*.options.*.usage_unit' => [
                'nullable',
                'string',
                'max:32',
            ],

            'components.*.options.*.is_default' => [
                'sometimes',
                'boolean',
            ],
        ];
    }

    /**
     * Return the authorized finished Product.
     */
    public function product(): Product
    {
        return $this->resolvedProduct
            ?? throw new LogicException(
                'Production Product was not resolved.',
            );
    }
}
