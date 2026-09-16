import { useLocale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import {
    Head,
    Link,
} from '@inertiajs/react';
import {
    ArrowRight,
    LockKeyhole,
} from 'lucide-react';
import {
    useState,
    type FormEvent,
} from 'react';

import { AuthInput } from '@/features/auth/components/AuthInput';
import { login } from '@/features/auth/api';
import { ApiError } from '@/lib/http';
import { AuthShell } from '@/layouts/AuthShell';

/**
 * Render the AccoNova login experience.
 */
export default function Login() {
    useLocale();
    const [email, setEmail] =
        useState('');

    const [password, setPassword] =
        useState('');

    const [busy, setBusy] =
        useState(false);

    const [errors, setErrors] =
        useState<
            Record<string, string[]>
        >({});

    const [message, setMessage] =
        useState<string | null>(null);

    /**
     * Authenticate the user and enter the protected application.
     */
    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();
        if (busy) return;

        setBusy(true);
        setErrors({});
        setMessage(null);

        try {
            await login({
                email,
                password,
            });

            window.location.assign('/app');
        } catch (error) {
            if (
                error instanceof ApiError
            ) {
                setErrors(
                    error.errors,
                );

                setMessage(
                    error.message,
                );

                return;
            }

            setMessage(
                t('ui.acconova_could_not_complete_the_sign_in_request'),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <Head title={t('ui.sign_in_acconova')} />

            <AuthShell
                eyebrow={t('ui.welcome_back')}
                title={t('ui.enter_your_workspace')}
                description={t('ui.sign_in_to_continue_where_your_business_left_off')}
            >
                <form
                    className="mt-10 space-y-5"
                    onSubmit={handleSubmit}
                >
                    <AuthInput
                        label={t('ui.email')}
                        type="email"
                        autoComplete="email"
                        placeholder={t('ui.you_company_com')}
                        value={email}
                        onChange={setEmail}
                        error={
                            errors.email?.[0]
                        }
                    />

                    <AuthInput
                        label={t('ui.password')}
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={setPassword}
                        error={
                            errors.password?.[0]
                        }
                    />
                    <div className="flex justify-end">
                        <Link
                            href="/forgot-password"
                            className="text-xs font-semibold text-[var(--ac-accent-strong)]"
                        >
                            {t('ui.forgot_password')}
                        </Link>
                    </div>

                    {message && (
                        <div className="rounded-[16px] border border-[var(--ac-danger)]/20 bg-[var(--ac-danger)]/5 px-4 py-3 text-sm leading-5 text-[var(--ac-danger)]">
                            {message}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={busy}
                        className="group flex h-12 w-full items-center justify-between rounded-[16px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white shadow-[var(--ac-shadow-soft)] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:translate-y-0 disabled:opacity-60"
                    >
                        <span className="flex items-center gap-2">
                            <LockKeyhole
                                size={16}
                            />

                            {busy
                                ? t('ui.signing_in')
                                : t('ui.sign_in')}
                        </span>

                        <ArrowRight
                            size={17}
                            className="transition group-hover:translate-x-0.5"
                        />
                    </button>
                </form>

                <div className="mt-8 flex items-center justify-between border-t border-[var(--ac-line)] pt-5">
                    <p className="text-xs text-[var(--ac-text-muted)]">
                        {t('ui.new_to_acconova')}
                    </p>

                    <Link
                        href="/register"
                        className="text-sm font-semibold text-[var(--ac-accent-strong)]"
                    >
                        {t('ui.create_account')}
                    </Link>
                </div>
            </AuthShell>
        </>
    );
}
