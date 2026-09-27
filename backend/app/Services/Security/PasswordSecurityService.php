<?php

namespace App\Services\Security;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

final class PasswordSecurityService
{
    /**
     * Issue a one-time temporary password. The plaintext value is returned to
     * the authorized administrator once and is never stored in the database.
     */
    public function issueTemporaryPassword(
        User $actor,
        User $target,
        ?int $organizationId,
        Request $request,
    ): array {
        $temporaryPassword = Str::password(20, true, true, true, false);
        $expiresAt = now()->addDay();

        DB::transaction(function () use ($target, $temporaryPassword, $expiresAt): void {
            $target->forceFill([
                'password' => Hash::make($temporaryPassword),
                'must_change_password' => true,
                'temporary_password_expires_at' => $expiresAt,
                'password_changed_at' => null,
                'remember_token' => Str::random(60),
            ])->save();

            $this->revokeSessions($target);
            $this->revokePassportTokens($target);
        }, 3);

        $this->audit(
            event: 'password.temporary_issued',
            actor: $actor,
            target: $target,
            organizationId: $organizationId,
            request: $request,
            metadata: ['expires_at' => $expiresAt->toIso8601String()],
        );

        return [
            'temporary_password' => $temporaryPassword,
            'expires_at' => $expiresAt->toIso8601String(),
        ];
    }

    public function completeRequiredPassword(
        User $user,
        string $password,
        Request $request,
    ): void {
        abort_if(
            $user->temporary_password_expires_at
                && $user->temporary_password_expires_at->isPast(),
            422,
            'The temporary password has expired. Request a recovery email or contact an administrator.',
        );

        $user->forceFill([
            'password' => Hash::make($password),
            'must_change_password' => false,
            'temporary_password_expires_at' => null,
            'password_changed_at' => now(),
            'remember_token' => Str::random(60),
        ])->save();

        $this->revokeOtherSessions($user, $request);
        $this->revokePassportTokens($user);

        $this->audit(
            event: 'password.required_change_completed',
            actor: $user,
            target: $user,
            organizationId: null,
            request: $request,
        );
    }

    public function audit(
        string $event,
        ?User $actor,
        ?User $target,
        ?int $organizationId,
        Request $request,
        array $metadata = [],
    ): void {
        if (! Schema::hasTable('security_events')) {
            return;
        }

        DB::table('security_events')->insert([
            'organization_id' => $organizationId,
            'actor_user_id' => $actor?->id,
            'target_user_id' => $target?->id,
            'event' => $event,
            'ip_address' => $request->ip(),
            'user_agent' => Str::limit((string) $request->userAgent(), 500, ''),
            'metadata' => $metadata === [] ? null : json_encode($metadata, JSON_THROW_ON_ERROR),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function revokeSessions(User $user): void
    {
        if (
            config('session.driver') !== 'database'
            || ! Schema::hasTable((string) config('session.table', 'sessions'))
        ) {
            return;
        }

        DB::table((string) config('session.table', 'sessions'))
            ->where('user_id', $user->id)
            ->delete();
    }

    private function revokeOtherSessions(User $user, Request $request): void
    {
        if (
            config('session.driver') !== 'database'
            || ! Schema::hasTable((string) config('session.table', 'sessions'))
        ) {
            return;
        }

        $query = DB::table((string) config('session.table', 'sessions'))
            ->where('user_id', $user->id);

        if ($request->hasSession()) {
            $query->where('id', '!=', $request->session()->getId());
        }

        $query->delete();
    }

    private function revokePassportTokens(User $user): void
    {
        if (Schema::hasTable('oauth_access_tokens')) {
            DB::table('oauth_access_tokens')
                ->where('user_id', $user->id)
                ->update(['revoked' => true]);
        }
    }
}
