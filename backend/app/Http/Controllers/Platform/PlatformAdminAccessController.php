<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class PlatformAdminAccessController extends Controller
{
    public function index(Request $request): Response
    {
        $this->authorizeAdminManager($request);

        $admins = User::query()
            ->whereIn('platform_role', [
                User::PLATFORM_ROLE_ADMIN,
                User::PLATFORM_ROLE_SUPER_ADMIN,
            ])
            ->orderByRaw("CASE WHEN platform_role = 'super_admin' THEN 0 ELSE 1 END")
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'platform_role', 'last_login_at', 'created_at'])
            ->map(fn (User $user): array => $this->adminRow($user))
            ->values()
            ->all();

        $candidates = User::query()
            ->where('platform_role', User::PLATFORM_ROLE_USER)
            ->orderBy('name')
            ->limit(250)
            ->get(['id', 'name', 'email'])
            ->map(fn (User $user): array => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ])
            ->values()
            ->all();

        return Inertia::render('Admin/Admins', [
            'admins' => $admins,
            'candidates' => $candidates,
            'currentUserId' => (int) $request->user()->id,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdminManager($request);

        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $user = User::query()->findOrFail((int) $data['user_id']);

        abort_if(
            $user->platform_role === User::PLATFORM_ROLE_SUPER_ADMIN,
            422,
            'Super Admin accounts cannot be changed from this screen.',
        );

        $user->platform_role = User::PLATFORM_ROLE_ADMIN;
        $user->save();
        $user->refresh();

        return response()->json([
            'ok' => true,
            'admin' => $this->adminRow($user),
        ]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdminManager($request);

        abort_if(
            $user->platform_role === User::PLATFORM_ROLE_SUPER_ADMIN,
            422,
            'Super Admin accounts cannot be removed from this screen.',
        );

        abort_if(
            $user->id === $request->user()->id,
            422,
            'You cannot remove your own platform access.',
        );

        $user->platform_role = User::PLATFORM_ROLE_USER;
        $user->save();

        return response()->json([
            'ok' => true,
            'user_id' => $user->id,
        ]);
    }

    private function authorizeAdminManager(Request $request): void
    {
        $user = $request->user();

        abort_unless($user?->isPlatformAdmin(), 403);

        if ($user->platform_role === User::PLATFORM_ROLE_SUPER_ADMIN) {
            return;
        }

        // Existing configured platform-admin emails are the bootstrap owners of
        // older installations. They may create regular admins, while admins
        // created from this screen cannot grant more platform access.
        $email = strtolower(trim((string) $user->email));
        $bootstrapEmails = array_values(array_filter(array_map(
            static fn ($value): string => strtolower(trim((string) $value)),
            (array) config('platform_admin.emails', []),
        )));

        abort_unless(in_array($email, $bootstrapEmails, true), 403);
    }

    /** @return array<string, mixed> */
    private function adminRow(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'platform_role' => $user->platform_role,
            'last_login_at' => $user->last_login_at?->toIso8601String(),
            'created_at' => $user->created_at?->toIso8601String(),
        ];
    }
}
