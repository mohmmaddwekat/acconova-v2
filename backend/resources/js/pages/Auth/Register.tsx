import { useLocale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import {
    Head,
    Link,
} from '@inertiajs/react';
import {
    ArrowRight,
    UserPlus,
} from 'lucide-react';
import {
    useEffect,
    useState,
    type FormEvent,
} from 'react';

import { register } from '@/features/auth/api';
import { AuthInput } from '@/features/auth/components/AuthInput';
import { ApiError } from '@/lib/http';
import { AuthShell } from '@/layouts/AuthShell';

type CheckoutIntent = {
    plan: string;
    interval: 'month' | 'year';
};

const checkoutIntentKey = 'acconova.checkoutIntent';

function checkoutIntentFromPricing(): CheckoutIntent | null {
    if (typeof window === 'undefined') return null;

    const params = new URLSearchParams(window.location.search);
    const plan = params.get('plan')?.trim() ?? '';
    const interval = params.get('interval') === 'year' ? 'year' : 'month';
    const source = params.get('source');

    if (
        source !== 'pricing'
        || ! /^[a-z0-9_-]+$/i.test(plan)
    ) {
        return null;
    }

    return { plan, interval };
}

/**
 * Render the AccoNova account registration experience.
 */
export default function Register() {
    useLocale();
    const [checkoutIntent] = useState<CheckoutIntent | null>(
        checkoutIntentFromPricing,
    );

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

    useEffect(() => {
        if (typeof window === 'undefined') return;

        try {
            if (checkoutIntent) {
                window.sessionStorage.setItem(
                    checkoutIntentKey,
                    JSON.stringify(checkoutIntent),
                );
            } else {
                window.sessionStorage.removeItem(checkoutIntentKey);
            }
        } catch {
            // Registration still works if private browsing blocks storage.
        }
    }, [checkoutIntent]);

    /**
     * Register and authenticate a new user before beginning workspace setup.
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
                t('ui.acconova_could_not_create_the_account'),
            );
        } finally {
            setBusy(false);
        }
    }

    const loginHref = checkoutIntent
        ? `/login?source=pricing&plan=${encodeURIComponent(checkoutIntent.plan)}&interval=${checkoutIntent.interval}`
        : '/login';

    return (
        <>
            <Head title={t('ui.create_account_acconova')} />

            <AuthShell
                eyebrow={t('ui.start_with_clarity')}
                title={t('ui.create_your_account')}
                description={t('ui.your_first_workspace_comes_next_no_business_data_is_mixed_between_organizations')}
            >
                <form
                    className="mt-10 space-y-5"
                    onSubmit={handleSubmit}
                >
                    <AuthInput
                        label={t('ui.your_name')}
                        autoComplete="name"
                        placeholder={t('ui.your_full_name')}
                        value={name}
                        onChange={setName}
                        error={
                            errors.name?.[0]
                        }
                    />

                    <AuthInput
                        label={t('ui.work_email')}
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
                        autoComplete="new-password"
                        minLength={12}
                        value={password}
                        onChange={setPassword}
                        error={
                            errors.password?.[0]
                        }
                    />

                    <AuthInput
                        label={t('ui.confirm_password')}
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
                        {t('ui.use_at_least_12_characters')}
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
                                ? t('ui.creating_account')
                                : t('ui.create_account')}
                        </span>

                        <ArrowRight
                            size={17}
                            className="transition group-hover:translate-x-0.5"
                        />
                    </button>
                </form>

                <div className="mt-8 flex items-center justify-between border-t border-[var(--ac-line)] pt-5">
                    <p className="text-xs text-[var(--ac-text-muted)]">
                        {t('ui.already_have_an_account')}
                    </p>

                    <Link
                        href={loginHref}
                        className="text-sm font-semibold text-[var(--ac-accent-strong)]"
                    >
                        {t('ui.sign_in')}
                    </Link>
                </div>
            </AuthShell>
        </>
    );
}
