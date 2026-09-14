<?php

namespace App\Http\Controllers;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Tenancy\TenantContext;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class OrganizationController extends Controller
{
    public function index(Request $request): LengthAwarePaginator
    {
        return Organization::query()
            ->whereHas('users', fn ($query) => $query->where('users.id', $request->user()->id))
            ->orderBy('id')->paginate(25);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:255']]);
        $organization = DB::transaction(function () use ($data, $request) {
            $organization = Organization::create($data);
            $organization->users()->attach($request->user()->id, ['role' => OrganizationRole::Owner->value]);

            return $organization;
        });

        return response()->json(['data' => $organization], 201);
    }

    public function show(TenantContext $context): JsonResponse
    {
        return response()->json(['data' => $context->organization(), 'role' => $context->role()->value]);
    }

    public function update(Request $request, TenantContext $context): JsonResponse
    {
        Gate::authorize('manage-organization');
        $context->organization()->update($request->validate(['name' => ['required', 'string', 'max:255']]));

        return response()->json(['data' => $context->organization()->fresh()]);
    }
}
