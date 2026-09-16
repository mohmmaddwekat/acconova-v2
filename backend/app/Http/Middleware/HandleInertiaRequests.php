<?php

namespace App\Http\Middleware;

use App\Models\Organization;
use App\Services\WorkspacePermissions;
use App\Tenancy\OrganizationAccess;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root Blade template used to boot the Inertia application.
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Share authentication and workspace context with every Inertia page.
     *
     * @return array<string, mixed>
     */
    public function share(
        Request $request,
    ): array {
        $user =
            $request->user();

        return [
            ...parent::share(
                $request,
            ),

            'auth' => [
                'user' => $user
                    ? [
                        'id' => $user->id,

                        'name' => $user->name,

                        'email' => $user->email,

                        'emailVerified' => $user->hasVerifiedEmail(),
                    ]
                    : null,
            ],

            'workspace' => fn (): array => $this->workspaceData(
                $request,
            ),
        ];
    }

    /**
     * Build safe workspace-selection data for the authenticated user.
     *
     * One authorized workspace is automatically selected when the session has
     * lost its tenant selection. Multiple workspaces always require explicit
     * user choice.
     *
     * @return array{
     *     organizations: list<array{id: int, name: string, role: string}>,
     *     activeOrganization: array{id: int, name: string, role: string}|null
     * }
     */
    private function workspaceData(
        Request $request,
    ): array {
        $user =
            $request->user();

        if (! $user) {
            return [
                'organizations' => [],

                'activeOrganization' => null,
            ];
        }

        $organizations =
            $user
                ->organizations()
                ->orderBy(
                    'organizations.name',
                )
                ->get()
                ->map(
                    /**
                     * Convert one authorized Organization into the lightweight
                     * browser workspace contract.
                     */
                    function (
                        Organization $organization,
                    ): array {
                        return [
                            'id' => $organization->id,

                            'name' => $organization->name,
                            'currency' => $organization->preferences['currency'] ?? 'ILS',
                            'permissions' => WorkspacePermissions::custom((int) auth()->id(), $organization->id)?->permissions,

                            'role' => (string) $organization
                                ->pivot
                                ->getAttribute(
                                    'role',
                                ),
                        ];
                    },
                )
                ->values();

        $activeOrganizationId =
            (int) $request
                ->session()
                ->get(
                    OrganizationAccess::SESSION_KEY,
                    0,
                );

        $activeOrganization =
            $organizations->first(
                /**
                 * Never trust a session organization unless it is still one
                 * of the authenticated user's current memberships.
                 */
                fn (
                    array $organization,
                ): bool => $organization['id'] ===
                    $activeOrganizationId,
            );

        if (
            $activeOrganizationId > 0 &&
            $activeOrganization === null
        ) {
            $request
                ->session()
                ->forget(
                    OrganizationAccess::SESSION_KEY,
                );
        }

        /*
         * A single-workspace account has no ambiguity. Restoring that
         * selection automatically prevents harmless session loss from making
         * the entire application appear empty.
         */
        if (
            $activeOrganization === null &&
            $organizations->count() === 1
        ) {
            $activeOrganization =
                $organizations->first();

            $request
                ->session()
                ->put(
                    OrganizationAccess::SESSION_KEY,
                    $activeOrganization['id'],
                );
        }

        return [
            'organizations' => $organizations->all(),

            'activeOrganization' => $activeOrganization,
        ];
    }
}
