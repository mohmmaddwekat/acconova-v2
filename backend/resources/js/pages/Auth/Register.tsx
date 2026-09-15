import {
    Head,
    Link,
} from '@inertiajs/react';
import {
    ArrowRight,
    UserPlus,
} from 'lucide-react';
import {
    useState,
    type FormEvent,
} from 'react';

import { register } from '@/features/auth/api';
import { AuthInput } from '@/features/auth/components/AuthInput';
import { ApiError } from '@/lib/http';
import { AuthShell } from '@/layouts/AuthShell';

/**
 * Render the AccoNova account registration experience.
 */
export default function Register() {
    const [name, setName] =
        useState('');

    const [email, setEmail] =
        useState('');

    const [password, setPassword] =
        useState('');

    const [
        passwordConfirmation,
        setPasswordConfirmation,
    ] = useState('');

    const [busy, setBusy] =
        useState(false);

    const [errors, setErrors] =
        useState<
            Record<string, string[]>
        >({});

    const [message, setMessage] =
        useState<string | null>(null);

    /**
     * Register and authenticate a new user before beginning workspace setup.
     */
    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        setBusy(true);
        setErrors({});
        setMessage(null);

        try {
            await register({
                name,
                email,
                password,
                password_confirmation:
                    passwordConfirmation,
            });

            window.location.assign(
                 '/verify-email',
            );
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
                'AccoNova could not create the account.',
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <Head title="Create account · AccoNova" />

            <AuthShell
                eyebrow="Start with clarity"
                title="Create your account."
                description="Your first workspace comes next. No business data is mixed between organizations."
            >
                <form
                    className="mt-10 space-y-5"
                    onSubmit={handleSubmit}
                >
                    <AuthInput
                        label="Your name"
                        autoComplete="name"
                        placeholder="Your full name"
                        value={name}
                        onChange={setName}
                        error={
                            errors.name?.[0]
                        }
                    />

                    <AuthInput
                        label="Work email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={setEmail}
                        error={
                            errors.email?.[0]
                        }
                    />

                    <AuthInput
                        label="Password"
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
                        label="Confirm password"
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

                    <p className="text-xs leading-5 text-[var(--ac-text-muted)]">
                        Use at least 12 characters.
                    </p>

                    {message && (
                        <div className="rounded-[16px] border border-[var(--ac-danger)]/20 bg-[var(--ac-danger)]/5 px-4 py-3 text-sm text-[var(--ac-danger)]">
                            {message}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={busy}
                        className="group flex h-12 w-full items-center justify-between rounded-[16px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-60"
                    >
                        <span className="flex items-center gap-2">
                            <UserPlus
                                size={16}
                            />

                            {busy
                                ? 'Creating account…'
                                : 'Create account'}
                        </span>

                        <ArrowRight
                            size={17}
                            className="transition group-hover:translate-x-0.5"
                        />
                    </button>
                </form>

                <div className="mt-8 flex items-center justify-between border-t border-[var(--ac-line)] pt-5">
                    <p className="text-xs text-[var(--ac-text-muted)]">
                        Already have an account?
                    </p>

                    <Link
                        href="/login"
                        className="text-sm font-semibold text-[var(--ac-accent-strong)]"
                    >
                        Sign in
                    </Link>
                </div>
            </AuthShell>
        </>
    );
}
