from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    content = target.read_text(encoding='utf-8')
    if old not in content:
        raise SystemExit(f'Pattern not found in {path}: {old[:120]!r}')
    target.write_text(content.replace(old, new, 1), encoding='utf-8')


write('backend/database/migrations/2026_09_27_140000_add_account_security_state.php', r'''<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('must_change_password')->default(false)->after('password');
            $table->timestamp('temporary_password_expires_at')->nullable()->after('must_change_password');
            $table->timestamp('password_changed_at')->nullable()->after('temporary_password_expires_at');
        });

        Schema::create('security_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('target_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('event', 120)->index();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('security_events');

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'must_change_password',
                'temporary_password_expires_at',
                'password_changed_at',
            ]);
        });
    }
};
''')

write('backend/app/Services/Security/PasswordSecurityService.php', r'''<?php

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
''')

write('backend/app/Http/Middleware/ForcePasswordChange.php', r'''<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class ForcePasswordChange
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->must_change_password) {
            return $next($request);
        }

        if ($this->allowed($request)) {
            return $next($request);
        }

        if ($request->expectsJson() || $request->is('api/*')) {
            return response()->json([
                'message' => 'A password change is required before continuing.',
                'code' => 'password_change_required',
                'redirect' => route('password.change-required'),
            ], 423);
        }

        return redirect()->route('password.change-required');
    }

    private function allowed(Request $request): bool
    {
        return $request->is('password-change-required')
            || $request->is('api/security/change-required-password')
            || $request->is('api/security/send-recovery-link')
            || $request->is('api/logout')
            || $request->is('api/auth/logout');
    }
}
''')

write('backend/app/Http/Controllers/Workspace/WorkspaceSecurityController.php', r'''<?php

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
''')

write('backend/app/Http/Controllers/Platform/PlatformUserSecurityController.php', r'''<?php

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
''')

write('backend/routes/security.php', r'''<?php

use App\Http\Controllers\Workspace\WorkspaceSecurityController;
use App\Http\Middleware\RequireActiveSubscription;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware('auth')->group(function (): void {
    Route::get('/password-change-required', function (Request $request) {
        if (! $request->user()->must_change_password) {
            return redirect('/app');
        }

        return Inertia::render('Auth/ChangeRequiredPassword', [
            'expiresAt' => $request->user()->temporary_password_expires_at?->toIso8601String(),
        ]);
    })->name('password.change-required');

    Route::post(
        '/api/security/change-required-password',
        [WorkspaceSecurityController::class, 'changeRequiredPassword'],
    )->middleware('throttle:10,1');

    Route::post(
        '/api/security/send-recovery-link',
        [WorkspaceSecurityController::class, 'sendRecoveryLink'],
    )->middleware('throttle:6,1');
});

Route::middleware([
    'auth',
    'verified',
    RequireActiveSubscription::class,
    ResolveOrganization::class,
])->group(function (): void {
    Route::get('/app/security', fn () => Inertia::render('SecurityCenter'))
        ->name('app.security');

    Route::get(
        '/api/security/overview',
        [WorkspaceSecurityController::class, 'overview'],
    );

    Route::post(
        '/api/security/members/{membership}/temporary-password',
        [WorkspaceSecurityController::class, 'issueTemporaryPassword'],
    )->whereNumber('membership')->middleware('throttle:12,1');

    Route::put(
        '/api/security/members/{membership}/role',
        [WorkspaceSecurityController::class, 'updateRole'],
    )->whereNumber('membership')->middleware('throttle:12,1');
});
''')

write('backend/resources/js/pages/Auth/ChangeRequiredPassword.tsx', r'''import { ApiError, apiRequest } from '@/lib/http';
import { Head } from '@inertiajs/react';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';

type Props = {
    expiresAt: string | null;
};

export default function ChangeRequiredPassword({ expiresAt }: Props) {
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    async function submit(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await apiRequest('/api/security/change-required-password', {
                method: 'POST',
                body: JSON.stringify({
                    password,
                    password_confirmation: confirmation,
                }),
            });
            window.location.assign('/app');
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : 'تعذر تغيير كلمة المرور.');
        } finally {
            setBusy(false);
        }
    }

    async function sendRecovery() {
        setBusy(true);
        setError('');
        try {
            const response = await apiRequest<{ message: string }>('/api/security/send-recovery-link', { method: 'POST' });
            setMessage(response.message || 'تم إرسال رابط الاسترداد إلى بريدك الإلكتروني.');
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : 'تعذر إرسال رابط الاسترداد.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <main dir="rtl" className="grid min-h-screen place-items-center bg-[#071b2c] p-4 text-white">
            <Head title="إنشاء كلمة مرور جديدة | AccoNova" />
            <section className="w-full max-w-xl rounded-3xl border border-sky-800/70 bg-[#0a2740] p-6 shadow-2xl sm:p-8">
                <div className="flex items-start gap-4">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-sky-500/15 text-sky-300"><ShieldCheck /></span>
                    <div>
                        <h1 className="text-2xl font-black">أنشئ كلمة مرورك الجديدة</h1>
                        <p className="mt-2 text-sm leading-6 text-slate-300">تم تسجيل الدخول بكلمة مؤقتة. لحماية الحساب لن تستطيع متابعة استخدام AccoNova قبل إنشاء كلمة مرور دائمة خاصة بك.</p>
                    </div>
                </div>

                {expiresAt && <p className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">صلاحية كلمة المرور المؤقتة حتى: {new Date(expiresAt).toLocaleString()}</p>}
                {error && <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
                {message && <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">{message}</p>}

                <form className="mt-6 space-y-4" onSubmit={submit}>
                    <label className="block text-sm font-bold">كلمة المرور الجديدة
                        <input type="password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-sky-800 bg-[#061d30] px-4 py-3 outline-none focus:border-sky-400" autoComplete="new-password" />
                    </label>
                    <label className="block text-sm font-bold">تأكيد كلمة المرور
                        <input type="password" minLength={12} required value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-sky-800 bg-[#061d30] px-4 py-3 outline-none focus:border-sky-400" autoComplete="new-password" />
                    </label>
                    <p className="text-xs leading-6 text-slate-400">استخدم 12 حرفًا على الأقل مع أحرف كبيرة وصغيرة وأرقام ورمز.</p>
                    <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 font-black text-white hover:bg-sky-400 disabled:opacity-50"><KeyRound size={17} />حفظ ومتابعة</button>
                </form>

                <button type="button" disabled={busy} onClick={() => void sendRecovery()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-sky-700 px-4 py-3 text-sm font-bold text-sky-200 hover:bg-white/5 disabled:opacity-50"><Mail size={16} />أرسل رابط استرداد آمن إلى بريدي بدلًا من ذلك</button>
            </section>
        </main>
    );
}
''')

