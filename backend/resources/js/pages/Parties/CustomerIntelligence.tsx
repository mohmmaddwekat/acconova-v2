import {
    CustomerSegmentsPanel,
} from '@/components/dashboard/CustomerSegmentsPanel';
import { AppShell } from '@/layouts/AppShell';
import { useLocale } from '@/lib/i18n';
import type { AppPageProps } from '@/types/app';
import {
    Head,
    usePage,
} from '@inertiajs/react';
import { UsersRound } from 'lucide-react';

export default function CustomerIntelligence() {
    const ar = useLocale() === 'ar';
    const {
        workspace,
    } = usePage<AppPageProps>().props;

    const currency =
        workspace.activeOrganization?.currency
        ?? '';

    return (
        <AppShell>
            <Head
                title={
                    ar
                        ? 'ذكاء العملاء — AccoNova'
                        : 'Customer Intelligence — AccoNova'
                }
            />

            <main className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
                <div className="flex items-start gap-3">
                    <div className="flex size-11 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                        <UsersRound
                            size={
                                18
                            }
                        />
                    </div>

                    <div>
                        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--ac-text)] sm:text-3xl">
                            {ar
                                ? 'ذكاء العملاء'
                                : 'Customer intelligence'}
                        </h1>

                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ac-text-soft)]">
                            {ar
                                ? 'تقسيم العملاء، إشارات فقد العميل، التأخر بالدفع، وربحية كل علاقة في شاشة واحدة.'
                                : 'Customer segmentation, churn-risk signals, overdue balances and relationship profitability in one workspace.'}
                        </p>
                    </div>
                </div>

                <CustomerSegmentsPanel
                    ar={
                        ar
                    }
                    currency={
                        currency
                    }
                    full
                />
            </main>
        </AppShell>
    );
}
