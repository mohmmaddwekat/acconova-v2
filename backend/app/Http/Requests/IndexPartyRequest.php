<?php

namespace App\Http\Requests;

use App\Enums\PartyRole;
use App\Enums\PartyType;
use App\Models\Party;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class IndexPartyRequest extends FormRequest
{
    /**
     * Authorize Party listing through PartyPolicy.
     */
    public function authorize(): bool
    {
        return $this->user()?->can(
            'viewAny',
            Party::class,
        ) ?? false;
    }

    /**
     * Validate the Party index filtering and pagination contract.
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
                    PartyType::class,
                ),
            ],

            'role' => [
                'nullable',
                Rule::enum(
                    PartyRole::class,
                ),
            ],

            'status' => [
                'nullable',
                Rule::in([
                    'active',
                    'deleted',
                    'all',
                ]),
            ],

            'contact' => [
                'nullable',
                Rule::in([
                    'missing_email',
                    'missing_phone',
                    'missing_both',
                    'complete',
                ]),
            ],

            'city' => [
                'nullable',
                'string',
                'max:120',
            ],

            'country_code' => [
                'nullable',
                'string',
                'max:3',
            ],

            'sort' => [
                'nullable',
                Rule::in([
                    'name_asc',
                    'name_desc',
                    'newest',
                    'oldest',
                ]),
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

            'page' => [
                'sometimes',
                'integer',
                'min:1',
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
     * Normalize user-entered filtering values before querying.
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
                'role',
                'status',
                'contact',
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

        foreach (['city', 'country_code'] as $field) {
            if ($this->has($field)) {
                $value = trim((string) $this->input($field));
                $data[$field] = $value === '' ? null : $value;
            }
        }

        $this->merge(
            $data,
        );
    }
}