write('backend/resources/js/pages/SecurityCenter.tsx', r'''import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import { CheckCircle2, Clipboard, KeyRound, LockKeyhole, Mail, RefreshCw, ShieldCheck, UserCog, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type Member = {
    id: number;
    user_id: number;
    name: string;
    email: string;
    role: 'owner' | 'admin' | 'manager' | 'accountant' | 'employee';
    must_change_password: boolean;
    temporary_password_expires_at: string | null;
    password_changed_at: string | null;
    can_reset_password: boolean;
    can_change_role: boolean;
};

type SecurityData = {
    account: {
        id: number;
        name: string;
        email: string;
        verified: boolean;
        must_change_password: boolean;
        temporary_password_expires_at: string | null;
        password_changed_at: string | null;
    };
    workspace: {
        id: number;
        name: string;
        role: string;
        can_manage_members: boolean;
        can_promote_admin: boolean;
    };
    members: Member[];
    events: Array<{ id: number; event: string; actor_user_id: number | null; target_user_id: number | null; ip_address: string | null; created_at: string }>;
};

type TemporaryCredential = {
    user: { id: number; name: string; email: string };
    temporary_password: string;
    expires_at: string;
};

const card = 'rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-sm';
const input = 'w-full rounded-xl border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 py-2.5 text-sm text-[var(--ac-text)] outline-none focus:border-sky-500';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--ac-line)] px-3 py-2 text-xs font-bold text-[var(--ac-text)] transition hover:border-sky-500 hover:bg-sky-500/10 disabled:opacity-40';

export default function SecurityCenter() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = (arabic: string, english: string) => ar ? arabic : english;
    const [data, setData] = useState<SecurityData | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [reauthPassword, setReauthPassword] = useState('');
    const [credential, setCredential] = useState<TemporaryCredential | null>(null);
    const [pendingRoles, setPendingRoles] = useState<Record<number, Member['role']>>({});

    async function load() {
        setError('');
        try {
            setData(await apiRequest<SecurityData>('/api/security/overview'));
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : text('تعذر تحميل مركز الأمان.', 'Could not load security center.'));
        }
    }

    useEffect(() => { void load(); }, []);

    const roleLabels = useMemo(() => ({
        owner: text('مالك', 'Owner'),
        admin: text('مدير', 'Admin'),
        manager: text('مشرف', 'Manager'),
        accountant: text('محاسب', 'Accountant'),
        employee: text('موظف', 'Employee'),
    }), [ar]);

    async function run(action: () => Promise<void>) {
        setBusy(true);
        setError('');
        setNotice('');
        try { await action(); }
        catch (failure) { setError(failure instanceof ApiError ? failure.message : text('تعذر تنفيذ العملية.', 'Action failed.')); }
        finally { setBusy(false); }
    }

    async function issueTemporary(member: Member) {
        if (!reauthPassword) {
            setError(text('أدخل كلمة مرورك الحالية لتأكيد العملية الحساسة.', 'Enter your current password to confirm this sensitive action.'));
            return;
        }
        await run(async () => {
            const response = await apiRequest<TemporaryCredential>(`/api/security/members/${member.id}/temporary-password`, {
                method: 'POST',
                body: JSON.stringify({ current_password: reauthPassword }),
            });
            setCredential(response);
            setNotice(text('تم إصدار كلمة مؤقتة وإلغاء جلسات المستخدم القديمة. ستظهر الكلمة أدناه مرة واحدة فقط.', 'Temporary password issued and previous sessions revoked. The password is shown below once.'));
            await load();
        });
    }

    async function updateRole(member: Member) {
        const role = pendingRoles[member.id] ?? member.role;
        if (role === member.role) return;
        if (!reauthPassword) {
            setError(text('أدخل كلمة مرورك الحالية لتأكيد تغيير الدور.', 'Enter your current password to confirm the role change.'));
            return;
        }
        await run(async () => {
            await apiRequest(`/api/security/members/${member.id}/role`, {
                method: 'PUT',
                body: JSON.stringify({ role, current_password: reauthPassword }),
            });
            setNotice(text('تم تحديث الدور والصلاحيات.', 'Role and access updated.'));
            await load();
        });
    }

    async function sendRecovery() {
        await run(async () => {
            const response = await apiRequest<{ message: string }>('/api/security/send-recovery-link', { method: 'POST' });
            setNotice(response.message || text('تم إرسال رابط استرداد آمن إلى بريدك.', 'A secure recovery link was sent to your email.'));
        });
    }

    return (
        <AppShell>
            <Head title={text('مركز الأمان | AccoNova', 'Security Center | AccoNova')} />
            <main dir={ar ? 'rtl' : 'ltr'} className="mx-auto w-full max-w-[1500px] space-y-5 p-4 text-[var(--ac-text)] md:p-6">
                <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-[var(--ac-line)] bg-[#162235] p-6 text-white">
                    <div className="flex gap-4"><span className="grid size-12 place-items-center rounded-2xl bg-white/10"><ShieldCheck /></span><div><h1 className="text-2xl font-black">{text('مركز الأمان والوصول', 'Security & Access Center')}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{text('إدارة كلمة المرور والاسترداد وأدوار المستخدمين وإعادة التعيين المؤقت مع سجل تدقيق للعمليات الحساسة.', 'Manage password recovery, member roles, temporary resets and audited sensitive actions.')}</p></div></div>
                    <button className={button + ' border-white/20 text-white'} onClick={() => void load()}><RefreshCw size={15} />{text('تحديث', 'Refresh')}</button>
                </header>

                {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
                {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">{notice}</div>}

                {!data ? <div className={card}>{text('جارٍ التحميل...', 'Loading...')}</div> : <>
                    <div className="grid gap-4 xl:grid-cols-3">
                        <section className={card}><LockKeyhole className="text-sky-500" /><h2 className="mt-3 font-black">{text('أمان حسابك', 'Your account security')}</h2><p className="mt-2 text-xs leading-6 text-[var(--ac-text-muted)]">{data.account.email}<br />{data.account.verified ? text('البريد موثّق', 'Email verified') : text('البريد غير موثّق', 'Email not verified')}</p><div className="mt-4 flex flex-wrap gap-2"><Link href="/app/profile" className={button}><KeyRound size={14} />{text('تغيير كلمة المرور', 'Change password')}</Link><button className={button} disabled={busy} onClick={() => void sendRecovery()}><Mail size={14} />{text('إرسال رابط استرداد', 'Send recovery link')}</button></div></section>
                        <section className={card}><ShieldCheck className="text-emerald-500" /><h2 className="mt-3 font-black">{text('حالة الحماية', 'Protection status')}</h2><div className="mt-4 space-y-2 text-xs"><div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" />{text('استرداد آمن عبر البريد بتوكن منتهي الصلاحية', 'Secure expiring email recovery token')}</div><div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" />{text('إلغاء جلسات المستخدم عند إصدار كلمة مؤقتة', 'Session revocation on temporary reset')}</div><div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" />{text('إجبار تغيير الكلمة في أول دخول', 'Forced password change on first login')}</div><div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" />{text('تدقيق العمليات الحساسة', 'Sensitive action audit trail')}</div></div></section>
                        <section className={card}><UsersRound className="text-sky-500" /><h2 className="mt-3 font-black">{text('صلاحيتك الحالية', 'Current access')}</h2><p className="mt-2 text-sm font-bold">{data.workspace.name}</p><p className="mt-1 text-xs text-[var(--ac-text-muted)]">{text('الدور:', 'Role:')} {roleLabels[data.workspace.role as keyof typeof roleLabels] ?? data.workspace.role}</p>{data.workspace.can_promote_admin && <p className="mt-3 rounded-xl bg-sky-500/10 p-3 text-xs text-sky-500">{text('كمالك تستطيع ترقية عضو موجود إلى Admin. إضافة عضو جديد تبدأ من صفحة الموظفين ثم تعيين دوره هنا.', 'As owner you can promote an existing member to Admin. Invite new members from Staff, then assign their role here.')}</p>}</section>
                    </div>

                    {credential && <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong className="text-amber-500">{text('كلمة مؤقتة — تظهر مرة واحدة', 'Temporary password — shown once')}</strong><p className="mt-1 text-xs text-[var(--ac-text-muted)]">{credential.user.name} · {credential.user.email} · {text('تنتهي', 'expires')} {new Date(credential.expires_at).toLocaleString()}</p></div><button className={button} onClick={() => void navigator.clipboard.writeText(credential.temporary_password)}><Clipboard size={14} />{text('نسخ', 'Copy')}</button></div><code dir="ltr" className="mt-4 block break-all rounded-xl bg-[var(--ac-bg)] p-4 text-sm font-bold tracking-wide">{credential.temporary_password}</code></section>}

                    {data.workspace.can_manage_members && <section className={card}><div className="flex flex-col justify-between gap-4 border-b border-[var(--ac-line)] pb-4 lg:flex-row lg:items-end"><div><div className="flex items-center gap-2"><UserCog className="text-sky-500" /><h2 className="font-black">{text('إدارة وصول أعضاء المؤسسة', 'Workspace member access')}</h2></div><p className="mt-1 text-xs text-[var(--ac-text-muted)]">{text('العمليات الحساسة تتطلب إعادة إدخال كلمة مرورك الحالية.', 'Sensitive actions require your current password again.')}</p></div><label className="w-full max-w-sm text-xs font-bold">{text('كلمة مرورك الحالية', 'Your current password')}<input type="password" value={reauthPassword} onChange={event => setReauthPassword(event.target.value)} className={input + ' mt-2'} autoComplete="current-password" /></label></div>
                        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="text-xs text-[var(--ac-text-muted)]"><tr><th className="p-3 text-start">{text('المستخدم', 'User')}</th><th className="p-3 text-start">{text('الدور', 'Role')}</th><th className="p-3 text-start">{text('حالة كلمة المرور', 'Password state')}</th><th className="p-3 text-start">{text('إجراءات', 'Actions')}</th></tr></thead><tbody className="divide-y divide-[var(--ac-line)]">{data.members.map(member => <tr key={member.id}><td className="p-3"><strong className="block">{member.name}</strong><span className="text-xs text-[var(--ac-text-muted)]">{member.email}</span></td><td className="p-3">{member.can_change_role ? <div className="flex items-center gap-2"><select className={input + ' max-w-[180px]'} value={pendingRoles[member.id] ?? member.role} onChange={event => setPendingRoles(current => ({ ...current, [member.id]: event.target.value as Member['role'] }))}><option value="admin">{roleLabels.admin}</option><option value="manager">{roleLabels.manager}</option><option value="accountant">{roleLabels.accountant}</option><option value="employee">{roleLabels.employee}</option></select><button className={button} disabled={busy || (pendingRoles[member.id] ?? member.role) === member.role} onClick={() => void updateRole(member)}>{text('تطبيق', 'Apply')}</button></div> : <span className="font-bold">{roleLabels[member.role]}</span>}</td><td className="p-3 text-xs">{member.must_change_password ? <span className="rounded-full bg-amber-500/10 px-2 py-1 text-amber-500">{text('مطلوب تغييرها', 'Change required')}</span> : <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-500">{text('طبيعية', 'Normal')}</span>}</td><td className="p-3">{member.can_reset_password ? <button className={button} disabled={busy} onClick={() => void issueTemporary(member)}><KeyRound size={14} />{text('إصدار كلمة مؤقتة', 'Issue temporary password')}</button> : <span className="text-xs text-[var(--ac-text-muted)]">—</span>}</td></tr>)}</tbody></table></div>
                    </section>}

                    <section className={card}><h2 className="font-black">{text('آخر أحداث الأمان', 'Recent security events')}</h2><div className="mt-4 space-y-2">{data.events.length === 0 ? <p className="text-xs text-[var(--ac-text-muted)]">{text('لا توجد أحداث بعد.', 'No events yet.')}</p> : data.events.map(event => <div key={event.id} className="grid gap-2 rounded-xl border border-[var(--ac-line)] p-3 text-xs md:grid-cols-[1fr_auto_auto]"><code>{event.event}</code><span className="text-[var(--ac-text-muted)]">{event.ip_address ?? '—'}</span><span className="text-[var(--ac-text-muted)]">{new Date(event.created_at).toLocaleString()}</span></div>)}</div></section>
                </>}
            </main>
        </AppShell>
    );
}
''')

