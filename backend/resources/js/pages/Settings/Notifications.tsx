import { NotificationRulesPanel } from '@/components/settings/NotificationRulesPanel';
import { AppShell } from '@/layouts/AppShell';
import { useLocale } from '@/lib/i18n';
import { Head } from '@inertiajs/react';
import { BellRing } from 'lucide-react';

export default function NotificationSettings() {
    const ar =
        useLocale() === 'ar';

    return (
        <AppShell>
            <Head
                title={
                    ar
                        ? 'إعدادات الإشعارات'
                        : 'Notification settings'
                }
            />

            <main
                dir={
                    ar
                        ? 'rtl'
                        : 'ltr'
                }
                className="mx-auto w-full max-w-[1500px] px-3 py-5 sm:px-5 lg:px-8"
            >
                <section className="rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]">
                    <div className="flex items-start gap-3">
                        <span className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <BellRing
                                size={18}
                            />
                        </span>
                        <div>
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ac-accent)]">
                                Settings
                            </p>
                            <h1 className="mt-1 text-2xl font-bold text-[var(--ac-text)]">
                                {ar
                                    ? 'إعدادات الإشعارات'
                                    : 'Notification settings'}
                            </h1>
                            <p className="mt-2 max-w-3xl text-xs leading-6 text-[var(--ac-text-muted)]">
                                {ar
                                    ? 'قواعد شخصية خاصة بحسابك داخل مساحة العمل الحالية، بدون التأثير على تنبيهات بقية المستخدمين.'
                                    : 'Personal rules for your account in the current workspace without changing other users’ notifications.'}
                            </p>
                        </div>
                    </div>
                </section>

                <div className="mt-4 [--acs-line:var(--ac-line)] [--acs-line-strong:var(--ac-line-strong)] [--acs-control:var(--ac-bg)] [--acs-control-hover:var(--ac-surface-soft)] [--acs-surface:var(--ac-surface)] [--acs-surface-soft:var(--ac-surface-soft)] [--acs-text:var(--ac-text)] [--acs-text-muted:var(--ac-text-muted)] [--acs-accent:var(--ac-accent)]">
                    <NotificationRulesPanel
                        ar={ar}
                    />
                </div>
            </main>
        </AppShell>
    );
}
