<?php

namespace App\Http\Requests;

use App\Models\Membership;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class DeleteMembershipRequest extends FormRequest
{
    private ?Membership $resolvedMembership = null;

    /**
     * Resolve the membership inside the active tenant and authorize removal
     * through MembershipPolicy.
     */
    public function authorize(): bool
    {
        $this->resolvedMembership = Membership::query()->find(
            $this->route('membership'),
        );

        abort_if($this->resolvedMembership === null, 404);

        return $this->user()?->can(
            'delete',
            $this->resolvedMembership,
        ) ?? false;
    }

    /**
     * Membership removal does not accept request-body data.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Return the tenant-scoped membership resolved during authorization.
     */
    public function membership(): Membership
    {
        return $this->resolvedMembership
            ?? throw new LogicException(
                'Membership was not resolved.',
            );
    }
}
