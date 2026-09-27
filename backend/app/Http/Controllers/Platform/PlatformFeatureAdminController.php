<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;

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
        abort_unless($request->user()?->isPlatformAdmin(), 403);
    }
}
