<?php

namespace App\Http\Requests;

use App\Enums\ProductType;
use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ExportProductRequest extends FormRequest
{
    /**
     * Authorize catalog exports through Product read permission.
     */
    public function authorize(): bool
    {
        return $this->user()?->can(
            'viewAny',
            Product::class,
        ) ?? false;
    }

    /**
     * Validate filters affecting the complete exported dataset.
     *
     * Pagination is intentionally excluded because exports must contain every
     * Product matching the current filters.
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

            'locale' => [
                'nullable',
                'string',
                'max:10',
                'regex:/^[A-Za-z]{2,3}(?:[-_][A-Za-z]{2})?$/',
            ],
        ];
    }

    /**
     * Normalize Product export filters before validation.
     */
    protected function prepareForValidation(): void
    {
        $data = [];

        if (
            $this->has(
                'search',
            )
        ) {
            $search = trim(
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
                $data[$field] = strtolower(
                    trim(
                        (string) $this->input(
                            $field,
                        ),
                    ),
                );
            }
        }

        $this->merge(
            $data,
        );
    }
}
