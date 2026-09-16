import { useLocale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import {
    Head,
    Link,
} from '@inertiajs/react';
import {
    ArrowLeft,
    Mail,
} from 'lucide-react';
import {
    useState,
    type FormEvent,
} from 'react';

import {
    requestPasswordReset,
} from '@/features/auth/api';
import { AuthInput } from '@/features/auth/components/AuthInput';
import { ApiError } from '@/lib/http';
import { AuthShell } from '@/layouts/AuthShell';

/**
 * Render the password-recovery request experience.
 */
export default function ForgotPassword() {
    useLocale();
    const [email, setEmail] =
        useState('');

    const [busy, setBusy] =
        useState(false);

    const [sent, setSent] =
        useState(false);

    const [emailError, setEmailError] =
        useState<string | undefined>(
            undefined,
        );

    const [message, setMessage] =
        useState<string | null>(null);

    /**
     * Ask Laravel to issue a password-recovery email for the submitted
     * registered AccoNova account.
     */
    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();
        if (busy) return;

        setBusy(true);
        setSent(false);
        setEmailError(undefined);
        setMessage(null);

        try {
            await requestPasswordReset(
                email,
            );

            setSent(true);
        } catch (exception) {
            if (
                exception instanceof ApiError
            ) {
                setEmailError(
                    exception.errors
                        .email?.[0],
                );

                setMessage(
                    exception.message,
                );

                return;
            }

            setMessage(
                t('ui.acconova_could_not_process_the_recovery_request'),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <Head title={t('ui.recover_password_acconova')} />

            <AuthShell
                eyebrow={t('ui.account_recovery')}
                title={t('ui.find_your_way_back')}
                description={t('ui.enter_the_email_address_registered_with_your_acconova_account')}
            >
                {sent ? (
                    <div className="mt-10">
                        <div className="rounded-[20px] border border-[var(--ac-line)] bg-white p-5 shadow-[var(--ac-shadow-soft)]">
                            <div className="flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                <Mail size={17} />
                            </div>

                            <h3 className="mt-5 text-lg font-semibold">
                                {t('ui.check_your_inbox')}
                            </h3>

                            <p className="mt-2 text-sm leading-6 text-[var(--ac-text-soft)]">
                                {t('ui.we_sent_a_secure_password_recovery_link_to')} {email}.
                            </p>
                        </div>

                        <Link
                            href="/login"
                            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--ac-accent-strong)]"
                        >
                            <ArrowLeft size={15} />
                            {t('ui.back_to_sign_in')}
                        </Link>
                    </div>
                ) : (
                    <form
                        className="mt-10 space-y-5"
                        onSubmit={handleSubmit}
                    >
                        <AuthInput
                            label={t('ui.account_email')}
                            type="email"
                            autoComplete="email"
                            placeholder={t('ui.you_company_com')}
                            value={email}
                            onChange={setEmail}
                            error={emailError}
                        />

                        {message && ! emailError && (
                            <div className="rounded-[16px] border border-[var(--ac-danger)]/20 bg-[var(--ac-danger)]/5 px-4 py-3 text-sm text-[var(--ac-danger)]">
                                {message}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            className="flex h-12 w-full items-center justify-center rounded-[16px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white disabled:opacity-60"
                        >
                            {busy
                                ? t('ui.checking_account')
                                : t('ui.send_recovery_link')}
                        </button>

                        <Link
                            href="/login"
                            className="flex items-center justify-center gap-2 text-sm font-semibold text-[var(--ac-text-soft)]"
                        >
                            <ArrowLeft size={15} />
                            {t('ui.back_to_sign_in')}
                        </Link>
                    </form>
                )}
            </AuthShell>
        </>
    );
}
