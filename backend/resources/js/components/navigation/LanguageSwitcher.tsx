import { Languages } from 'lucide-react';

import { t, useLocale } from '@/lib/i18n';
import { locales, setLocale, type Locale } from '@/lib/locale';

/**
 * Render a compact language control in the global top bar.
 *
 * Language selection is intentionally independent from the account menu so it
 * remains visible and quick to use across every authenticated screen.
 */
export function LanguageSwitcher() {
    const locale = useLocale();

    /** Persist and apply one supported UI language without touching tenant data. */
    function chooseLocale(next: Locale): void {
        if (next !== locale) {
            setLocale(next);
        }
    }

    return (
        <div
            role="group"
            aria-label={t('common.language')}
            className="flex h-10 items-center gap-1 rounded-[14px] border border-[var(--ac-line)] bg-white p-1 shadow-[var(--ac-shadow-control)]"
        >
            <span className="hidden size-7 items-center justify-center rounded-[10px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)] sm:flex">
                <Languages size={14} />
            </span>

            {(Object.keys(locales) as Locale[]).map((value) => {
                const active = value === locale;

                return (
                    <button
                        key={value}
                        type="button"
                        aria-pressed={active}
                        aria-label={locales[value].label}
                        title={locales[value].label}
                        onClick={() => chooseLocale(value)}
                        className={[
                            'flex h-8 min-w-8 items-center justify-center rounded-[10px] px-2 text-[11px] font-bold transition duration-150',
                            'motion-safe:hover:-translate-y-0.5 active:translate-y-0',
                            active
                                ? 'bg-[var(--ac-text)] text-white shadow-sm'
                                : 'text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)] hover:text-[var(--ac-text)]',
                        ].join(' ')}
                    >
                        {value === 'en' ? 'EN' : 'ع'}
                    </button>
                );
            })}
        </div>
    );
}
