<?php

namespace App\Http\Requests;

use App\Enums\OrganizationRole;
use App\Models\Membership;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use LogicException;

class UpdateMembershipRequest extends FormRequest
{
    private ?Membership $resolvedMembership = null;

    /**
     * Allow only Owner/Admin membership managers to enter the update flow.
     *
     * Target-specific authorization intentionally happens after validation
     * so malformed roles preserve the existing 422 API contract.
     */
    public function authorize(): bool
    {
        return $this->user()?->can(
            'manage',
            Membership::class,
        ) ?? false;
    }

    /**
     * Validate that the requested destination role is a structurally valid
     * non-Owner organization role.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'role' => [
                'required',
                Rule::in(
                    OrganizationRole::assignableBy(
                        OrganizationRole::Owner,
                    ),
                ),
            ],
        ];
    }

    /**
     * Resolve the tenant-scoped membership and enforce both target hierarchy
     * and actor-specific role-assignment permissions after validation passes.
     */
    protected function passedValidation(): void
    {
        $this->resolvedMembership = Membership::query()->find(
            $this->route('membership'),
        );

        // Tenant-scoped lookup intentionally hides foreign memberships as 404.
        abort_if(
            $this->resolvedMembership === null,
            404,
        );

        // Owners/Admins may enter membership management, but the Policy still
        // decides whether this particular membership may be changed.
        abort_unless(
            $this->user()?->can(
                'update',
                $this->resolvedMembership,
            ) ?? false,
            403,
        );

        $role = (string) $this->input('role');

        /*
         * A valid role may still be above the actor's authority.
         * Example: Admin cannot promote somebody else to Admin.
         */
        abort_unless(
            in_array(
                $role,
                OrganizationRole::assignableBy(
                    app(TenantContext::class)->role(),
                ),
                true,
            ),
            403,
        );
    }

    /**
     * Return the tenant-scoped membership securely resolved after validation.
     */
    public function membership(): Membership
    {
        return $this->resolvedMembership
            ?? throw new LogicException(
                'Membership was not resolved.',
            );
    }
}
