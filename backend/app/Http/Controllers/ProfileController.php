<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Notifications\ProfileEmailChangeNotification;
use App\Tenancy\OrganizationAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Symfony\Component\HttpFoundation\Response;

class ProfileController extends Controller
{
    /**
     * Return the authenticated account together with its current-workspace
     * employment identity.
     */
    public function show(
        Request $request,
    ): JsonResponse {
        $user =
            $request->user();

        $employment =
            $this->employmentForCurrentWorkspace(
                $request,
            );

        $userData =
            $user->only([
                'id',
                'name',
                'email',
                'phone',
                'job_title',
                'bio',
                'pending_email',
                'email_verified_at',
                'created_at',
            ]);

        /*
         * Company-managed employment information is preferred as a fallback
         * when the personal account has not duplicated the same information.
         */
        if (
            empty(
                $userData['phone']
            )
            && ! empty(
                $employment['phone']
            )
        ) {
            $userData['phone'] =
                $employment['phone'];
        }

        if (
            empty(
                $userData['job_title']
            )
            && ! empty(
                $employment['job_title']
            )
        ) {
            $userData['job_title'] =
                $employment['job_title'];
        }

        return response()->json([
            'user' => $userData,

            /*
             * This is display-only. It allows Owner/Admin/etc. to have a useful
             * title in Profile even when no Staff job title has been entered.
             * It is intentionally separate from user.job_title so it is never
             * accidentally persisted as employment data.
             */
            'display_job_title' => $userData['job_title']
                ?: $this->roleDisplayTitle(
                    $employment['membership_role']
                    ?? null,
                ),

            'avatar_url' => $user->avatar_path
                    ? route(
                        'profile.avatar',
                        [
                            'version' => $user->updated_at->timestamp,
                        ],
                    )
                    : null,

            'employment' => $employment,

            'sessions' => $this->sessionsFor(
                $request,
            ),
        ]);
    }

    /**
     * Update account-owned profile fields.
     */
    public function update(
        Request $request,
    ): JsonResponse {
        $data =
            $request->validate([
                'name' => [
                    'required',
                    'string',
                    'max:255',
                ],

                'phone' => [
                    'nullable',
                    'string',
                    'max:50',
                ],

                'job_title' => [
                    'nullable',
                    'string',
                    'max:255',
                ],

                'bio' => [
                    'nullable',
                    'string',
                    'max:1000',
                ],
            ]);

        $request
            ->user()
            ->forceFill(
                $data,
            )
            ->save();

        return $this->show(
            $request,
        );
    }

    /**
     * Stream the authenticated user's private avatar.
     */
    public function avatar(
        Request $request,
    ): Response {
        $avatarPath =
            $request
                ->user()
                ->avatar_path;

        abort_unless(
            $avatarPath,
            404,
        );

        $disk =
            Storage::disk(
                'local',
            );

        abort_unless(
            $disk->exists(
                $avatarPath,
            ),
            404,
        );

        return response()->file(
            $disk->path(
                $avatarPath,
            ),
            [
                'Cache-Control' => 'private, max-age=300',

                'X-Content-Type-Options' => 'nosniff',
            ],
        );
    }

    /**
     * Replace the authenticated user's profile avatar.
     */
    public function uploadAvatar(
        Request $request,
    ): JsonResponse {
        $request->validate([
            'avatar' => [
                'required',
                'image',
                'mimes:jpg,jpeg,png,webp',
                'max:2048',
                'dimensions:max_width=3000,max_height=3000',
            ],
        ]);

        $user =
            $request->user();

        $old =
            $user->avatar_path;

        $path =
            $request
                ->file(
                    'avatar',
                )
                ->store(
                    'profile-avatars',
                    'local',
                );

        $user
            ->forceFill([
                'avatar_path' => $path,
            ])
            ->save();

        if (
            $old
        ) {
            Storage::disk(
                'local',
            )->delete(
                $old,
            );
        }

        return $this->show(
            $request,
        );
    }

    /**
     * Change the current account password and revoke other sessions.
     */
    public function password(
        Request $request,
    ): JsonResponse {
        $data =
            $request->validate([
                'current_password' => [
                    'required',
                    'current_password',
                ],

                'password' => [
                    'required',
                    'confirmed',

                    Password::min(
                        12,
                    )
                        ->mixedCase()
                        ->numbers(),
                ],
            ]);

        $request
            ->user()
            ->forceFill([
                'password' => $data['password'],

                'remember_token' => Str::random(
                    60,
                ),
            ])
            ->save();

        $request
            ->session()
            ->regenerate();

        $this->deleteOtherSessions(
            $request,
        );

        return response()->json([
            'saved' => true,
        ]);
    }

