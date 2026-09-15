<?php

namespace App\Http\Requests;

use App\Enums\PartyRole;
use App\Enums\PartyType;
use App\Models\Party;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ExportPartyRequest extends FormRequest
{
    /**
     * Authorize Party exports through the same read permission used by the
     * relationship ledger.
     */
    public function authorize(): bool
    {
        return $this->user()?->can(
            'viewAny',
            Party::class,
        ) ?? false;
    }

    /**
     * Validate only filters that affect the exported dataset.
     *
     * Pagination parameters are intentionally not part of this contract
     * because exports always contain every matching record.
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

            'sort' => [
                'nullable',
                Rule::in([
                    'name_asc',
                    'name_desc',
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
     * Normalize text-based export filters before validation and querying.
     */
    protected function prepareForValidation(): void
    {
        $data = [];

        if ($this->has('search')) {
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

        $this->merge($data);
    }
}
