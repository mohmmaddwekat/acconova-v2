<?php

namespace App\Http\Controllers;

use App\Actions\Organizations\TransferOrganizationOwnership;
use App\Enums\OrganizationRole;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OwnershipTransferController extends Controller
{
    /**
     * Transfer the active workspace to one existing non-Owner member.
     *
     * This operation intentionally requires the current Owner password and an
     * exact workspace-name confirmation because it immediately removes the
     * caller's Owner privileges.
     */
    public function store(
        Request $request,
        TenantContext $context,
        TransferOrganizationOwnership $transferOwnership,
    ): JsonResponse {
        abort_unless(
            $context->role()
                === OrganizationRole::Owner,
            403,
        );

        $organization =
            $context->organization();

        $data =
            $request->validate([
                'target_membership_id' => [
                    'required',
                    'integer',

                    Rule::exists(
                        'memberships',
                        'id',
                    )->where(
                        'organization_id',
                        $organization->id,
                    ),
                ],

                'previous_owner_role' => [
                    'required',

                    Rule::in([
                        OrganizationRole::Admin->value,
                        OrganizationRole::Manager->value,
                        OrganizationRole::Accountant->value,
                        OrganizationRole::Employee->value,
                    ]),
                ],

                'previous_owner_workspace_role_id' => [
                    'nullable',
                    'integer',

                    Rule::exists(
                        'workspace_roles',
                        'id',
                    )->where(
                        'organization_id',
                        $organization->id,
                    ),
                ],

                'current_password' => [
                    'required',
                    'current_password',
                ],

                'confirmation' => [
                    'required',
                    'string',

                    Rule::in([
                        $organization->name,
                    ]),
                ],
            ]);

        $result =
            $transferOwnership->execute(
                $request->user(),
                $organization->id,
                (int) $data['target_membership_id'],
                $data['previous_owner_role'],
                isset(
                    $data['previous_owner_workspace_role_id'],
                )
                    ? (int) $data['previous_owner_workspace_role_id']
                    : null,
            );

        return response()->json([
            'transferred' => true,

            'data' => $result,
        ]);
    }
}
