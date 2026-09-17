<?php

namespace App\Http\Requests;

use App\Enums\OrganizationRole;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;

class ReverseProductionRunRequest extends FormRequest
{
    /**
     * Restrict production reversal to Inventory management roles.
     */
    public function authorize(): bool
    {
        return in_array(
            app(
                TenantContext::class,
            )->role(),
            [
                OrganizationRole::Owner,
                OrganizationRole::Admin,
                OrganizationRole::Manager,
            ],
            true,
        );
    }

    /**
     * Require a revision and human-readable audit reason.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'expected_revision' => [
                'required',
                'integer',
                'min:1',
            ],

            'reason' => [
                'required',
                'string',
                'min:3',
                'max:2000',
            ],
        ];
    }

    /**
     * Normalize the audit reason before persistence.
     */
    protected function prepareForValidation(): void
    {
        $this->merge([
            'reason' => trim(
                (string) $this->input(
                    'reason',
                    '',
                ),
            ),
        ]);
    }
}
