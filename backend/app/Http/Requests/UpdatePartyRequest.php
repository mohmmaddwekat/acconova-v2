<?php

namespace App\Http\Requests;

use App\Enums\PartyRole;
use App\Enums\PartyType;
use App\Models\Party;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use LogicException;

class UpdatePartyRequest extends FormRequest
{
    private ?Party $resolvedParty = null;

    /**
     * Resolve only an active Party from the current tenant and authorize its
     * modification through PartyPolicy.
     */
    public function authorize(): bool
    {
        $this->resolvedParty = Party::query()
            ->with('roles')
            ->find($this->route('party'));

        abort_if(
            $this->resolvedParty === null,
            404,
        );

        return $this->user()?->can(
            'update',
            $this->resolvedParty,
        ) ?? false;
    }

    /**
     * Validate a partial Party update while preserving person/company naming
     * invariants and independently editable customer/supplier roles.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $candidateType = $this->candidateType();

        $switchingType = $candidateType !== null
            && $this->resolvedParty !== null
            && $candidateType !== $this->resolvedParty->type;

        $nameRules = match ($candidateType) {
            PartyType::Person => $switchingType
                ? ['required', 'string', 'max:255']
                : ['sometimes', 'required', 'string', 'max:255'],

            PartyType::Company => [
                'prohibited',
            ],

            default => [
                'sometimes',
                'nullable',
                'string',
                'max:255',
            ],
        };

        $companyNameRules = match ($candidateType) {
            PartyType::Company => $switchingType
                ? ['required', 'string', 'max:255']
                : ['sometimes', 'required', 'string', 'max:255'],

            PartyType::Person => [
                'prohibited',
            ],

            default => [
                'sometimes',
                'nullable',
                'string',
                'max:255',
            ],
        };

        return [
            'type' => [
                'sometimes',
                Rule::enum(PartyType::class),
            ],

            'name' => $nameRules,
            'company_name' => $companyNameRules,

            'email' => [
                'sometimes',
                'nullable',
                'email',
                'max:255',
            ],

            'phone' => [
                'sometimes',
                'nullable',
                'string',
                'max:50',
            ],

            'tax_number' => [
                'sometimes',
                'nullable',
                'string',
                'max:100',
            ],

            'address_line_1' => [
                'sometimes',
                'nullable',
                'string',
                'max:255',
            ],

            'address_line_2' => [
                'sometimes',
                'nullable',
                'string',
                'max:255',
            ],

            'city' => [
                'sometimes',
                'nullable',
                'string',
                'max:100',
            ],

            'state' => [
                'sometimes',
                'nullable',
                'string',
                'max:100',
            ],

            'postal_code' => [
                'sometimes',
                'nullable',
                'string',
                'max:30',
            ],

            'country_code' => [
                'sometimes',
                'nullable',
                'string',
                'size:2',
            ],

            'roles' => [
                'sometimes',
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

    /**
     * Normalize Party values before authorization-independent validation.
     */
    protected function prepareForValidation(): void
    {
        $data = [];

        if ($this->has('email') && $this->input('email') !== null) {
            $data['email'] = strtolower(
                trim((string) $this->input('email')),
            );
        }

        if (
            $this->has('country_code')
            && $this->input('country_code') !== null
        ) {
            $data['country_code'] = strtoupper(
                trim((string) $this->input('country_code')),
            );
        }

        if ($this->has('type')) {
            $data['type'] = strtolower(
                trim((string) $this->input('type')),
            );
        }

        if ($this->has('roles') && is_array($this->input('roles'))) {
            $data['roles'] = array_map(
                fn ($role): string => strtolower(
                    trim((string) $role),
                ),
                $this->input('roles'),
            );
        }

        $this->merge($data);
    }

    /**
     * Determine the Party type that would exist after this partial update.
     */
    private function candidateType(): ?PartyType
    {
        if (! $this->has('type')) {
            return $this->resolvedParty?->type;
        }

        return PartyType::tryFrom(
            (string) $this->input('type'),
        );
    }

    /**
     * Return the authorized tenant-scoped Party resolved by this request.
     */
    public function party(): Party
    {
        return $this->resolvedParty
            ?? throw new LogicException(
                'Party was not resolved.',
            );
    }
}
