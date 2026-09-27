<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Security\PasswordSecurityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class PlatformUserSecurityController extends Controller
{
    public function __construct(
        private readonly PasswordSecurityService $passwords,
    ) {}

    public function issueTemporaryPassword(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        abort_unless($actor?->isPlatformAdmin(), 403);
        abort_if((int) $actor->id === (int) $user->id, 422, 'Use your account profile to change your own password.');

        if ($user->isPlatformAdmin()) {
            abort_unless($actor->platform_role === User::PLATFORM_ROLE_SUPER_ADMIN, 403);
            abort_if($user->platform_role === User::PLATFORM_ROLE_SUPER_ADMIN, 403, 'Super admin recovery must use the account recovery flow.');
        }

        $request->validate([
            'current_password' => ['required', 'current_password'],
        ]);

        $credential = $this->passwords->issueTemporaryPassword(
            actor: $actor,
            target: $user,
            organizationId: null,
            request: $request,
        );

        return response()->json([
            'ok' => true,
            'user' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email],
            ...$credential,
        ]);
    }
}