# User security state casts/fillable.
replace_once(
    'backend/app/Models/User.php',
    "#[Fillable(['name', 'email', 'password'])]",
    "#[Fillable(['name', 'email', 'password', 'must_change_password', 'temporary_password_expires_at', 'password_changed_at'])]",
)
replace_once(
    'backend/app/Models/User.php',
    "            'last_login_at' => 'datetime',\n\n            'password' => 'hashed',",
    "            'last_login_at' => 'datetime',\n            'temporary_password_expires_at' => 'datetime',\n            'password_changed_at' => 'datetime',\n            'must_change_password' => 'boolean',\n\n            'password' => 'hashed',",
)

# Register the security route bundle.
replace_once(
    'backend/app/Providers/AppServiceProvider.php',
    "        Route::middleware('web')->group(base_path('routes/billing-growth.php'));",
    "        Route::middleware('web')->group(base_path('routes/billing-growth.php'));\n        Route::middleware('web')->group(base_path('routes/security.php'));",
)

# Force first-login password replacement for temporary credentials.
replace_once(
    'backend/bootstrap/app.php',
    "use App\\Http\\Middleware\\EnsurePlatformAdmin;\nuse App\\Http\\Middleware\\HandleInertiaRequests;",
    "use App\\Http\\Middleware\\EnsurePlatformAdmin;\nuse App\\Http\\Middleware\\ForcePasswordChange;\nuse App\\Http\\Middleware\\HandleInertiaRequests;",
)
replace_once(
    'backend/bootstrap/app.php',
    "        $middleware->web(append: [\n            HandleInertiaRequests::class,\n        ]);",
    "        $middleware->web(append: [\n            ForcePasswordChange::class,\n            HandleInertiaRequests::class,\n        ]);",
)

