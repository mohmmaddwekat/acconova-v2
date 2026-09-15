import {
    Head,
    usePage,
} from '@inertiajs/react';
import {
    Building2,
    Search,
    UserRound,
} from 'lucide-react';
import {
    useEffect,
    useState,
    type FormEvent,
} from 'react';

import { fetchParties } from '@/features/parties/api';
import type { Party } from '@/features/parties/types';
import { AppShell } from '@/layouts/AppShell';
import type { AppPageProps } from '@/types/app';

/**
 * Return the most useful visible Party name regardless of person/company type.
 *
 * @param party Party returned by the public Laravel API.
 */
function partyLabel(party: Party): string {
    return (
        party.company_name ??
        party.name ??
        `Party #${party.id}`
    );
}

/**
 * Render the live tenant-scoped Party workspace using the existing Laravel API.
 */
export default function PartyIndex() {
    const { workspace } = usePage<AppPageProps>().props;

    const [parties, setParties] = useState<Party[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(
        null,
    );

    /**
     * Load Parties for the currently selected organization.
     *
     * @param term Optional server-side Party search.
     */
    async function loadParties(
        term = '',
    ): Promise<void> {
        if (! workspace.activeOrganization) {
            setParties([]);

            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const response = await fetchParties(term);

            setParties(response.data);
        } catch {
            setMessage(
                'Unable to load Parties for this workspace.',
            );
        } finally {
            setLoading(false);
        }
    }

    /**
     * Run the Party search through Laravel instead of filtering only the
     * currently loaded browser records.
     */
    function handleSearch(
        event: FormEvent<HTMLFormElement>,
    ): void {
        event.preventDefault();

        void loadParties(search);
    }

    useEffect(() => {
        void loadParties();
    }, [workspace.activeOrganization?.id]);

    return (
        <AppShell>
            <Head title="Parties · AccoNova" />

            <section className="mx-auto max-w-[1440px]">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--ac-accent-strong)]">
                            Business network
                        </p>

                        <h1 className="mt-3 text-5xl font-medium tracking-[-0.055em] text-[var(--ac-text)]">
                            Parties
                        </h1>

                        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--ac-text-soft)]">
                            Customers and suppliers live once,
                            then flow through quotes, invoices,
                            payments, and automation.
                        </p>
                    </div>

                    <form
                        onSubmit={handleSearch}
                        className="flex h-11 min-w-72 items-center gap-2 rounded-[16px] border border-[var(--ac-line)] bg-white px-3 shadow-[var(--ac-shadow-soft)]"
                    >
                        <Search
                            size={16}
                            className="text-[var(--ac-text-muted)]"
                        />

                        <input
                            value={search}
                            onChange={(event) =>
                                setSearch(event.target.value)
                            }
                            placeholder="Search the network"
                            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        />
                    </form>
                </div>

                {! workspace.activeOrganization ? (
                    <div className="mt-10 rounded-[var(--ac-radius-lg)] border border-[var(--ac-line)] bg-white p-10 shadow-[var(--ac-shadow-soft)]">
                        <h2 className="text-xl font-medium">
                            Choose a workspace first.
                        </h2>

                        <p className="mt-2 text-sm text-[var(--ac-text-soft)]">
                            Use the workspace selector above to
                            choose the organization whose Parties
                            you want to work with.
                        </p>
                    </div>
                ) : (
                    <div className="mt-10 overflow-hidden rounded-[var(--ac-radius-lg)] border border-[var(--ac-line)] bg-white shadow-[var(--ac-shadow-panel)]">
                        <div className="flex items-center justify-between border-b border-[var(--ac-line)] px-6 py-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ac-text-muted)]">
                                {
                                    workspace
                                        .activeOrganization.name
                                }
                            </p>

                            <span className="text-xs text-[var(--ac-text-muted)]">
                                {loading
                                    ? 'Loading…'
                                    : `${parties.length} shown`}
                            </span>
                        </div>

                        {message ? (
                            <p className="p-6 text-sm text-[var(--ac-danger)]">
                                {message}
                            </p>
                        ) : parties.length === 0 &&
                          ! loading ? (
                            <div className="p-10">
                                <h2 className="text-lg font-medium">
                                    Your network is empty.
                                </h2>

                                <p className="mt-2 text-sm text-[var(--ac-text-soft)]">
                                    The first customer or supplier
                                    you create will appear here.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--ac-line)]">
                                {parties.map((party) => {
                                    const Icon =
                                        party.type ===
                                        'company'
                                            ? Building2
                                            : UserRound;

                                    return (
                                        <div
                                            key={party.id}
                                            className="grid gap-4 px-6 py-4 transition hover:bg-[var(--ac-surface-soft)] md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]"
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-soft)]">
                                                    <Icon
                                                        size={
                                                            17
                                                        }
                                                    />
                                                </div>

                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold">
                                                        {partyLabel(
                                                            party,
                                                        )}
                                                    </p>

                                                    <p className="mt-0.5 text-xs capitalize text-[var(--ac-text-muted)]">
                                                        {
                                                            party.type
                                                        }
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="min-w-0">
                                                <p className="truncate text-sm text-[var(--ac-text-soft)]">
                                                    {party.email ??
                                                        party.phone ??
                                                        'No contact details yet'}
                                                </p>

                                                <p className="mt-1 truncate text-xs text-[var(--ac-text-muted)]">
                                                    {party.city ??
                                                        party.country_code ??
                                                        'Location not set'}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                                {party.roles.map(
                                                    (role) => (
                                                        <span
                                                            key={
                                                                role
                                                            }
                                                            className="rounded-full bg-[var(--ac-accent-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-accent-strong)]"
                                                        >
                                                            {
                                                                role
                                                            }
                                                        </span>
                                                    ),
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </section>
        </AppShell>
    );
}
