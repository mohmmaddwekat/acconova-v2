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
            <Head title="Reset password · AccoNova" />

            <AuthShell
                eyebrow="Secure recovery"
                title="Choose a new password."
                description={`You're resetting access for ${email}.`}
            >
                {complete ? (
                    <div className="mt-10">
                        <div className="rounded-[20px] border border-[var(--ac-line)] bg-white p-5">
                            <CheckCircle2
                                size={22}
                                className="text-[var(--ac-accent-strong)]"
                            />

                            <h3 className="mt-4 text-lg font-semibold">
                                Password updated.
                            </h3>

                            <p className="mt-2 text-sm text-[var(--ac-text-soft)]">
                                You can now sign in with your
                                new password.
                            </p>
                        </div>

                        <Link
                            href="/login"
                            className="mt-6 flex h-12 items-center justify-center rounded-[16px] bg-[var(--ac-text)] text-sm font-semibold text-white"
                        >
                            Continue to sign in
                        </Link>
                    </div>
                ) : (
                    <form
                        className="mt-10 space-y-5"
                        onSubmit={handleSubmit}
                    >
                        <AuthInput
                            label="New password"
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
                            label="Confirm new password"
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
                                ? 'Updating…'
                                : 'Set new password'}
                        </button>
                    </form>
                )}
            </AuthShell>
        </>
    );
}