# Platform Admin secure reset endpoint.
replace_once(
    'backend/routes/platform-admin.php',
    "use App\\Http\\Controllers\\Platform\\PlatformFeatureAdminController;",
    "use App\\Http\\Controllers\\Platform\\PlatformFeatureAdminController;\nuse App\\Http\\Controllers\\Platform\\PlatformUserSecurityController;",
)
replace_once(
    'backend/routes/platform-admin.php',
    "        Route::get(\n            '/features',",
    "        Route::post(\n            '/users/{user}/temporary-password',\n            [PlatformUserSecurityController::class, 'issueTemporaryPassword'],\n        )->whereNumber('user')->middleware('throttle:12,1')->name('users.temporary-password');\n\n        Route::get(\n            '/features',",
)

# Add live password state to the Platform Admin users payload.
replace_once(
    'backend/app/Http/Controllers/Platform/PlatformAdminController.php',
    "                'platform_role' => $user->platform_role,\n                'verified' => $user->email_verified_at !== null,",
    "                'platform_role' => $user->platform_role,\n                'verified' => $user->email_verified_at !== null,\n                'must_change_password' => (bool) $user->must_change_password,\n                'temporary_password_expires_at' => $user->temporary_password_expires_at?->toIso8601String(),",
)

# Add MCP Hub to the real primary navigation.
replace_once(
    'backend/resources/js/components/navigation/CommandRail.tsx',
    "    ListTodo,\n    PanelLeftClose,",
    "    ListTodo,\n    Network,\n    PanelLeftClose,",
)
replace_once(
    'backend/resources/js/components/navigation/CommandRail.tsx',
    "    const navigationItems:\n        NavigationItem[] = [",
    "    const canAdminMcp = customPermissions\n        ? customPermissions.includes('ai.admin.configure')\n        : ['owner', 'admin'].includes(activeOrganization?.role ?? '');\n\n    const navigationItems:\n        NavigationItem[] = [",
)
replace_once(
    'backend/resources/js/components/navigation/CommandRail.tsx',
    "        {\n            label:\n                'AccoNova AI',\n\n            description:\n                locale === 'ar'\n                    ? 'مساعد ذكي بذاكرة وصلاحيات'\n                    : 'AI assistant with memory & permissions',\n\n            href:\n                '/app/ai',\n\n            icon:\n                Sparkles,\n        },",
    "        {\n            label:\n                'AccoNova AI',\n\n            description:\n                locale === 'ar'\n                    ? 'مساعد ذكي بذاكرة وصلاحيات'\n                    : 'AI assistant with memory & permissions',\n\n            href:\n                '/app/ai',\n\n            icon:\n                Sparkles,\n        },\n\n        ...(canAdminMcp\n            ? [{\n                label: 'MCP Hub',\n                description: locale === 'ar'\n                    ? 'ربط ChatGPT وClaude وCursor'\n                    : 'Connect ChatGPT, Claude & Cursor',\n                href: '/app/mcp',\n                icon: Network,\n            }]\n            : []),",
)
replace_once(
    'backend/resources/js/components/navigation/CommandRail.tsx',
    "        '/app/ai':\n            'ai.assistant.use',",
    "        '/app/ai':\n            'ai.assistant.use',\n\n        '/app/mcp':\n            'ai.admin.configure',",
)