    /**
     * Revoke all database sessions except the current one.
     */
    public function sessions(
        Request $request,
    ): JsonResponse {
        $request->validate([
            'current_password' => [
                'required',
                'current_password',
            ],
        ]);

        $request
            ->user()
            ->forceFill([
                'remember_token' => Str::random(
                    60,
                ),
            ])
            ->save();

        $this->deleteOtherSessions(
            $request,
        );

        return response()->json([
            'saved' => true,
        ]);
    }

    /**
     * Begin a verified email-address change.
     */
    public function email(
        Request $request,
    ): JsonResponse {
        $request->merge([
            'email' => strtolower(
                trim(
                    (string) $request->input(
                        'email',
                    ),
                ),
            ),
        ]);

        $data =
            $request->validate([
                'current_password' => [
                    'required',
                    'current_password',
                ],

                'email' => [
                    'required',
                    'email',
                    'max:255',

                    Rule::unique(
                        'users',
                        'email',
                    ),
                ],
            ]);

        $request
            ->user()
            ->forceFill([
                'pending_email' => $data['email'],
            ])
            ->save();

        $url =
            URL::temporarySignedRoute(
                'profile.email.confirm',
                now()->addHour(),
                [
                    'user' => $request
                        ->user()
                        ->id,

                    'email' => $data['email'],
                ],
            );

        Notification::route(
            'mail',
            $data['email'],
        )->notify(
            new ProfileEmailChangeNotification(
                $url,
            ),
        );

        return response()->json([
            'saved' => true,
        ]);
    }

    /**
     * Complete a pending signed email change.
     */
    public function confirmEmail(
        Request $request,
    ): RedirectResponse {
        $request->validate([
            'email' => [
                'required',
                'email',
                'max:255',

                Rule::unique(
                    'users',
                    'email',
                ),
            ],
        ]);

        DB::transaction(
            function () use (
                $request,
            ): void {
                $user =
                    User::lockForUpdate()
                        ->findOrFail(
                            $request
                                ->user()
                                ->id,
                        );

                abort_unless(
                    (int) $request->query(
                        'user',
                    ) ===
                        $user->id
                    && $user->pending_email ===
                        $request->query(
                            'email',
                        ),
                    403,
                );

                $user
                    ->forceFill([
                        'email' => $user->pending_email,

                        'pending_email' => null,

                        'email_verified_at' => now(),

                        'remember_token' => Str::random(
                            60,
                        ),
                    ])
                    ->save();
            },
        );

        return redirect()->route(
            'app.profile',
        );
    }

