<?php

namespace App\Http\Controllers;

use App\Actions\Organizations\CreateOrganization;
use App\Actions\Organizations\DeleteOrganization;
use App\Actions\Organizations\RestoreOrganization;
use App\Actions\Organizations\UpdateOrganization;
use App\Http\Requests\DeleteOrganizationRequest;
use App\Http\Requests\RestoreOrganizationRequest;
use App\Http\Requests\StoreOrganizationRequest;
use App\Http\Requests\UpdateOrganizationRequest;
use App\Http\Resources\OrganizationResource;
use App\Models\Organization;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class OrganizationController extends Controller
{
    /**
     * List only organizations the authenticated user belongs to.
     *
     * The existing paginator response shape is intentionally preserved during
     * this architecture refactor to avoid changing the public API contract.
     */
    public function index(Request $request): LengthAwarePaginator
    {
        return Organization::query()
            ->whereHas(
                'users',
                fn ($query) => $query->where('users.id', $request->user()->id),
            )
            ->orderBy('id')
            ->paginate(25);
    }

    /**
     * Create a new organization, make the current user its Owner, and select
     * it as the active organization for the current session.
     */
    public function store(
        StoreOrganizationRequest $request,
        CreateOrganization $createOrganization,
    ): JsonResponse {
        $organization = $createOrganization->execute(
            $request->user(),
            $request->validated(),
        );

        $request->session()->put(
            OrganizationAccess::SESSION_KEY,
            $organization->id,
        );

        return (new OrganizationResource($organization))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Return the organization already resolved by tenant middleware together
     * with the user's freshly verified organization-specific role.
     */
    public function show(
        Request $request,
        TenantContext $context,
    ): JsonResponse {
        return response()->json([
            'data' => (new OrganizationResource(
                $context->organization(),
            ))->resolve($request),

            'role' => $context->role()->value,
        ]);
    }

    /**
     * Update the current organization after UpdateOrganizationRequest has
     * validated both authorization and input.
     */
    public function update(
        UpdateOrganizationRequest $request,
        TenantContext $context,
        UpdateOrganization $updateOrganization,
    ): JsonResponse {
        $organization = $updateOrganization->execute(
            $request->user(),
            $context->organization(),
            $request->validated(),
        );

        return response()->json([
            'data' => (new OrganizationResource($organization))
                ->resolve($request),
        ]);
    }

    /**
     * Soft-delete the current organization without destroying memberships or
     * tenant business data, then clear it from the active session if necessary.
     */
    public function destroy(
        DeleteOrganizationRequest $request,
        TenantContext $context,
        DeleteOrganization $deleteOrganization,
    ): Response {
        $organization = $context->organization();

        $deleteOrganization->execute(
            $request->user(),
            $organization,
        );

        /*
     * A deleted organization must never remain selected as the active
     * tenant in the user's server-side session.
     */
        if (
            (string) $request->session()->get(
                OrganizationAccess::SESSION_KEY,
            ) === (string) $organization->id
        ) {
            $request->session()->forget(
                OrganizationAccess::SESSION_KEY,
            );
        }

        return response()->noContent();
    }

    /**
     * Restore an organization previously soft-deleted by its Owner.
     */
    public function restore(
        RestoreOrganizationRequest $request,
        RestoreOrganization $restoreOrganization,
    ): JsonResponse {
        $organization = $restoreOrganization->execute(
            $request->user(),
            $request->organization(),
        );

        return (new OrganizationResource($organization))
            ->response();
    }
}
