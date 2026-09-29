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
            className="fixed bottom-5 start-5 z-[80] inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-400/40 bg-[#162235] px-4 text-xs font-extrabold text-white shadow-2xl shadow-slate-950/25 transition hover:-translate-y-0.5 hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-400"
            title={ar ? 'فتح طلبات الدفع اليدوي ومراجعتها' : 'Open and review manual payment requests'}
        >
            <span className="grid size-7 place-items-center rounded-lg bg-sky-500/20 text-sky-300">
                <Banknote size={16} />
            </span>
            <span>{ar ? 'مراجعة طلبات الدفع' : 'Review payment requests'}</span>
            <ExternalLink size={14} className="opacity-70" />
        </a>
    );
}