    /**
     * Read the authenticated user's employee record inside the active workspace.
     *
     * Only staff_members.user_id is used to identify an employee account. The
     * system deliberately never links records by name because two employees may
     * legally have identical names.
     *
     * @return array<string, mixed>|null
     */
    private function employmentForCurrentWorkspace(
        Request $request,
    ): ?array {
        $organizationId =
            $request
                ->session()
                ->get(
                    OrganizationAccess::SESSION_KEY,
                );

        if (
            ! is_numeric(
                $organizationId,
            )
            || (int) $organizationId <=
                0
        ) {
            return null;
        }

        $organizationId =
            (int) $organizationId;

        $membership =
            $request
                ->user()
                ->memberships()
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->first();

        if (
            ! $membership
        ) {
            return null;
        }

        $staff =
            DB::table(
                'staff_members as staff',
            )
                ->leftJoin(
                    'departments as department',
                    function (
                        $join,
                    ) use (
                        $organizationId,
                    ): void {
                        $join
                            ->on(
                                'department.id',
                                '=',
                                'staff.department_id',
                            )
                            ->where(
                                'department.organization_id',
                                '=',
                                $organizationId,
                            );
                    },
                )
                ->leftJoin(
                    'staff_members as manager',
                    function (
                        $join,
                    ) use (
                        $organizationId,
                    ): void {
                        $join
                            ->on(
                                'manager.id',
                                '=',
                                'department.manager_id',
                            )
                            ->where(
                                'manager.organization_id',
                                '=',
                                $organizationId,
                            )
                            ->whereNull(
                                'manager.deleted_at',
                            );
                    },
                )
                ->where(
                    'staff.organization_id',
                    $organizationId,
                )
                ->where(
                    'staff.user_id',
                    $request
                        ->user()
                        ->id,
                )
                ->whereNull(
                    'staff.deleted_at',
                )
                ->first([
                    'staff.id',
                    'staff.name',
                    'staff.job_title',
                    'staff.phone',
                    'staff.basis',
                    'staff.unit',
                    'staff.currency',
                    'staff.started_on',
                    'staff.active',
                    'staff.department_id',

                    'department.name as department_name',

                    'manager.id as manager_id',
                    'manager.name as manager_name',
                ]);

        $organization =
            DB::table(
                'organizations',
            )
                ->where(
                    'id',
                    $organizationId,
                )
                ->first([
                    'id',
                    'name',
                ]);

        $workspaceRole =
            $membership->workspace_role_id
                ? DB::table(
                    'workspace_roles',
                )
                    ->where(
                        'id',
                        $membership->workspace_role_id,
                    )
                    ->where(
                        'organization_id',
                        $organizationId,
                    )
                    ->first([
                        'id',
                        'name',
                    ])
                : null;

        return [
            'linked' => $staff !==
                null,

            'organization' => [
                'id' => $organizationId,

                'name' => $organization?->name,
            ],

            'membership_role' => $membership
                ->role
                ->value,

            'workspace_role' => $workspaceRole
                    ? [
                        'id' => (int) $workspaceRole->id,

                        'name' => $workspaceRole->name,
                    ]
                    : null,

            'staff_member_id' => $staff
                    ? (int) $staff->id
                    : null,

            'name' => $staff?->name,

            'job_title' => $staff?->job_title,

            'phone' => $staff?->phone,

            'department' => $staff?->department_id
                    ? [
                        'id' => (int) $staff->department_id,

                        'name' => $staff->department_name,
                    ]
                    : null,

            'manager' => $staff?->manager_id
                    ? [
                        'id' => (int) $staff->manager_id,

                        'name' => $staff->manager_name,
                    ]
                    : null,

            'started_on' => $staff?->started_on,

            'active' => $staff
                    ? (bool) $staff->active
                    : null,

            'basis' => $staff?->basis,

            'unit' => $staff?->unit,

            'currency' => $staff?->currency,
        ];
    }

    /**
     * Return a human-readable display fallback for memberships that do not yet
     * have an explicit professional job title.
     */
    private function roleDisplayTitle(
        ?string $role,
    ): ?string {
        return match (
            $role
        ) {
            'owner' => 'Business Owner',

            'admin' => 'Administrator',

            'manager' => 'Manager',

            'accountant' => 'Accountant',

            'employee' => 'Employee',

            default => null,
        };
    }

    /**
     * Return browser sessions when Laravel uses database-backed sessions.
     *
     * @return array<int, array<string, mixed>>
     */
    private function sessionsFor(
        Request $request,
    ): array {
        if (
            config(
                'session.driver',
            ) !==
                'database'
        ) {
            return [];
        }

        return DB::connection(
            config(
                'session.connection',
            ),
        )
            ->table(
                config(
                    'session.table',
                    'sessions',
                ),
            )
            ->where(
                'user_id',
                $request
                    ->user()
                    ->id,
            )
            ->orderByDesc(
                'last_activity',
            )
            ->get([
                'id',
                'ip_address',
                'user_agent',
                'last_activity',
            ])
            ->map(
                fn (
                    object $row,
                ): array => [
                    'id' => $row->id,

                    'ip' => $row->ip_address,

                    'agent' => $row->user_agent,

                    'last_activity' => $row->last_activity,

                    'current' => $row->id ===
                        $request
                            ->session()
                            ->getId(),
                ],
            )
            ->values()
            ->all();
    }

    /**
     * Delete database-backed sessions other than the current request session.
     */
    private function deleteOtherSessions(
        Request $request,
    ): void {
        if (
            config(
                'session.driver',
            ) ===
                'database'
        ) {
            DB::connection(
                config(
                    'session.connection',
                ),
            )
                ->table(
                    config(
                        'session.table',
                        'sessions',
                    ),
                )
                ->where(
                    'user_id',
                    $request
                        ->user()
                        ->id,
                )
                ->where(
                    'id',
                    '!=',
                    $request
                        ->session()
                        ->getId(),
                )
                ->delete();
        }
    }
}
