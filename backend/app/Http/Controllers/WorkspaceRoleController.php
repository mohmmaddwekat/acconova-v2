<?php

namespace App\Http\Controllers;

use App\Models\Membership;
use App\Models\User;
use App\Models\WorkspaceRole;
use App\Services\WorkspacePermissions;
use App\Services\WorkspaceRoleCatalog;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class WorkspaceRoleController extends Controller
{
    /**
     * Only the workspace Owner may create, edit, or assign custom roles.
     */
    private function authorizeOwner(): void
    {
        abort_unless(
            app(
                TenantContext::class,
            )->role()->value ===
                'owner',
            403,
        );
    }

    /**
     * Return workspace roles, members, templates, and available permissions.
     */
    public function index(): JsonResponse
    {
        $this->authorizeOwner();

        return response()->json([
            'roles' => WorkspaceRole::orderBy(
                'name',
            )->get(),

            'members' => Membership::with(
                'user:id,name,email',
            )
                ->orderBy(
                    'id',
                )
                ->get(),

            'presets' => WorkspaceRoleCatalog::presets(),

            'permission_keys' => WorkspacePermissions::KEYS,
        ]);
    }

    /**
     * Create or update one custom role.
     */
    public function store(
        Request $request,
    ): JsonResponse {
        $this->authorizeOwner();

        $roleId =
            $request->route(
                'workspaceRole',
            );

        $data =
            $request->validate([
                'name' => [
                    'required',
                    'string',
                    'max:100',

                    Rule::unique(
                        'workspace_roles',
                        'name',
                    )
                        ->where(
                            'organization_id',
                            app(
                                TenantContext::class,
                            )->id(),
                        )
                        ->ignore(
                            $roleId,
                        ),
                ],

                'is_custom' => [
                    'sometimes',
                    'boolean',
                ],

                'base_role' => [
                    'required',

                    Rule::in([
                        'manager',
                        'accountant',
                        'employee',
                    ]),
                ],

                'preset_key' => [
                    'nullable',
                    'string',

                    Rule::in(
                        array_keys(
                            WorkspaceRoleCatalog::presets(),
                        ),
                    ),
                ],

                'permissions' => [
                    'present',
                    'array',
                ],

                'permissions.*' => [
                    'string',
                    'distinct',

                    Rule::in(
                        WorkspacePermissions::KEYS,
                    ),
                ],
            ]);

        $presetKey =
            $data['preset_key']
            ?? null;

        unset(
            $data['preset_key'],
        );

        if (
            $presetKey
            && $data['permissions'] ===
            []
        ) {
            $preset =
                WorkspaceRoleCatalog::preset(
                    $presetKey,
                );

            if ($preset) {
                $data['permissions'] =
                    $preset['permissions'];
            }
        }

        $data['permissions'] =
            WorkspaceRoleCatalog::normalizePermissions(
                $data['permissions'],
            );

        /*
         * Custom roles are permission-driven. Keeping the underlying legacy role
         * at Employee prevents Manager/Accountant defaults from bypassing the
         * explicit custom permission matrix.
         */
        if (
            $data['is_custom']
            ?? false
        ) {
            $data['base_role'] =
                'employee';
        }

        if ($roleId) {
            $role =
                WorkspaceRole::findOrFail(
                    $roleId,
                );

            $role->update(
                $data,
            );

            Membership::where(
                'workspace_role_id',
                $role->id,
            )
                ->where(
                    'role',
                    '!=',
                    'owner',
                )
                ->update([
                    'role' => $role->base_role,
                ]);

            return response()->json([
                'data' => $role->fresh(),
            ]);
        }

        return response()->json([
            'data' => WorkspaceRole::create(
                $data,
            ),
        ], 201);
    }

    /**
     * Resolve one account before role assignment.
     */
    public function preview(
        Request $request,
    ): JsonResponse {
        $this->authorizeOwner();

        $data =
            $request->validate([
                'email' => [
                    'required',
                    'email',
                ],
            ]);

        $user =
            User::where(
                'email',
                strtolower(
                    trim(
                        $data['email'],
                    ),
                ),
            )->firstOrFail();

        return response()->json([
            'id' => $user->id,

            'name' => $user->name,

            'email' => $user->email,
        ]);
    }

    /**
     * Promote or reassign one existing member to a custom workspace role.
     *
     * The current Owner password is required every time because role promotion
     * may grant access to sensitive company, payroll, inventory, or financial
     * information.
     */
    public function assign(
        Request $request,
    ): JsonResponse {
        $this->authorizeOwner();

        $data =
            $request->validate([
                'confirmed_user_id' => [
                    'required',
                    'integer',
                ],

                'email' => [
                    'required',
                    'email',
                ],

                'workspace_role_id' => [
                    'required',
                    'integer',
                ],

                'current_password' => [
                    'required',
                    'current_password',
                ],
            ]);

        $role =
            WorkspaceRole::findOrFail(
                $data['workspace_role_id'],
            );

        $user =
            User::where(
                'email',
                strtolower(
                    trim(
                        $data['email'],
                    ),
                ),
            )->firstOrFail();

        abort_if(
            (int) $data['confirmed_user_id'] !==
                $user->id,
            409,
        );

        DB::transaction(
            function () use (
                $user,
                $role,
            ): void {
                $membership =
                    Membership::where(
                        'user_id',
                        $user->id,
                    )
                        ->lockForUpdate()
                        ->firstOrFail();

                /*
                 * Workspace ownership is never assignable or replaceable through
                 * the employee promotion workflow.
                 */
                abort_if(
                    $membership->role->value ===
                        'owner',
                    403,
                );

                $membership->role =
                    $role->base_role;

                $membership->workspace_role_id =
                    $role->id;

                $membership->save();
            },
            3,
        );

        return response()->json([
            'ok' => true,

            'role' => [
                'id' => $role->id,

                'name' => $role->name,

                'permissions' => $role->permissions,
            ],
        ]);
    }
}
