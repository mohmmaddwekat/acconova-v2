import {
    ApiError,
    apiRequest,
} from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import {
    LogOut,
    RefreshCw,
    ShieldAlert,
    UserRound,
} from 'lucide-react';
import { useState } from 'react';

export default function SubscriptionRequired() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function logout(): Promise<void> {
        if (busy) return;

        setBusy(true);
        setError('');

        try {
            await apiRequest('/api/logout', {
                method: 'POST',
            });

            window.location.assign('/login');
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text(
                        'تعذر تسجيل الخروج.',
                        'Could not sign out.',
                    ),
            );
            setBusy(false);
        }
    }

    return (
        <>
            <Head
                title={text(
                    'الاشتراك مطلوب',
                    'Subscription required',
                )}
            />

            <main className="flex min-h-screen items-center justify-center bg-[var(--acs-bg)] p-5 text-[var(--acs-text)]">
                <section className="w-full max-w-xl rounded-[24px] border border-[var(--acs-line)] bg-[var(--acs-surface)] p-7 text-center shadow-[0_18px_50px_rgba(30,75,140,.08)]">
                    <span className="mx-auto flex size-14 items-center justify-center rounded-[18px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                        <ShieldAlert size={22} />
                    </span>

                    <h1 className="mt-5 text-xl font-bold tracking-tight">
                        {text(
                            'اشتراك مساحة العمل غير فعّال',
                            'This workspace needs an active subscription',
                        )}
                    </h1>

                    <p className="mx-auto mt-2 max-w-md text-[11px] leading-6 text-[var(--acs-text-muted)]">
                        {text(
                            'تواصل مع مالك مساحة العمل أو المسؤول لتفعيل اشتراك AccoNova. بمجرد التفعيل يمكنك العودة للنظام مباشرة.',
                            'Ask the workspace owner or administrator to activate the AccoNova subscription. Once activated, you can return to the application immediately.',
                        )}
                    </p>

                    {error && (
                        <p className="mt-4 rounded-[12px] border border-red-400/25 bg-red-500/10 px-3 py-2 text-[10px] text-red-400">
                            {error}
                        </p>
                    )}

                    <div className="mt-6 grid gap-2 sm:grid-cols-3">
                        <button
                            type="button"
                            onClick={() => window.location.assign('/app')}
                            className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--acs-line-strong)] bg-transparent px-3 py-2.5 text-[10px] font-bold transition hover:border-[var(--acs-accent)] hover:bg-[var(--acs-accent-soft)]"
                        >
                            <RefreshCw size={13} />
                            {text('إعادة المحاولة', 'Try again')}
                        </button>

                        <Link
                            href="/app/profile"
                            className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--acs-line-strong)] bg-transparent px-3 py-2.5 text-[10px] font-bold transition hover:border-[var(--acs-accent)] hover:bg-[var(--acs-accent-soft)]"
                        >
                            <UserRound size={13} />
                            {text('الملف الشخصي', 'Profile')}
                        </Link>

                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void logout()}
                            className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--acs-line-strong)] bg-transparent px-3 py-2.5 text-[10px] font-bold transition hover:border-[var(--acs-accent)] hover:bg-[var(--acs-accent-soft)] disabled:opacity-50"
                        >
                            <LogOut size={13} />
                            {text('تسجيل الخروج', 'Sign out')}
                        </button>
                    </div>
                </section>
            </main>
        </>
    );
}
