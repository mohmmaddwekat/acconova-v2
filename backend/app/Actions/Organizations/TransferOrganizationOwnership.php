<?php

namespace App\Actions\Organizations;

use App\Enums\OrganizationRole;
use App\Models\Membership;
use App\Models\User;
use App\Models\WorkspaceRole;
use Illuminate\Support\Facades\DB;

class TransferOrganizationOwnership
{
    /**
     * Transfer ownership to an existing organization member while keeping
     * exactly one Owner membership throughout the transaction.
     *
     * The Owner membership row itself remains the Owner; only its user_id is
     * transferred to the selected member. The previous Owner receives a new
     * normal membership with the role selected during the transfer.
     *
     * @return array{
     *     new_owner: array{id: int, name: string, email: string},
     *     previous_owner_role: string,
     *     previous_owner_workspace_role_id: int|null
     * }
     */
    public function execute(
        User $actor,
        int $organizationId,
        int $targetMembershipId,
        string $previousOwnerRole,
        ?int $previousOwnerWorkspaceRoleId,
    ): array {
        return DB::transaction(
            function () use (
                $actor,
                $organizationId,
                $targetMembershipId,
                $previousOwnerRole,
                $previousOwnerWorkspaceRoleId,
            ): array {
                /*
                 * Lock the organization itself so two ownership transfers cannot
                 * execute concurrently for the same workspace.
                 */
                $organization =
                    DB::table('organizations')
                        ->where(
                            'id',
                            $organizationId,
                        )
                        ->lockForUpdate()
                        ->first();

                abort_unless(
                    $organization,
                    404,
                );

                $ownerMembership =
                    Membership::withoutGlobalScopes()
                        ->where(
                            'organization_id',
                            $organizationId,
                        )
                        ->where(
                            'user_id',
                            $actor->id,
                        )
                        ->lockForUpdate()
                        ->first();

                abort_unless(
                    $ownerMembership
                        && $ownerMembership->role
                        === OrganizationRole::Owner,
                    403,
                );

                $targetMembership =
                    Membership::withoutGlobalScopes()
                        ->where(
                            'organization_id',
                            $organizationId,
                        )
                        ->where(
                            'id',
                            $targetMembershipId,
                        )
                        ->lockForUpdate()
                        ->first();

                abort_unless(
                    $targetMembership,
                    404,
                );

                abort_if(
                    $targetMembership->role
                        === OrganizationRole::Owner,
                    422,
                );

                abort_if(
                    (int) $targetMembership->user_id
                        === (int) $actor->id,
                    422,
                );

                $fallbackRole =
                    OrganizationRole::tryFrom(
                        $previousOwnerRole,
                    );

                abort_if(
                    ! $fallbackRole
                        || $fallbackRole
                        === OrganizationRole::Owner,
                    422,
                );

                $workspaceRole =
                    null;

                if (
                    $previousOwnerWorkspaceRoleId
                    !== null
                ) {
                    $workspaceRole =
                        WorkspaceRole::withoutGlobalScopes()
                            ->where(
                                'organization_id',
                                $organizationId,
                            )
                            ->where(
                                'is_custom',
                                true,
                            )
                            ->findOrFail(
                                $previousOwnerWorkspaceRoleId,
                            );

                    $fallbackRole =
                        OrganizationRole::tryFrom(
                            $workspaceRole->base_role,
                        );

                    abort_if(
                        ! $fallbackRole
                            || $fallbackRole
                            === OrganizationRole::Owner,
                        422,
                    );
                }

                $targetUserId =
                    (int) $targetMembership->user_id;

                $targetUser =
                    User::findOrFail(
                        $targetUserId,
                    );

                $transferId =
                    DB::table(
                        'organization_ownership_transfers',
                    )->insertGetId([
                        'organization_id' => $organizationId,

                        'from_user_id' => $actor->id,

                        'to_user_id' => $targetUserId,

                        'target_membership_id' => $targetMembership->id,

                        'target_previous_role' => $targetMembership
                            ->role
                            ->value,

                        'target_previous_workspace_role_id' => $targetMembership
                            ->workspace_role_id,

                        'previous_owner_role' => $fallbackRole->value,

                        'previous_owner_workspace_role_id' => $workspaceRole?->id,

                        'status' => 'executing',

                        'created_at' => now(),

                        'updated_at' => now(),
                    ]);

                /*
                 * The target's ordinary membership must be removed before the
                 * Owner membership can adopt its user_id because memberships
                 * are unique per organization/user.
                 */
                $targetMembership->delete();

                /*
                 * Keep the protected Owner row and move ownership identity to
                 * the selected existing member.
                 */
                $ownerMembership->user_id =
                    $targetUserId;

                $ownerMembership->workspace_role_id =
                    null;

                $ownerMembership->save();

                /*
                 * Re-add the previous Owner as a normal member using the access
                 * level chosen in the transfer confirmation.
                 */
                $previousOwnerMembership =
                    new Membership;

                $previousOwnerMembership->organization_id =
                    $organizationId;

                $previousOwnerMembership->user_id =
                    $actor->id;

                $previousOwnerMembership->role =
                    $fallbackRole;

                $previousOwnerMembership->workspace_role_id =
                    $workspaceRole?->id;

                $previousOwnerMembership->save();

                DB::table(
                    'organization_ownership_transfers',
                )
                    ->where(
                        'id',
                        $transferId,
                    )
                    ->update([
                        'status' => 'completed',

                        'completed_at' => now(),

                        'updated_at' => now(),
                    ]);

                return [
                    'new_owner' => [
                        'id' => $targetUser->id,

                        'name' => $targetUser->name,

                        'email' => $targetUser->email,
                    ],

                    'previous_owner_role' => $fallbackRole->value,

                    'previous_owner_workspace_role_id' => $workspaceRole?->id,
                ];
            },
            3,
        );
    }
}
