<?php

namespace App\Http\Requests;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class RestoreOrganizationRequest extends FormRequest
{
    private ?Organization $resolvedOrganization = null;

    /**
     * Resolve only a soft-deleted organization owned by the authenticated
     * user, then verify the restore policy as a second authorization layer.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        $organizationId = (int) $this->route('organization');

        if ($user === null || $organizationId < 1) {
            return false;
        }

        $this->resolvedOrganization = Organization::onlyTrashed()
            ->whereKey($organizationId)
            ->whereHas(
                'users',
                fn ($query) => $query
                    ->where('users.id', $user->id)
                    ->where(
                        'memberships.role',
                        OrganizationRole::Owner->value,
                    ),
            )
            ->first();

        abort_if($this->resolvedOrganization === null, 404);

        return $user->can(
            'restore',
            $this->resolvedOrganization,
        );
    }

    /**
     * Organization restoration does not accept request-body data.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Return the soft-deleted organization securely resolved during
     * authorization.
     */
    public function organization(): Organization
    {
        return $this->resolvedOrganization
            ?? throw new LogicException(
                'Restorable organization was not resolved.',
            );
    }
}
