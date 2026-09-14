<?php

namespace App\Http\Requests;

use App\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class UpdateOrganizationRequest extends FormRequest
{
    /**
     * Authorize the update against the organization already verified and
     * loaded into the current TenantContext by ResolveOrganization.
     */
    public function authorize(): bool
    {
        try {
            $organization = app(TenantContext::class)->organization();

            return $this->user()?->can('update', $organization) ?? false;
        } catch (LogicException) {
            // Fail closed if the request somehow reaches validation without
            // a verified organization context.
            return false;
        }
    }

    /**
     * Validate the fields that may currently be changed on an organization.
     *
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
        ];
    }

    /**
     * Normalize the organization name before validation.
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('name')) {
            $this->merge([
                'name' => trim((string) $this->input('name')),
            ]);
        }
    }
}
