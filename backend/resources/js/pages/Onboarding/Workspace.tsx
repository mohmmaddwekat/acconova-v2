import { Head } from '@inertiajs/react';
import {
    ArrowRight,
    Building2,
} from 'lucide-react';
import {
    useState,
    type FormEvent,
} from 'react';

import {
    ApiError,
    apiRequest,
} from '@/lib/http';

/**
 * Render the first workspace setup step for a newly registered user.
 */
export default function WorkspaceOnboarding() {
    const [name, setName] =
        useState('');

    const [busy, setBusy] =
        useState(false);

    const [error, setError] =
        useState<string | null>(null);

    /**
     * Create the user's first organization.
     *
     * The backend automatically creates the immutable Owner membership
     * and selects the organization as the current session tenant.
     */
    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        setBusy(true);
        setError(null);

        try {
            await apiRequest(
                '/api/organizations',
                {
                    method: 'POST',

                    body: JSON.stringify({
                        name,
                    }),
                },
            );

            window.location.assign('/app');
        } catch (exception) {
            if (
                exception instanceof ApiError
            ) {
                setError(
                    exception.errors
                        .name?.[0] ??
                        exception.message,
                );

                return;
            }

            setError(
                'AccoNova could not create the workspace.',
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <Head title="Create workspace · AccoNova" />

            <main className="flex min-h-screen items-center justify-center bg-[var(--ac-bg)] p-6">
                <section className="w-full max-w-2xl rounded-[32px] border border-[var(--ac-line)] bg-white p-8 shadow-[var(--ac-shadow-panel)] sm:p-12">
                    <div className="flex size-12 items-center justify-center rounded-[18px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                        <Building2 size={20} />
                    </div>

                    <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--ac-accent-strong)]">
                        Your first workspace
                    </p>

                    <h1 className="mt-3 max-w-xl text-5xl font-medium leading-[0.95] tracking-[-0.06em] text-[var(--ac-text)]">
                        Give your business a home.
                    </h1>

                    <p className="mt-5 max-w-lg text-sm leading-6 text-[var(--ac-text-soft)]">
                        A workspace keeps its customers,
                        invoices, memberships, and future
                        automation isolated from every other
                        organization.
                    </p>

                    <form
                        onSubmit={handleSubmit}
                        className="mt-10"
                    >
                        <label className="block">
                            <span className="mb-2 block text-sm font-medium">
                                Business or workspace name
                            </span>

                            <input
                                value={name}
                                onChange={(event) =>
                                    setName(
                                        event.target.value,
                                    )
                                }
                                placeholder="Acme Studio"
                                className="h-13 w-full rounded-[17px] border border-[var(--ac-line-strong)] bg-white px-4 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                                required
                            />
                        </label>

                        {error && (
                            <p className="mt-3 text-sm text-[var(--ac-danger)]">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            className="group mt-6 flex h-12 w-full items-center justify-between rounded-[16px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-60"
                        >
                            <span>
                                {busy
                                    ? 'Creating workspace…'
                                    : 'Create workspace'}
                            </span>

                            <ArrowRight
                                size={17}
                                className="transition group-hover:translate-x-0.5"
                            />
                        </button>
                    </form>
                </section>
            </main>
        </>
    );
}