# Turn Settings > Integrations and Security into real entry points.
settings_path = ROOT / 'backend/resources/js/pages/Settings.tsx'
settings = settings_path.read_text(encoding='utf-8')
old_integrations_start = "                            {section === 'integrations' && (\n                                <SettingsCard title={text('التكاملات', 'Integrations')}"
start = settings.find(old_integrations_start)
if start == -1:
    raise SystemExit('Integrations block not found')
end_marker = "\n                            {section === 'security' && ("
end = settings.find(end_marker, start)
if end == -1:
    raise SystemExit('Security marker not found')
new_integrations = r'''                            {section === 'integrations' && (
                                <div className="space-y-4">
                                    <SettingsCard title={text('تكاملات الذكاء الاصطناعي وMCP', 'AI & MCP integrations')} description={text('تكاملات فعلية مرتبطة بمساحة العمل وليست أزراراً شكلية.', 'Real workspace-bound integrations, not decorative connect buttons.')} icon={Link2}>
                                        <div className="grid gap-3 xl:grid-cols-2">
                                            <SectionLink href="/app/mcp?tab=connections" icon={Link2} title={text('ChatGPT / Claude / Cursor', 'ChatGPT / Claude / Cursor')} description={text('أنشئ اتصال OAuth منفصل لكل عميل، انسخ رابطه المميز وألغِه في أي وقت.', 'Create a separate OAuth connection for each client, copy its unique URL and revoke it any time.')} />
                                            <SectionLink href="/app/mcp?tab=keys" icon={LockKeyhole} title={text('MCP Keys التقليدية', 'Legacy MCP keys')} description={text('لعملاء Bearer Token اليدويين فقط. المفتاح السري يظهر مرة واحدة عند الإنشاء.', 'For manual Bearer-token clients only. The secret is shown once at creation.')} />
                                            <SectionLink href="/app/mcp?tab=connections" icon={Globe2} title={text('MCP Servers خارجية', 'External MCP servers')} description={text('اربط AccoNova بخادم MCP خارجي مع Endpoint وSecret اختياري.', 'Connect AccoNova to an external MCP server with an endpoint and optional secret.')} />
                                            <SectionLink href="/app/settings?section=billing" icon={CreditCard} title={text('Stripe والفوترة', 'Stripe & billing')} description={text('إدارة الدفع والاشتراك من مركز الفوترة الحقيقي.', 'Manage payment and subscription integration from the real billing center.')} />
                                        </div>
                                    </SettingsCard>
                                    <SettingsCard title={text('البريد والإشعارات', 'Email & notifications')} description={text('استرداد كلمة المرور والتنبيهات تعتمد على قناة البريد المضبوطة للنظام.', 'Password recovery and notifications use the configured application mail channel.')} icon={Mail}>
                                        <SectionLink href="/app/settings?section=notifications" icon={Bell} title={text('إعدادات التنبيهات', 'Notification settings')} description={text('قواعد الإشعارات وتنبيهات الجهاز متصلة بالنظام فعلياً.', 'Notification rules and device alerts are connected to the live system.')} />
                                    </SettingsCard>
                                </div>
                            )}
'''
settings = settings[:start] + new_integrations + settings[end:]

security_start = settings.find("                            {section === 'security' && (")
security_end = settings.find("\n                            {section === 'billing' && (", security_start)
if security_start == -1 or security_end == -1:
    raise SystemExit('Security block bounds not found')
new_security = r'''                            {section === 'security' && (
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <SettingsCard title={text('مركز الأمان والوصول', 'Security & access center')} description={text('إدارة الاسترداد وكلمات المرور المؤقتة والأدوار وسجل الأمان.', 'Manage recovery, temporary passwords, roles and the security audit trail.')} icon={ShieldCheck}>
                                        <SectionLink href="/app/security" icon={ShieldCheck} title={text('فتح مركز الأمان', 'Open security center')} description={text('المالك والمدير يستطيعان إدارة أعضاء المؤسسة ضمن تسلسل صلاحيات آمن.', 'Owners and admins can manage workspace members within a secure role hierarchy.')} />
                                    </SettingsCard>
                                    <SettingsCard title={text('أمان حسابك الشخصي', 'Personal account security')} description={text('تغيير كلمة المرور أو إرسال رابط استرداد آمن لبريدك.', 'Change your password or send a secure recovery link to your email.')} icon={LockKeyhole}>
                                        <div className="grid gap-3">
                                            <SectionLink href="/app/profile" icon={LockKeyhole} title={text('تغيير كلمة المرور', 'Change password')} description={text('غيّر كلمة مرور حسابك من مركز الحساب.', 'Change your account password from the account center.')} />
                                            <SectionLink href="/forgot-password" icon={Mail} title={text('استرداد عبر البريد', 'Email recovery')} description={text('التدفق الرسمي يستخدم رابطاً مؤقتاً وموقعاً بدل إرسال كلمة المرور بالبريد.', 'The official recovery flow uses an expiring signed token instead of emailing a password.')} />
                                        </div>
                                    </SettingsCard>
                                </div>
                            )}
'''
settings = settings[:security_start] + new_security + settings[security_end:]
settings_path.write_text(settings, encoding='utf-8')

