<?php

namespace App\Http\Requests;

use App\Enums\PartyRole;
use App\Enums\PartyType;
use App\Models\Party;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePartyRequest extends FormRequest
{
    /**
     * Authorize Party creation through the tenant-aware Party policy.
     */
    public function authorize(): bool
    {
        return $this->user()?->can(
            'create',
            Party::class,
        ) ?? false;
    }

    /**
     * Validate a new Party while preventing duplicate email identities inside
     * the active organization.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $organizationId = app(
            TenantContext::class,
        )->id();

        return [
            'type' => [
                'required',
                Rule::enum(
                    PartyType::class,
                ),
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

                /*
                 * Party identities are unique only inside the current tenant.
                 * Another organization may legitimately work with the same
                 * person or company.
                 */
                Rule::unique(
                    'parties',
                    'email',
                )->where(
                    'organization_id',
                    $organizationId,
                ),
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
                Rule::enum(
                    PartyRole::class,
                ),
            ],
        ];
    }

    /**
     * Normalize Party identity values before validation and persistence.
     */
    protected function prepareForValidation(): void
    {
        $data = [];

        if (
            $this->has('email')
            && $this->input('email') !== null
        ) {
            $data['email'] = strtolower(
                trim(
                    (string) $this->input(
                        'email',
                    ),
                ),
            );
        }

        if (
            $this->has('country_code')
            && $this->input('country_code') !== null
        ) {
            $data['country_code'] = strtoupper(
                trim(
                    (string) $this->input(
                        'country_code',
                    ),
                ),
            );
        }

        if ($this->has('type')) {
            $data['type'] = strtolower(
                trim(
                    (string) $this->input(
                        'type',
                    ),
                ),
            );
        }

        if (
            $this->has('roles')
            && is_array(
                $this->input('roles'),
            )
        ) {
            $data['roles'] = array_map(
                /**
                 * Normalize submitted role values before enum validation.
                 */
                fn ($role): string => strtolower(
                    trim((string) $role),
                ),
                $this->input('roles'),
            );
        }

        $this->merge($data);
    }

    /**
     * Provide clear business-facing validation feedback.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'email.unique' => 'A relationship with this email already exists in this workspace.',

            'name.required_if' => 'A person name is required.',

            'company_name.required_if' => 'A company name is required.',

            'roles.required' => 'Choose at least one relationship type.',

            'roles.min' => 'Choose at least one relationship type.',
        ];
    }
}
