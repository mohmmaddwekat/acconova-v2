<?php

namespace App\Http\Requests;

use App\Models\Organization;
use Illuminate\Foundation\Http\FormRequest;

class StoreOrganizationRequest extends FormRequest
{
    /**
     * Allow an authenticated user to create a new organization.
     */
    public function authorize(): bool
    {
        return $this->user()?->can('create', Organization::class) ?? false;
    }

    /**
     * Validate only the public fields accepted when creating an organization.
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
     * Normalize the organization name before validation so whitespace-only
     * names are rejected and accidental surrounding spaces are not stored.
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