# Make MCP query-linkable and make legacy-vs-OAuth distinction explicit.
mcp_path = ROOT / 'backend/resources/js/pages/Mcp/Index.tsx'
mcp = mcp_path.read_text(encoding='utf-8')
mcp = mcp.replace("    const [tab, setTab] = useState<Tab>('overview');", r'''    const [tab, setTab] = useState<Tab>(() => {
        if (typeof window === 'undefined') return 'overview';
        const requested = new URLSearchParams(window.location.search).get('tab');
        return tabs.some(item => item.key === requested) ? requested as Tab : 'overview';
    });''', 1)
mcp = mcp.replace("{ar ? 'MCP Endpoint' : 'MCP Endpoint'}", "{ar ? 'Legacy Bearer Endpoint' : 'Legacy Bearer Endpoint'}", 1)
mcp = mcp.replace("{ar ? 'استخدم Bearer Token من قسم المفاتيح. كل مفتاح مربوط بـWorkspace واحد.' : 'Use a Bearer Token from Keys. Every key is locked to one workspace.'}", "{ar ? 'هذا الرابط للمفاتيح التقليدية فقط. ChatGPT وClaude وCursor يستخدمون رابط OAuth مميزاً لكل اتصال من تبويب الاتصالات.' : 'This endpoint is for legacy keys only. ChatGPT, Claude and Cursor use a unique OAuth URL per connection from Connections.'}", 1)
old_oauth_intro = "<p className=\"text-xs leading-5 text-[var(--ac-text-muted)]\">{ar ? 'OAuth 2.1 + PKCE. كل رابط مربوط بهذا المستخدم والـWorkspace، ويمكن إلغاؤه بأي وقت.' : 'OAuth 2.1 + PKCE. Each URL is bound to this user and workspace and can be revoked at any time.'}</p>"
new_oauth_intro = r'''<p className="text-xs leading-5 text-[var(--ac-text-muted)]">{ar ? 'OAuth 2.1 + PKCE. كل رابط مربوط بهذا المستخدم والـWorkspace، ويمكن إلغاؤه بأي وقت.' : 'OAuth 2.1 + PKCE. Each URL is bound to this user and workspace and can be revoked at any time.'}</p>
                                            <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/10 p-3 text-xs leading-6 text-[var(--ac-text)]">
                                                <strong>{ar ? 'طريقة الربط:' : 'How to connect:'}</strong>
                                                <ol className="mt-1 list-decimal space-y-1 ps-5 text-[var(--ac-text-muted)]">
                                                    <li>{ar ? 'اختر ChatGPT أو Claude أو Cursor وأنشئ اتصال OAuth.' : 'Choose ChatGPT, Claude or Cursor and create an OAuth connection.'}</li>
                                                    <li>{ar ? 'انسخ الرابط المميز الذي سيظهر في القائمة على اليمين.' : 'Copy the unique URL shown in the connection list.'}</li>
                                                    <li>{ar ? 'الصقه في خانة Remote MCP / MCP Server URL داخل العميل المتوافق.' : 'Paste it into the compatible client’s Remote MCP / MCP Server URL field.'}</li>
                                                    <li>{ar ? 'سيتم فتح تسجيل دخول وموافقة AccoNova عبر OAuth؛ لا تحتاج Secret Key ثابت لهذا النوع.' : 'AccoNova OAuth sign-in/consent opens automatically; no static secret key is required for this connection type.'}</li>
                                                </ol>
                                                <p className="mt-2 text-amber-500">{ar ? 'إذا كان العميل يطلب Bearer Token يدويًا استخدم تبويب المفاتيح بدل OAuth.' : 'If the client explicitly requires a manual Bearer token, use the Keys tab instead of OAuth.'}</p>
                                            </div>'''
if old_oauth_intro not in mcp:
    raise SystemExit('MCP OAuth intro pattern not found')
mcp = mcp.replace(old_oauth_intro, new_oauth_intro, 1)
mcp_path.write_text(mcp, encoding='utf-8')

# Platform Admin: add secure support reset UI to Users.
platform_path = ROOT / 'backend/resources/js/pages/Admin/Platform.tsx'
platform = platform_path.read_text(encoding='utf-8')
platform = platform.replace("    platform_role?:", "    platform_role?:", 1) if "    platform_role?:" in platform else platform
platform = platform.replace(
    "    verified: boolean;\n    memberships: number;",
    "    verified: boolean;\n    platform_role: string;\n    must_change_password: boolean;\n    temporary_password_expires_at: string | null;\n    memberships: number;",
    1,
)
platform = platform.replace(
    "    const [logoutBusy, setLogoutBusy] = useState(false);",
    "    const [logoutBusy, setLogoutBusy] = useState(false);\n    const [supportPassword, setSupportPassword] = useState('');\n    const [securityBusyUser, setSecurityBusyUser] = useState<number | null>(null);\n    const [temporaryCredential, setTemporaryCredential] = useState<{ name: string; email: string; password: string; expiresAt: string } | null>(null);",
    1,
)
handler_anchor = "    async function updateContactStatus(id: number, status: ContactMessage['status']): Promise<void> {"
handler = r'''    async function issueTemporaryPassword(user: UserRow): Promise<void> {
        if (!supportPassword || securityBusyUser) return;
        setSecurityBusyUser(user.id);
        try {
            const response = await apiRequest<{ user: { name: string; email: string }; temporary_password: string; expires_at: string }>(
                `/admin/users/${user.id}/temporary-password`,
                { method: 'POST', body: JSON.stringify({ current_password: supportPassword }) },
            );
            setTemporaryCredential({
                name: response.user.name,
                email: response.user.email,
                password: response.temporary_password,
                expiresAt: response.expires_at,
            });
        } finally {
            setSecurityBusyUser(null);
        }
    }

'''
if handler_anchor not in platform:
    raise SystemExit('Platform handler anchor not found')
