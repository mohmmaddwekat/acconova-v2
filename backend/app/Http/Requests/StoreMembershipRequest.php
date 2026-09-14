<?php

namespace App\Http\Requests;

use App\Enums\OrganizationRole;
use App\Models\Membership;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreMembershipRequest extends FormRequest
{
    /**
     * Allow only users who may manage memberships to enter this flow.
     *
     * The requested role is authorized separately after validation so a
     * valid-but-forbidden role returns 403 instead of being treated as
     * malformed input.
     */
    public function authorize(): bool
    {
        return $this->user()?->can(
            'manage',
            Membership::class,
        ) ?? false;
    }

    /**
     * Validate structurally valid membership input.
     *
     * All non-Owner organization roles are valid API values. Whether the
     * current actor may assign a particular valid role is checked afterward.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $context = app(TenantContext::class);

        return [
            'user_id' => [
                'required',
                'integer',
                'exists:users,id',

                Rule::unique('memberships', 'user_id')
                    ->where(
                        fn ($query) => $query->where(
                            'organization_id',
                            $context->id(),
                        ),
                    ),
            ],

            'role' => [
                'required',

                /*
                 * Owner is intentionally excluded from assignable API roles.
                 * Invalid values therefore produce a validation 422.
                 */
                Rule::in(
                    OrganizationRole::assignableBy(
                        OrganizationRole::Owner,
                    ),
                ),
            ],
        ];
    }

    /**
     * Enforce the actor's role hierarchy only after the submitted role has
     * been proven to be a valid organization role.
     */
    protected function passedValidation(): void
    {
        $role = (string) $this->input('role');

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
}
