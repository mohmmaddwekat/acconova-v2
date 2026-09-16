import { useLocale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import {
    Head,
    Link,
} from '@inertiajs/react';
import {
    CheckCircle2,
    KeyRound,
} from 'lucide-react';
import {
    useState,
    type FormEvent,
} from 'react';

import { resetPassword } from '@/features/auth/api';
import { AuthInput } from '@/features/auth/components/AuthInput';
import { ApiError } from '@/lib/http';
import { AuthShell } from '@/layouts/AuthShell';

type ResetPasswordProps = {
    token: string;
    email: string;
};

/**
 * Render the secure password replacement screen.
 */
export default function ResetPassword({
    token,
    email,
}: ResetPasswordProps) {
    useLocale();
    const [password, setPassword] =
        useState('');

    const [
        passwordConfirmation,
        setPasswordConfirmation,
    ] = useState('');

    const [busy, setBusy] =
        useState(false);

    const [complete, setComplete] =
        useState(false);

    const [errors, setErrors] =
        useState<
            Record<string, string[]>
        >({});

    /**
     * Submit the broker token and replacement password to Laravel.
     */
    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();
        if (busy) return;

        setBusy(true);
        setErrors({});

        try {
            await resetPassword({
                token,
                email,
                password,
                password_confirmation:
                    passwordConfirmation,
            });

            setComplete(true);
        } catch (exception) {
            if (
                exception instanceof ApiError
            ) {
                setErrors(
                    exception.errors,
                );
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <Head title={t('ui.reset_password_acconova')} />

            <AuthShell
                eyebrow={t('ui.secure_recovery')}
                title={t('ui.choose_a_new_password')}
                description={t('auth.resetFor', { email })}
            >
                {complete ? (
                    <div className="mt-10">
                        <div className="rounded-[20px] border border-[var(--ac-line)] bg-white p-5">
                            <CheckCircle2
                                size={22}
                                className="text-[var(--ac-accent-strong)]"
                            />

                            <h3 className="mt-4 text-lg font-semibold">
                                {t('ui.password_updated')}
                            </h3>

                            <p className="mt-2 text-sm text-[var(--ac-text-soft)]">
                                {t('ui.you_can_now_sign_in_with_your_new_password')}
                            </p>
                        </div>

                        <Link
                            href="/login"
                            className="mt-6 flex h-12 items-center justify-center rounded-[16px] bg-[var(--ac-text)] text-sm font-semibold text-white"
                        >
                            {t('ui.continue_to_sign_in')}
                        </Link>
                    </div>
                ) : (
                    <form
                        className="mt-10 space-y-5"
                        onSubmit={handleSubmit}
                    >
                        <AuthInput
                            label={t('ui.new_password')}
                            type="password"
                            autoComplete="new-password"
                            minLength={12}
                            value={password}
                            onChange={setPassword}
                            error={
                                errors.password?.[0]
                            }
                        />

                        <AuthInput
                            label={t('ui.confirm_new_password')}
                            type="password"
                            autoComplete="new-password"
                            minLength={12}
                            value={
                                passwordConfirmation
                            }
                            onChange={
                                setPasswordConfirmation
                            }
                        />

                        {errors.email?.[0] && (
                            <p className="text-sm text-[var(--ac-danger)]">
                                {errors.email[0]}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-[var(--ac-text)] text-sm font-semibold text-white disabled:opacity-60"
                        >
                            <KeyRound size={16} />

                            {busy
                                ? t('ui.updating')
                                : t('ui.set_new_password')}
                        </button>
                    </form>
                )}
            </AuthShell>
        </>
    );
}