platform = platform.replace(handler_anchor, handler + handler_anchor, 1)
old_users_choice = """                                {props.section === 'organizations'\n                                    ? <OrganizationsTable rows={filteredOrganizations} locale={locale} ar={ar} />\n                                    : <UsersTable rows={filteredUsers} locale={locale} ar={ar} />}"""
new_users_choice = r'''                                {props.section === 'organizations'
                                    ? <OrganizationsTable rows={filteredOrganizations} locale={locale} ar={ar} />
                                    : <>
                                        <section className={`${card} p-4`}>
                                            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                                                <div><h2 className="font-extrabold">{text('دعم أمان المستخدمين', 'User security support')}</h2><p className="mt-1 text-xs text-slate-500">{text('إصدار كلمة مؤقتة يتطلب كلمة مرور Platform Admin الحالية، يلغي جلسات المستخدم ويجبره على إنشاء كلمة جديدة عند أول دخول.', 'Issuing a temporary password requires your current Platform Admin password, revokes the user sessions and forces a new password on first login.')}</p></div>
                                                <label className="w-full max-w-sm text-xs font-bold">{text('كلمة مرورك الحالية', 'Your current password')}<input type="password" value={supportPassword} onChange={event => setSupportPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2.5 outline-none focus:border-sky-500 dark:border-slate-700" autoComplete="current-password" /></label>
                                            </div>
                                            {temporaryCredential && <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{text('كلمة مؤقتة — تظهر مرة واحدة', 'Temporary password — shown once')}</strong><p className="mt-1 text-xs">{temporaryCredential.name} · {temporaryCredential.email} · {new Date(temporaryCredential.expiresAt).toLocaleString()}</p></div><button onClick={() => void navigator.clipboard.writeText(temporaryCredential.password)} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold dark:border-amber-700">{text('نسخ', 'Copy')}</button></div><code dir="ltr" className="mt-3 block break-all rounded-lg bg-white/70 p-3 font-bold dark:bg-black/20">{temporaryCredential.password}</code></div>}
                                        </section>
                                        <UsersTable rows={filteredUsers} locale={locale} ar={ar} onReset={user => void issueTemporaryPassword(user)} busyUser={securityBusyUser} canReset={supportPassword.length > 0} />
                                    </>}'''
if old_users_choice not in platform:
    raise SystemExit('Platform user table block not found')
platform = platform.replace(old_users_choice, new_users_choice, 1)
old_users_fn_start = "function UsersTable({ rows, locale, ar }: { rows: UserRow[]; locale: string; ar: boolean }) {"
if old_users_fn_start not in platform:
    raise SystemExit('UsersTable signature not found')
platform = platform.replace(
    old_users_fn_start,
    "function UsersTable({ rows, locale, ar, onReset, busyUser, canReset }: { rows: UserRow[]; locale: string; ar: boolean; onReset: (user: UserRow) => void; busyUser: number | null; canReset: boolean }) {",
    1,
)
old_table = "return <section className={`${card} overflow-x-auto`}><table className=\"w-full min-w-[820px] text-sm\"><thead className=\"bg-slate-50 text-xs text-slate-500 dark:bg-slate-800\"><tr><th className=\"p-3 text-start\">ID</th><th className=\"p-3 text-start\">{ar ? 'المستخدم' : 'User'}</th><th className=\"p-3 text-start\">{ar ? 'التحقق' : 'Verified'}</th><th className=\"p-3 text-start\">{ar ? 'العضويات' : 'Memberships'}</th><th className=\"p-3 text-start\">{ar ? 'آخر دخول' : 'Last login'}</th><th className=\"p-3 text-start\">{ar ? 'أُنشئ' : 'Created'}</th></tr></thead><tbody className=\"divide-y divide-slate-100 dark:divide-slate-800\">{rows.map(row => <tr key={row.id}><td className=\"p-3 text-slate-500\">{row.id}</td><td className=\"p-3\"><strong className=\"block\">{row.name}</strong><span className=\"text-xs text-slate-500\">{row.email}</span></td><td className=\"p-3\">{row.verified ? '✓' : '—'}</td><td className=\"p-3\">{row.memberships}</td><td className=\"p-3 text-slate-500\">{formatDate(row.last_login_at, locale)}</td><td className=\"p-3 text-slate-500\">{formatDate(row.created_at, locale)}</td></tr>)}</tbody></table></section>;"
new_table = "return <section className={`${card} overflow-x-auto`}><table className=\"w-full min-w-[1040px] text-sm\"><thead className=\"bg-slate-50 text-xs text-slate-500 dark:bg-slate-800\"><tr><th className=\"p-3 text-start\">ID</th><th className=\"p-3 text-start\">{ar ? 'المستخدم' : 'User'}</th><th className=\"p-3 text-start\">{ar ? 'التحقق' : 'Verified'}</th><th className=\"p-3 text-start\">{ar ? 'العضويات' : 'Memberships'}</th><th className=\"p-3 text-start\">{ar ? 'حالة الأمان' : 'Security'}</th><th className=\"p-3 text-start\">{ar ? 'آخر دخول' : 'Last login'}</th><th className=\"p-3 text-start\">{ar ? 'إجراء' : 'Action'}</th></tr></thead><tbody className=\"divide-y divide-slate-100 dark:divide-slate-800\">{rows.map(row => <tr key={row.id}><td className=\"p-3 text-slate-500\">{row.id}</td><td className=\"p-3\"><strong className=\"block\">{row.name}</strong><span className=\"text-xs text-slate-500\">{row.email}</span><span className=\"mt-1 block text-[10px] text-sky-600\">{row.platform_role}</span></td><td className=\"p-3\">{row.verified ? '✓' : '—'}</td><td className=\"p-3\">{row.memberships}</td><td className=\"p-3\">{row.must_change_password ? <span className=\"rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300\">{ar ? 'تغيير مطلوب' : 'Change required'}</span> : <span className=\"text-xs text-emerald-600\">{ar ? 'طبيعي' : 'Normal'}</span>}</td><td className=\"p-3 text-slate-500\">{formatDate(row.last_login_at, locale)}</td><td className=\"p-3\"><button disabled={!canReset || busyUser === row.id} onClick={() => onReset(row)} className=\"rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold hover:border-sky-400 disabled:opacity-40 dark:border-slate-700\">{busyUser === row.id ? '…' : (ar ? 'كلمة مؤقتة' : 'Temp password')}</button></td></tr>)}</tbody></table></section>;"
if old_table not in platform:
    raise SystemExit('UsersTable body not found')
