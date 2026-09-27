<?php

namespace App\Http\Controllers\Workspace;

use App\Enums\OrganizationRole;
use App\Http\Controllers\Controller;
use App\Models\Membership;
use App\Models\User;
use App\Services\Security\PasswordSecurityService;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password as PasswordRule;

final class WorkspaceSecurityController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly PasswordSecurityService $passwords,
    ) {}

    public function overview(Request $request): JsonResponse
    {
        $user = $request->user();
        $role = $this->context->role();
        $canManageMembers = in_array($role, [OrganizationRole::Owner, OrganizationRole::Admin], true);

        $members = $canManageMembers
            ? Membership::query()
                ->with('user:id,name,email,must_change_password,temporary_password_expires_at,password_changed_at')
                ->orderBy('id')
                ->get()
                ->map(fn (Membership $membership): array => $this->presentMember($membership, $user, $role))
                ->values()
                ->all()
            : [];

        $events = [];
        if (Schema::hasTable('security_events')) {
            $events = DB::table('security_events')
                ->where('organization_id', $this->context->id())
                ->latest('id')
                ->limit(25)
                ->get()
                ->map(fn ($event): array => [
                    'id' => (int) $event->id,
                    'event' => (string) $event->event,
                    'actor_user_id' => $event->actor_user_id ? (int) $event->actor_user_id : null,
                    'target_user_id' => $event->target_user_id ? (int) $event->target_user_id : null,
                    'ip_address' => $event->ip_address,
                    'created_at' => $event->created_at,
                ])
                ->all();
        }

        return response()->json([
            'account' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'verified' => $user->email_verified_at !== null,
                'must_change_password' => (bool) $user->must_change_password,
                'temporary_password_expires_at' => $user->temporary_password_expires_at?->toIso8601String(),
                'password_changed_at' => $user->password_changed_at?->toIso8601String(),
            ],
            'workspace' => [
                'id' => $this->context->id(),
                'name' => $this->context->organization()->name,
                'role' => $role->value,
                'can_manage_members' => $canManageMembers,
                'can_promote_admin' => $role === OrganizationRole::Owner,
            ],
            'members' => $members,
            'events' => $events,
        ]);
    }

    public function issueTemporaryPassword(Request $request, Membership $membership): JsonResponse
    {
        $actor = $request->user();
        $actorRole = $this->context->role();

        abort_unless(in_array($actorRole, [OrganizationRole::Owner, OrganizationRole::Admin], true), 403);
        abort_unless((int) $membership->organization_id === $this->context->id(), 404);
        abort_if((int) $membership->user_id === (int) $actor->id, 422, 'Use account security to change your own password.');
        abort_unless($this->canResetRole($actorRole, $membership->role), 403);

        $request->validate([
            'current_password' => ['required', 'current_password'],
        ]);

        $target = User::query()->findOrFail($membership->user_id);
        $credential = $this->passwords->issueTemporaryPassword(
            actor: $actor,
            target: $target,
            organizationId: $this->context->id(),
            request: $request,
        );

        return response()->json([
            'ok' => true,
            'user' => ['id' => $target->id, 'name' => $target->name, 'email' => $target->email],
            ...$credential,
        ]);
    }

    public function updateRole(Request $request, Membership $membership): JsonResponse
    {
        abort_unless($this->context->role() === OrganizationRole::Owner, 403);
        abort_unless((int) $membership->organization_id === $this->context->id(), 404);
        abort_if($membership->role === OrganizationRole::Owner, 403);

        $data = $request->validate([
            'role' => ['required', Rule::in(OrganizationRole::assignableBy(OrganizationRole::Owner))],
            'current_password' => ['required', 'current_password'],
        ]);

        $previous = $membership->role->value;
        $membership->role = OrganizationRole::from($data['role']);
        $membership->workspace_role_id = null;
        $membership->save();

        $target = User::query()->findOrFail($membership->user_id);
        $this->passwords->audit(
            event: 'workspace.role_changed',
            actor: $request->user(),
            target: $target,
            organizationId: $this->context->id(),
            request: $request,
            metadata: ['from' => $previous, 'to' => $data['role']],
        );

        return response()->json(['ok' => true, 'role' => $data['role']]);
    }

    public function changeRequiredPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'password' => [
                'required',
                'confirmed',
                PasswordRule::min(12)->mixedCase()->numbers()->symbols(),
            ],
        ]);

        abort_unless($request->user()->must_change_password, 409, 'A required password change is not active.');

        $this->passwords->completeRequiredPassword(
            user: $request->user(),
            password: $data['password'],
            request: $request,
        );

        return response()->json(['ok' => true, 'redirect' => '/app']);
    }

    public function sendRecoveryLink(Request $request): JsonResponse
    {
        $status = Password::sendResetLink(['email' => $request->user()->email]);

        $this->passwords->audit(
            event: 'password.recovery_requested',
            actor: $request->user(),
            target: $request->user(),
            organizationId: null,
            request: $request,
        );

        return response()->json([
            'ok' => $status === Password::RESET_LINK_SENT,
            'message' => __($status),
        ], $status === Password::RESET_LINK_SENT ? 200 : 422);
    }

    private function canResetRole(OrganizationRole $actorRole, OrganizationRole $targetRole): bool
    {
        if ($targetRole === OrganizationRole::Owner) {
            return false;
        }

        if ($actorRole === OrganizationRole::Owner) {
            return true;
        }

        return $actorRole === OrganizationRole::Admin
            && in_array($targetRole, [
                OrganizationRole::Manager,
                OrganizationRole::Accountant,
                OrganizationRole::Employee,
            ], true);
    }

    private function presentMember(Membership $membership, User $actor, OrganizationRole $actorRole): array
    {
        return [
            'id' => $membership->id,
            'user_id' => $membership->user_id,
            'name' => $membership->user?->name ?? '—',
            'email' => $membership->user?->email ?? '—',
            'role' => $membership->role->value,
            'must_change_password' => (bool) $membership->user?->must_change_password,
            'temporary_password_expires_at' => $membership->user?->temporary_password_expires_at?->toIso8601String(),
            'password_changed_at' => $membership->user?->password_changed_at?->toIso8601String(),
            'can_reset_password' => (int) $membership->user_id !== (int) $actor->id
                && $this->canResetRole($actorRole, $membership->role),
            'can_change_role' => $actorRole === OrganizationRole::Owner
                && $membership->role !== OrganizationRole::Owner,
        ];
    }
}
