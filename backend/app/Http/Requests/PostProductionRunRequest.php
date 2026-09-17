<?php

namespace App\Http\Requests;

use App\Enums\OrganizationRole;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;

class PostProductionRunRequest extends FormRequest
{
    /**
     * Restrict Inventory Posting to operational management roles.
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
     * Posting accepts no mutable production content.
     *
     * The expected revision protects against Posting a Draft that another
     * browser tab changed after the user reviewed it.
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
