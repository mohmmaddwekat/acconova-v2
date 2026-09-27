import { apiRequest, ApiError } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, ArrowRight, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';

type AdminRow = {
    id: number;
    name: string;
    email: string;
    platform_role: 'admin' | 'super_admin';
    last_login_at: string | null;
    created_at: string | null;
};

type Candidate = {
    id: number;
    name: string;
    email: string;
};

type Props = {
    admins: AdminRow[];
    candidates: Candidate[];
    currentUserId: number;
};

const panel = 'rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]';
const control = 'min-h-11 rounded-xl border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3 text-sm text-[var(--ac-text)] outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]';
const secondary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--ac-line)] bg-[var(--ac-surface)] px-4 text-sm font-bold text-[var(--ac-text)] transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-button-hover-bg)] disabled:cursor-not-allowed disabled:opacity-50';
const primary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--ac-accent-solid)] bg-[var(--ac-accent-solid)] px-4 text-sm font-bold text-[var(--ac-accent-solid-text)] transition hover:bg-[var(--ac-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50';

function errorMessage(error: unknown, fallback: string): string {
    if (error instanceof ApiError) {
        const details = Object.values(error.errors).flat().filter(Boolean);
        return [error.message, ...details].filter(Boolean).join(' ') || fallback;
    }

    return error instanceof Error ? error.message : fallback;
}

function dateLabel(value: string | null, locale: string): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

export default function Admins({ admins: initialAdmins, candidates: initialCandidates, currentUserId }: Props) {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = (arabic: string, english: string) => ar ? arabic : english;
    const [admins, setAdmins] = useState(initialAdmins);
    const [candidates, setCandidates] = useState(initialCandidates);
    const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
    const [busy, setBusy] = useState(false);
    const [removingId, setRemovingId] = useState<number | null>(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const selectedCandidate = useMemo(
        () => candidates.find((candidate) => candidate.id === selectedUserId) ?? null,
        [candidates, selectedUserId],
    );

    async function addAdmin(): Promise<void> {
        if (!selectedCandidate || busy) return;

        setBusy(true);
        setError('');
        setMessage('');

        try {
            const response = await apiRequest<{ ok: boolean; admin: AdminRow }>('/admin/admins', {
                method: 'POST',
                body: JSON.stringify({ user_id: selectedCandidate.id }),
            });

            setAdmins((current) => [...current.filter((item) => item.id !== response.admin.id), response.admin]);
            setCandidates((current) => current.filter((item) => item.id !== response.admin.id));
            setSelectedUserId('');
            setMessage(text('تمت إضافة المسؤول بصلاحية Admin بنجاح.', 'The user is now a regular Platform Admin.'));
        } catch (failure) {
            setError(errorMessage(failure, text('تعذر إضافة المسؤول.', 'Could not add the admin.')));
        } finally {
            setBusy(false);
        }
    }

    async function removeAdmin(admin: AdminRow): Promise<void> {
        if (admin.platform_role === 'super_admin' || admin.id === currentUserId || removingId !== null) return;

        const confirmed = window.confirm(
            text(
                `إزالة صلاحية Admin من ${admin.name}؟ سيعود كمستخدم عادي ولن يستطيع دخول لوحة الإدارة.`,
                `Remove Admin access from ${admin.name}? They will become a normal user and lose Platform Admin access.`,
            ),
        );
        if (!confirmed) return;

        setRemovingId(admin.id);
        setError('');
        setMessage('');

        try {
            await apiRequest<{ ok: boolean; user_id: number }>(`/admin/admins/${admin.id}`, { method: 'DELETE' });
            setAdmins((current) => current.filter((item) => item.id !== admin.id));
            setCandidates((current) => [...current, { id: admin.id, name: admin.name, email: admin.email }]
                .sort((a, b) => a.name.localeCompare(b.name)));
            setMessage(text('تمت إزالة صلاحية Admin.', 'Admin access was removed.'));
        } catch (failure) {
            setError(errorMessage(failure, text('تعذر إزالة المسؤول.', 'Could not remove the admin.')));
        } finally {
            setRemovingId(null);
        }
    }

    const BackIcon = ar ? ArrowRight : ArrowLeft;

    return (
        <>
            <Head title={text('إدارة مسؤولي المنصة | AccoNova', 'Platform admins | AccoNova')} />
            <div dir={ar ? 'rtl' : 'ltr'} className="min-h-screen bg-[var(--ac-bg)] text-[var(--ac-text)]">
                <header className="border-b border-[var(--ac-line)] bg-[#162235] text-white">
                    <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                        <div className="flex items-center gap-3">
                            <span className="grid size-10 place-items-center rounded-xl bg-[var(--ac-accent-solid)] font-black">A</span>
                            <div>
                                <strong className="block">AccoNova</strong>
                                <span className="text-xs text-slate-300">Platform Admin</span>
                            </div>
                        </div>
                        <Link href="/admin" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-bold text-white transition hover:border-sky-400 hover:bg-white/10">
                            <BackIcon size={16} />
                            {text('العودة للوحة الإدارة', 'Back to admin')}
                        </Link>
                    </div>
                </header>

                <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                    <section className={`${panel} overflow-hidden`}>
                        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between lg:p-6">
                            <div className="flex items-start gap-3">
                                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                    <ShieldCheck size={24} />
                                </span>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ac-accent)]">AccoNova Control Center</p>
                                    <h1 className="mt-1 text-2xl font-black sm:text-3xl">{text('مسؤولو المنصة', 'Platform admins')}</h1>
                                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ac-text-muted)]">
                                        {text(
                                            'أضف مستخدمًا موجودًا كـ Admin عادي. حساب Super Admin محمي ولا يمكن إنشاؤه أو حذفه من هذه الصفحة.',
                                            'Promote an existing user to regular Admin. Super Admin is protected and cannot be created or removed here.',
                                        )}
                                    </p>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-4 py-3 text-center">
                                <p className="text-xs text-[var(--ac-text-muted)]">{text('إجمالي المسؤولين', 'Total admins')}</p>
                                <strong className="mt-1 block text-2xl">{admins.length}</strong>
                            </div>
                        </div>
                    </section>

                    {error && <div role="alert" className="rounded-xl border border-red-300/50 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}
                    {message && <div role="status" className="rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500">{message}</div>}

                    <section className={`${panel} p-5 lg:p-6`}>
                        <div className="mb-4 flex items-center gap-3">
                            <UserPlus className="text-[var(--ac-accent)]" size={20} />
                            <div>
                                <h2 className="font-extrabold">{text('إضافة Admin عادي', 'Add regular Admin')}</h2>
                                <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                    {text('اختر حساب مستخدم موجود. الصلاحية الممنوحة هي Admin فقط وليست Super Admin.', 'Choose an existing user account. Only regular Admin access is granted, never Super Admin.')}
                                </p>
                            </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                            <select
                                value={selectedUserId}
                                onChange={(event) => setSelectedUserId(event.target.value ? Number(event.target.value) : '')}
                                className={control}
                                aria-label={text('اختر المستخدم', 'Choose user')}
                            >
                                <option value="">{text('اختر مستخدمًا لإضافته كمسؤول...', 'Choose a user to promote...')}</option>
                                {candidates.map((candidate) => (
                                    <option key={candidate.id} value={candidate.id}>
                                        {candidate.name} — {candidate.email}
                                    </option>
                                ))}
                            </select>
                            <button type="button" className={primary} onClick={() => void addAdmin()} disabled={!selectedCandidate || busy}>
                                <UserPlus size={16} />
                                {busy ? text('جارٍ الإضافة...', 'Adding...') : text('إضافة كـ Admin', 'Add as Admin')}
                            </button>
                        </div>
                        {candidates.length === 0 && (
                            <p className="mt-3 text-xs text-[var(--ac-text-muted)]">
                                {text('لا يوجد مستخدمون عاديون متاحون حاليًا. أنشئ/سجّل حساب المستخدم أولًا ثم أضفه من هنا.', 'No normal users are available. Create/sign up the user account first, then promote it here.')}
                            </p>
                        )}
                    </section>

                    <section className={`${panel} overflow-hidden`}>
                        <div className="flex items-center gap-3 border-b border-[var(--ac-line)] p-5 lg:px-6">
                            <Users size={20} className="text-[var(--ac-accent)]" />
                            <h2 className="font-extrabold">{text('المسؤولون الحاليون', 'Current admins')}</h2>
                        </div>
                        <div className="divide-y divide-[var(--ac-line)]">
                            {admins.map((admin) => {
                                const superAdmin = admin.platform_role === 'super_admin';
                                const self = admin.id === currentUserId;
                                return (
                                    <div key={admin.id} className="flex flex-col gap-4 p-5 transition hover:bg-[var(--ac-surface-soft)] sm:flex-row sm:items-center sm:justify-between lg:px-6">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <strong className="truncate">{admin.name}</strong>
                                                <span className={superAdmin
                                                    ? 'rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black text-amber-500'
                                                    : 'rounded-full border border-sky-400/40 bg-sky-400/10 px-2.5 py-1 text-[10px] font-black text-sky-500'}>
                                                    {superAdmin ? 'SUPER ADMIN' : 'ADMIN'}
                                                </span>
                                                {self && <span className="rounded-full border border-[var(--ac-line)] px-2.5 py-1 text-[10px] font-bold text-[var(--ac-text-muted)]">{text('أنت', 'You')}</span>}
                                            </div>
                                            <p className="mt-1 truncate text-sm text-[var(--ac-text-muted)]">{admin.email}</p>
                                            <p className="mt-2 text-[11px] text-[var(--ac-text-muted)]">
                                                {text('آخر دخول:', 'Last login:')} {dateLabel(admin.last_login_at, locale)}
                                                <span className="mx-2">•</span>
                                                {text('أُنشئ:', 'Created:')} {dateLabel(admin.created_at, locale)}
                                            </p>
                                        </div>
                                        {superAdmin ? (
                                            <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--ac-line)] px-4 text-xs font-bold text-[var(--ac-text-muted)]">
                                                <ShieldCheck size={15} /> {text('حساب محمي', 'Protected account')}
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                className={`${secondary} hover:!border-red-400 hover:!text-red-500`}
                                                disabled={self || removingId === admin.id}
                                                onClick={() => void removeAdmin(admin)}
                                            >
                                                <Trash2 size={15} />
                                                {removingId === admin.id ? text('جارٍ الإزالة...', 'Removing...') : text('إزالة الصلاحية', 'Remove access')}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </main>
            </div>
        </>
    );
}
