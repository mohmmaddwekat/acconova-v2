<?php

namespace App\Http\Middleware;

use App\Models\Organization;
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
     * Only small public-facing fields are exposed to the browser. Tenant
     * authorization remains enforced independently by the backend APIs.
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();

        return [
            ...parent::share($request),

            'auth' => [
                'user' => $user ? [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'emailVerified' => $user->hasVerifiedEmail(),
                ] : null,
            ],

            'workspace' => fn (): array => $this->workspaceData($request),
        ];
    }

    /**
     * Build the organization selector data for the authenticated user.
     *
     * The active organization comes only from the server-side session and
     * organizations outside the authenticated user's memberships are excluded.
     *
     * @return array{
     *     organizations: list<array{id: int, name: string, role: string}>,
     *     activeOrganization: array{id: int, name: string, role: string}|null
     * }
     */
    private function workspaceData(Request $request): array
    {
        $user = $request->user();

        if (! $user) {
            return [
                'organizations' => [],
                'activeOrganization' => null,
            ];
        }

        $organizations = Organization::query()
            ->select([
                'organizations.id',
                'organizations.name',
                'memberships.role as membership_role',
            ])
            ->join(
                'memberships',
                'memberships.organization_id',
                '=',
                'organizations.id',
            )
            ->where('memberships.user_id', $user->id)
            ->orderBy('organizations.name')
            ->get()
            ->map(
                /**
                 * Convert one authorized organization into lightweight
                 * browser-safe workspace data.
                 */
                fn (Organization $organization): array => [
                    'id' => $organization->id,
                    'name' => $organization->name,
                    'role' => (string) $organization->getAttribute(
                        'membership_role',
                    ),
                ],
            )
            ->values();

        $activeOrganizationId = (int) $request->session()->get(
            OrganizationAccess::SESSION_KEY,
            0,
        );

        $activeOrganization = $organizations->first(
            /**
             * Match the session tenant only against organizations the current
             * authenticated user is actually a member of.
             */
            fn (array $organization): bool => $organization['id'] === $activeOrganizationId,
        );

        return [
            'organizations' => $organizations->all(),
            'activeOrganization' => $activeOrganization,
        ];
    }
}
