<?php

namespace App\Http\Requests;

use App\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class DeleteOrganizationRequest extends FormRequest
{
    /**
     * Allow deletion only when the authenticated user may delete the
     * organization already verified by the tenant middleware.
     */
    public function authorize(): bool
    {
        try {
            return $this->user()?->can(
                'delete',
                app(TenantContext::class)->organization(),
            ) ?? false;
        } catch (LogicException) {
            return false;
        }
    }

    /**
     * Organization deletion does not accept request-body data.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }
}
