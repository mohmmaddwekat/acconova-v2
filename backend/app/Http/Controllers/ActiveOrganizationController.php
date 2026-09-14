<?php

namespace App\Http\Controllers;

use App\Actions\Organizations\SwitchActiveOrganization;
use App\Http\Requests\SwitchActiveOrganizationRequest;
use App\Http\Resources\OrganizationResource;
use App\Tenancy\OrganizationAccess;
use Illuminate\Http\JsonResponse;

class ActiveOrganizationController extends Controller
{
    /**
     * Verify the requested organization, persist it as the active tenant in
     * the session, and return the user's organization-specific role.
     */
    public function update(
        SwitchActiveOrganizationRequest $request,
        SwitchActiveOrganization $switchActiveOrganization,
    ): JsonResponse {
        $selection = $switchActiveOrganization->execute(
            $request->user(),
            (int) $request->validated('organization_id'),
        );

        $request->session()->put(
            OrganizationAccess::SESSION_KEY,
            $selection['organization']->id,
        );

        return response()->json([
            'data' => (new OrganizationResource(
                $selection['organization'],
            ))->resolve($request),

            'role' => $selection['role']->value,
        ]);
    }
}
