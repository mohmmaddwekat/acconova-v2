<?php

namespace App\Http\Requests;

use App\Enums\ProductType;
use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class RecordOpeningStockRequest extends FormRequest
{
    private ?Product $resolvedProduct =
        null;

    /**
     * Resolve a physical Product and authorize stock mutation.
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
     * Validate opening stock input.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'warehouse_id' => [
                'required',
                'integer',
                'min:1',
            ],

            'quantity' => [
                'required',
                'regex:/^\d{1,14}(?:\.\d{1,4})?$/',
            ],

            'note' => [
                'nullable',
                'string',
                'max:1000',
            ],
        ];
    }

    /**
     * Normalize optional stock notes.
     */
    protected function prepareForValidation(): void
    {
        $note =
            trim(
                (string) (
                    $this->input(
                        'note',
                    )
                    ?? ''
                ),
            );

        $this->merge([
            'note' => $note === ''
                ? null
                : $note,
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
