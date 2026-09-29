import { Banknote, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

function shouldShow(): boolean {
    if (typeof window === 'undefined') return false;

    return window.location.pathname.startsWith('/admin')
        && window.location.pathname !== '/admin/manual-payments';
}

export function AdminManualPaymentReviewLauncher() {
    const [visible, setVisible] = useState(shouldShow);

    useEffect(() => {
        const refresh = (): void => setVisible(shouldShow());

        window.addEventListener('popstate', refresh);
        document.addEventListener('inertia:navigate', refresh as EventListener);

        return () => {
            window.removeEventListener('popstate', refresh);
            document.removeEventListener('inertia:navigate', refresh as EventListener);
        };
    }, []);

    if (! visible) return null;

    const ar = document.documentElement.lang === 'ar'
        || document.documentElement.dir === 'rtl';

    return (
        <a
            href="/admin/manual-payments"
            dir={ar ? 'rtl' : 'ltr'}
            className="fixed bottom-4 left-4 z-[80] inline-flex min-h-10 max-w-[calc(100vw-2rem)] items-center gap-2 rounded-xl border border-sky-400/35 bg-[#162235] px-3 text-[11px] font-extrabold text-white shadow-xl shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-400 sm:bottom-6 sm:left-6"
            title={ar ? 'فتح طلبات الدفع اليدوي ومراجعتها' : 'Open and review manual payment requests'}
        >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-sky-500/20 text-sky-300">
                <Banknote size={15} />
            </span>
            <span className="truncate">{ar ? 'مراجعة طلبات الدفع' : 'Review payment requests'}</span>
            <ExternalLink size={13} className="shrink-0 opacity-70" />
        </a>
    );
}
