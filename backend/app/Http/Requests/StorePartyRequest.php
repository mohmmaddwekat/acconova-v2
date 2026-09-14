<?php

namespace App\Http\Requests;

use App\Enums\PartyRole;
use App\Enums\PartyType;
use App\Models\Party;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePartyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Party::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'type' => [
                'required',
                Rule::enum(PartyType::class),
            ],

            'name' => [
                'nullable',
                'string',
                'max:255',
                'required_if:type,person',
                'prohibited_if:type,company',
            ],

            'company_name' => [
                'nullable',
                'string',
                'max:255',
                'required_if:type,company',
                'prohibited_if:type,person',
            ],

            'email' => [
                'nullable',
                'email',
                'max:255',
            ],

            'phone' => [
                'nullable',
                'string',
                'max:50',
            ],

            'tax_number' => [
                'nullable',
                'string',
                'max:100',
            ],

            'address_line_1' => [
                'nullable',
                'string',
                'max:255',
            ],

            'address_line_2' => [
                'nullable',
                'string',
                'max:255',
            ],

            'city' => [
                'nullable',
                'string',
                'max:100',
            ],

            'state' => [
                'nullable',
                'string',
                'max:100',
            ],

            'postal_code' => [
                'nullable',
                'string',
                'max:30',
            ],

            'country_code' => [
                'nullable',
                'string',
                'size:2',
            ],

            'roles' => [
                'required',
                'array',
                'min:1',
                'max:2',
            ],

            'roles.*' => [
                'required',
                'distinct',
                Rule::enum(PartyRole::class),
            ],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->filled('country_code')) {
            $this->merge([
                'country_code' => strtoupper(
                    trim((string) $this->input('country_code'))
                ),
            ]);
        }
    }
}
