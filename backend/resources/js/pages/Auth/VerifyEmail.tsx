import {
    Head,
    usePage,
} from '@inertiajs/react';
import {
    LogOut,
    MailCheck,
    RefreshCcw,
} from 'lucide-react';
import { useState } from 'react';

import {
    logout,
    resendVerification,
} from '@/features/auth/api';
import { ApiError } from '@/lib/http';
import type { AppPageProps } from '@/types/app';

/**
 * Render the verification checkpoint between account creation and business
 * workspace access.
 */
export default function VerifyEmail() {
    const { auth } =
        usePage<AppPageProps>().props;

    const [busy, setBusy] =
        useState(false);

    const [message, setMessage] =
        useState<string | null>(null);

    const [error, setError] =
        useState<string | null>(null);

    /**
     * Request another signed verification email.
     */
    async function handleResend(): Promise<void> {
        setBusy(true);
        setMessage(null);
        setError(null);

        try {
            await resendVerification();

            setMessage(
                'A fresh verification link has been sent.',
            );
        } catch (exception) {
            setError(
                exception instanceof ApiError
                    ? exception.message
                    : 'Unable to resend the verification email.',
            );
        } finally {
            setBusy(false);
        }
    }

    /**
     * End the unverified session and return to login.
     */
    async function handleLogout(): Promise<void> {
        await logout();

        window.location.assign('/login');
    }

    return (
        <>
            <Head title="Verify email · AccoNova" />

            <main className="flex min-h-screen items-center justify-center bg-[var(--ac-bg)] p-6">
                <section className="w-full max-w-xl rounded-[32px] border border-[var(--ac-line)] bg-white p-8 shadow-[var(--ac-shadow-panel)] sm:p-12">
                    <div className="flex size-12 items-center justify-center rounded-[18px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                        <MailCheck size={20} />
                    </div>

                    <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--ac-accent-strong)]">
                        One security checkpoint
                    </p>

                    <h1 className="mt-3 text-5xl font-medium leading-[0.95] tracking-[-0.06em]">
                        Verify your email.
                    </h1>

                    <p className="mt-5 text-sm leading-6 text-[var(--ac-text-soft)]">
                        We sent a secure verification link to{' '}
                        <strong className="text-[var(--ac-text)]">
                            {auth.user?.email}
                        </strong>
                        . Open that link to continue into your
                        AccoNova workspace.
                    </p>

                    {message && (
                        <div className="mt-6 rounded-[16px] bg-[var(--ac-accent-soft)] px-4 py-3 text-sm text-[var(--ac-accent-strong)]">
                            {message}
                        </div>
                    )}

                    {error && (
                        <div className="mt-6 rounded-[16px] bg-[var(--ac-danger)]/5 px-4 py-3 text-sm text-[var(--ac-danger)]">
                            {error}
                        </div>
                    )}

                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            void handleResend()
                        }
                        className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-[var(--ac-text)] text-sm font-semibold text-white disabled:opacity-60"
                    >
                        <RefreshCcw size={16} />

                        {busy
                            ? 'Sending…'
                            : 'Resend verification email'}
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            void handleLogout()
                        }
                        className="mt-3 flex h-11 w-full items-center justify-center gap-2 text-sm font-medium text-[var(--ac-text-soft)]"
                    >
                        <LogOut size={15} />
                        Sign out
                    </button>
                </section>
            </main>
        </>
    );
}
