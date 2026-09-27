import { AppShell } from '@/layouts/AppShell';
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
