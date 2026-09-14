<?php

namespace App\Http\Controllers;

use App\Actions\Memberships\CreateMembership;
use App\Actions\Memberships\DeleteMembership;
use App\Actions\Memberships\UpdateMembership;
use App\Http\Requests\DeleteMembershipRequest;
use App\Http\Requests\StoreMembershipRequest;
use App\Http\Requests\UpdateMembershipRequest;
use App\Http\Resources\MembershipResource;
use App\Models\Membership;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

class MembershipController extends Controller
{
    /**
     * List memberships from the already resolved active organization.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', Membership::class);

        $memberships = Membership::with(
            'user:id,name,email',
        )
            ->orderBy('id')
            ->paginate(25);

        return MembershipResource::collection(
            $memberships,
        );
    }

    /**
     * Add one member after StoreMembershipRequest validates authorization and
     * assignable organization roles.
     */
    public function store(
        StoreMembershipRequest $request,
        CreateMembership $createMembership,
    ): JsonResponse {
        $membership = $createMembership->execute(
            $request->user(),
            $request->validated(),
        );

        return (new MembershipResource($membership))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Update the role of a tenant-scoped membership.
     */
    public function update(
        UpdateMembershipRequest $request,
        UpdateMembership $updateMembership,
    ): JsonResponse {
        $membership = $updateMembership->execute(
            $request->user(),
            $request->membership(),
            $request->validated(),
        );

        return (new MembershipResource($membership))
            ->response();
    }

    /**
     * Remove an authorized non-Owner membership.
     */
    public function destroy(
        DeleteMembershipRequest $request,
        DeleteMembership $deleteMembership,
    ): Response {
        $deleteMembership->execute(
            $request->user(),
            $request->membership(),
        );

        return response()->noContent();
    }
}