platform = platform.replace(old_table, new_table, 1)
platform_path.write_text(platform, encoding='utf-8')

# Add focused feature tests.
write('backend/tests/Feature/SecurityManagementTest.php', r'''<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SecurityManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_issue_temporary_password_and_target_must_change_it(): void
    {
        [$owner, $organization] = $this->workspaceUser(OrganizationRole::Owner);
        [$employee] = $this->workspaceUser(OrganizationRole::Employee, $organization);
        $membership = Membership::query()->where('user_id', $employee->id)->firstOrFail();

        $response = $this->actingAs($owner)->postJson(
            "/api/security/members/{$membership->id}/temporary-password",
            ['current_password' => 'Password!12345'],
        );

        $response->assertOk()->assertJsonStructure(['temporary_password', 'expires_at']);
        $temporary = $response->json('temporary_password');

        $employee->refresh();
        $this->assertTrue($employee->must_change_password);
        $this->assertTrue(Hash::check($temporary, $employee->password));
        $this->assertNotNull($employee->temporary_password_expires_at);
    }

    public function test_admin_cannot_reset_owner_or_another_admin(): void
    {
        [$owner, $organization] = $this->workspaceUser(OrganizationRole::Owner);
        [$admin] = $this->workspaceUser(OrganizationRole::Admin, $organization);
        [$otherAdmin] = $this->workspaceUser(OrganizationRole::Admin, $organization);

        $ownerMembership = Membership::query()->where('user_id', $owner->id)->firstOrFail();
        $adminMembership = Membership::query()->where('user_id', $otherAdmin->id)->firstOrFail();

        $this->actingAs($admin)
            ->postJson("/api/security/members/{$ownerMembership->id}/temporary-password", ['current_password' => 'Password!12345'])
            ->assertForbidden();

        $this->actingAs($admin)
            ->postJson("/api/security/members/{$adminMembership->id}/temporary-password", ['current_password' => 'Password!12345'])
            ->assertForbidden();
    }

    public function test_owner_can_promote_member_to_admin_but_admin_cannot(): void
    {
        [$owner, $organization] = $this->workspaceUser(OrganizationRole::Owner);
        [$employee] = $this->workspaceUser(OrganizationRole::Employee, $organization);
        [$admin] = $this->workspaceUser(OrganizationRole::Admin, $organization);
        $membership = Membership::query()->where('user_id', $employee->id)->firstOrFail();

        $this->actingAs($admin)
            ->putJson("/api/security/members/{$membership->id}/role", ['role' => 'admin', 'current_password' => 'Password!12345'])
            ->assertForbidden();

        $this->actingAs($owner)
            ->putJson("/api/security/members/{$membership->id}/role", ['role' => 'admin', 'current_password' => 'Password!12345'])
            ->assertOk();

        $this->assertSame('admin', $membership->fresh()->role->value);
    }

    public function test_flagged_user_is_forced_to_change_password_and_can_complete_flow(): void
    {
        [$user] = $this->workspaceUser(OrganizationRole::Employee);
        $user->forceFill([
            'must_change_password' => true,
            'temporary_password_expires_at' => now()->addHour(),
        ])->save();

        $this->actingAs($user)->get('/app')->assertRedirect('/password-change-required');

        $this->actingAs($user)->postJson('/api/security/change-required-password', [
            'password' => 'NewSecure!Password123',
            'password_confirmation' => 'NewSecure!Password123',
        ])->assertOk();

        $user->refresh();
        $this->assertFalse($user->must_change_password);
        $this->assertTrue(Hash::check('NewSecure!Password123', $user->password));
    }

    private function workspaceUser(
        OrganizationRole $role,
        ?Organization $organization = null,
    ): array {
        $organization ??= Organization::factory()->create();
        $user = User::factory()->create([
            'password' => Hash::make('Password!12345'),
            'email_verified_at' => now(),
        ]);

        Membership::factory()->create([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
            'role' => $role->value,
        ]);

        return [$user, $organization];
    }
}
''')

print('Security + integrations patch applied.')
