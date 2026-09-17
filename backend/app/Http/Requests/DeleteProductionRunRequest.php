<?php

namespace App\Http\Requests;

use App\Enums\OrganizationRole;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;

class DeleteProductionRunRequest extends FormRequest
{
    /**
     * Restrict Draft deletion to operational management roles.
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
     * Require the revision the user actually reviewed before deletion.
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
        ];
    }
}
