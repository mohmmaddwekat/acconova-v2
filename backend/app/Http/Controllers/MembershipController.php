<?php

namespace App\Http\Controllers;

use App\Enums\OrganizationRole;
use App\Models\Membership;
use App\Tenancy\TenantContext;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class MembershipController extends Controller
{
    public function index(): LengthAwarePaginator
    {
        Gate::authorize('manage-members');

        return Membership::with('user:id,name,email')->orderBy('id')->paginate(25);
    }

    public function store(Request $request, TenantContext $context): JsonResponse
    {
        Gate::authorize('manage-members');
        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id', Rule::unique('memberships', 'user_id')->where('organization_id', $context->id())],
            'role' => ['required', Rule::in(OrganizationRole::assignableBy(OrganizationRole::Owner))],
        ]);
        abort_unless(in_array($data['role'], OrganizationRole::assignableBy($context->role()), true), 403);

        return response()->json(['data' => Membership::create($data)], 201);
    }

    public function update(Request $request, TenantContext $context, string $organization, string $membership): JsonResponse
    {
        Gate::authorize('manage-members');
        $data = $request->validate(['role' => ['required', Rule::in(OrganizationRole::assignableBy(OrganizationRole::Owner))]]);

        return DB::transaction(function () use ($membership, $context, $data) {
            $record = Membership::lockForUpdate()->findOrFail($membership);
            $this->authorizeChange($record, $context, $data['role']);
            $record->update($data);

            return response()->json(['data' => $record]);
        });
    }

    public function destroy(TenantContext $context, string $organization, string $membership): Response
    {
        Gate::authorize('manage-members');

        return DB::transaction(function () use ($membership, $context) {
            $record = Membership::lockForUpdate()->findOrFail($membership);
            $this->authorizeChange($record, $context);
            $record->delete();

            return response()->noContent();
        });
    }

    private function authorizeChange(Membership $record, TenantContext $context, ?string $newRole = null): void
    {
        abort_if($record->role === OrganizationRole::Owner, 403);
        abort_if($context->role() === OrganizationRole::Admin &&
            ($record->role === OrganizationRole::Admin || ($newRole !== null && ! in_array($newRole, OrganizationRole::assignableBy(OrganizationRole::Admin), true))), 403);
    }
}
