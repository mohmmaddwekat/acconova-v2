<?php

namespace App\Http\Controllers;

use App\Models\Membership;
use App\Models\User;
use App\Models\WorkspaceRole;
use App\Services\WorkspacePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class WorkspaceRoleController extends Controller
{
    private function authorizeOwner(): void
    {
        abort_unless(app(TenantContext::class)->role()->value === 'owner', 403);
    }

    public function index(): JsonResponse
    {
        $this->authorizeOwner();

        return response()->json(['roles' => WorkspaceRole::orderBy('name')->get(), 'members' => Membership::with('user:id,name,email')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeOwner();
        $data = $request->validate(['name' => ['required', 'string', 'max:100', Rule::unique('workspace_roles', 'name')->where('organization_id', app(TenantContext::class)->id())->ignore($request->route('workspaceRole'))], 'is_custom' => ['sometimes', 'boolean'], 'base_role' => ['required', Rule::in(['manager', 'accountant', 'employee'])], 'permissions' => ['present', 'array'], 'permissions.*' => ['string', 'distinct', Rule::in(WorkspacePermissions::KEYS)]]);
        if (array_intersect($data['permissions'], ['staff.manage', 'staff.pay'])) {
            $data['permissions'] = array_values(array_unique([...$data['permissions'], 'staff.view']));
        }

        if ($data['is_custom'] ?? false) {
            $data['base_role'] = 'employee';
            if (in_array('inventory.view', $data['permissions'], true) || in_array('inventory.manage', $data['permissions'], true)) {
                $data['permissions'][] = 'products.view';
            } if (in_array('products.manage', $data['permissions'], true)) {
                $data['permissions'][] = 'parties.view';
            } foreach ($data['permissions'] as $permission) {
                $data['permissions'][] = explode('.', $permission)[0].'.view';
            } $data['permissions'] = array_values(array_unique($data['permissions']));
        }
        if ($request->route('workspaceRole')) {
            $role = WorkspaceRole::findOrFail($request->route('workspaceRole'));
            $role->update($data);
            Membership::where('workspace_role_id', $role->id)->where('role', '!=', 'owner')->update(['role' => $role->base_role]);

            return response()->json(['data' => $role]);
        }

        return response()->json(['data' => WorkspaceRole::create($data)], 201);
    }

    public function assign(Request $request): JsonResponse
    {
        $this->authorizeOwner();
        $data = $request->validate(['email' => ['required', 'email'], 'workspace_role_id' => ['required', 'integer']]);
        $role = WorkspaceRole::findOrFail($data['workspace_role_id']);
        $user = User::where('email', $data['email'])->firstOrFail();
        DB::transaction(function () use ($user, $role): void {
            $membership = Membership::where('user_id', $user->id)->lockForUpdate()->first();
            abort_if($membership && $membership->role->value === 'owner', 403);
            if (! $membership) {
                $membership = new Membership(['user_id' => $user->id]);
            }
            $membership->role = $role->base_role;
            $membership->workspace_role_id = $role->id;
            $membership->save();
        });

        return response()->json(['ok' => true]);
    }
}
