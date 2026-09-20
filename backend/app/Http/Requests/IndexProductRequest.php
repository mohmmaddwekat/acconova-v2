<?php

namespace App\Http\Requests;

use App\Enums\ProductType;
use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class IndexProductRequest extends FormRequest
{
    /**
     * Authorize catalog listing through ProductPolicy.
     */
    public function authorize(): bool
    {
        return $this->user()?->can(
            'viewAny',
            Product::class,
        ) ?? false;
    }

    /**
     * Validate Product catalog filters and pagination.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'search' => [
                'nullable',
                'string',
                'max:255',
            ],

            'type' => [
                'nullable',
                Rule::enum(
                    ProductType::class,
                ),
            ],

            'status' => [
                'nullable',
                Rule::in([
                    'active',
                    'deleted',
                ]),
            ],

            'quality' => [
                'nullable',
                Rule::in([
                    'missing_sku',
                    'zero_price',
                    'missing_cost',
                ]),
            ],

            'unit' => [
                'nullable',
                'string',
                'max:40',
            ],

            'min_price' => [
                'nullable',
                'numeric',
                'min:0',
            ],

            'max_price' => [
                'nullable',
                'numeric',
                'min:0',
            ],

            'sort' => [
                'nullable',
                Rule::in([
                    'name_asc',
                    'name_desc',
                    'price_low',
                    'price_high',
                    'newest',
                    'oldest',
                ]),
            ],

            'page' => [
                'sometimes',
                'integer',
                'min:1',
            ],

            'per_page' => [
                'sometimes',
                'integer',
                Rule::in([
                    25,
                    50,
                    100,
                ]),
            ],
        ];
    }

    /**
     * Normalize filter strings before validation.
     */
    protected function prepareForValidation(): void
    {
        $data = [];

        if (
            $this->has(
                'search',
            )
        ) {
            $search =
                trim(
                    (string) $this->input(
                        'search',
                    ),
                );

            $data['search'] =
                $search === ''
                ? null
                : $search;
        }

        foreach (
            [
                'type',
                'status',
                'quality',
                'sort',
            ] as $field
        ) {
            if (
                $this->filled(
                    $field,
                )
            ) {
                $data[$field] =
                    strtolower(
                        trim(
                            (string) $this->input(
                                $field,
                            ),
                        ),
                    );
            }
        }

        if ($this->has('unit')) {
            $unit = trim((string) $this->input('unit'));
            $data['unit'] = $unit === '' ? null : $unit;
        }

        $this->merge(
            $data,
        );
    }
}
