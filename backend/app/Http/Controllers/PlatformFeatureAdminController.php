<?php

namespace App\Http\Controllers;

use App\Services\WorkspaceFeaturePermissions;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class PlatformFeatureAdminController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $this->authorizeAdmin($request);

        $groups = collect(WorkspaceFeaturePermissions::groups())
            ->map(function (array $group): array {
                $permissions = collect((array) ($group['permissions'] ?? []))
                    ->map(fn (array $permission): array => [
                        'key' => (string) ($permission['key'] ?? ''),
                        'label_ar' => (string) ($permission['label_ar'] ?? $permission['key'] ?? ''),
                        'label_en' => (string) ($permission['label_en'] ?? $permission['key'] ?? ''),
                        'builtin' => array_values((array) ($permission['builtin'] ?? [])),
                        'depends' => array_values((array) ($permission['depends'] ?? [])),
                    ])
                    ->values()
                    ->all();

                return [
                    'key' => (string) ($group['key'] ?? ''),
                    'title_ar' => (string) ($group['title_ar'] ?? $group['key'] ?? ''),
                    'title_en' => (string) ($group['title_en'] ?? $group['key'] ?? ''),
                    'description_ar' => (string) ($group['description_ar'] ?? ''),
                    'description_en' => (string) ($group['description_en'] ?? ''),
                    'permissions' => $permissions,
                ];
            })
            ->values()
            ->all();

        return Inertia::render('Admin/PlatformFeatures', [
            'groups' => $groups,
            'permissionCount' => collect($groups)->sum(
                fn (array $group): int => count((array) $group['permissions']),
            ),
        ]);
    }

    private function authorizeAdmin(Request $request): void
    {
        $user = $request->user();
        abort_unless($user, 401);

        $email = strtolower(trim((string) $user->email));
        $emails = array_values(array_filter(array_map(
            static fn ($value): string => strtolower(trim((string) $value)),
            (array) config('platform_admin.emails', []),
        )));
        $localAllowed = app()->environment('local')
            && (bool) config('platform_admin.allow_any_authenticated_user_locally', true);

        abort_unless($localAllowed || in_array($email, $emails, true), 403);
    }
}
