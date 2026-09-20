import { AppShell } from '@/layouts/AppShell';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { CashDetail } from './CashDetail';
import { CashForm } from './CashForm';
import { CashList } from './CashList';
import { DocumentDetail } from './DocumentDetail';
import { DocumentForm } from './DocumentForm';
import { DocumentList } from './DocumentList';
import { Taxes } from './Taxes';
import { apiErrorText } from './shared';
import type {
    FinanceLookups,
    FinanceView,
} from './types';

export default function FinanceIndex({
    financeView,
    recordId,
}: {
    financeView: FinanceView;
    recordId?: number | null;
}) {
    const locale = useLocale();
    const ar = locale === 'ar';
    const [lookups, setLookups] = useState<FinanceLookups | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        setError('');

        apiRequest<FinanceLookups>('/api/finance/lookups', {
            signal: controller.signal,
        })
            .then(setLookups)
            .catch((failure) => {
                if (! controller.signal.aborted) {
                    setError(apiErrorText(failure));
                }
            });

        return () => controller.abort();
    }, []);

    const title = (() => {
        switch (financeView) {
            case 'sales-list':
                return ar ? 'فواتير البيع' : 'Sales invoices';
            case 'sales-create':
                return ar ? 'إنشاء فاتورة بيع' : 'Create sales invoice';
            case 'sales-detail':
                return ar ? 'تفاصيل فاتورة البيع' : 'Sales invoice details';
            case 'purchase-list':
                return ar ? 'فواتير الشراء' : 'Purchase invoices';
            case 'purchase-create':
                return ar ? 'إنشاء فاتورة شراء' : 'Create purchase invoice';
            case 'purchase-detail':
                return ar ? 'تفاصيل فاتورة الشراء' : 'Purchase invoice details';
            case 'payment-list':
                return ar ? 'المدفوعات' : 'Payments';
            case 'payment-create':
                return ar ? 'تسجيل دفعة' : 'Record payment';
            case 'payment-detail':
                return ar ? 'تفاصيل الدفعة' : 'Payment details';
            case 'receipt-list':
                return ar ? 'المقبوضات' : 'Receipts';
            case 'receipt-create':
                return ar ? 'تسجيل مقبوض' : 'Record receipt';
            case 'receipt-detail':
                return ar ? 'تفاصيل المقبوض' : 'Receipt details';
            case 'taxes':
                return ar ? 'الضرائب والمستحقات' : 'Taxes & obligations';
        }
    })();

    return (
        <AppShell>
            <Head title={title} />

            <main
                dir={ar ? 'rtl' : 'ltr'}
                className="min-h-[calc(100dvh-72px)] bg-[#f8fbff] px-3 py-5 sm:px-5 lg:px-8"
            >
                <div className="mx-auto w-full max-w-[1680px]">
                    {error && (
                        <div
                            role="alert"
                            className="rounded-[18px] border border-red-200 bg-red-50 p-5 text-sm text-red-700"
                        >
                            {error}
                        </div>
                    )}

                    {! lookups && ! error && (
                        <div className="rounded-[18px] border border-[#dbe6f5] bg-white p-12 text-center text-sm text-slate-400">
                            {ar ? 'جارٍ تحميل البيانات المالية...' : 'Loading finance data...'}
                        </div>
                    )}

                    {lookups && (
                        <FinanceViewRenderer
                            financeView={financeView}
                            recordId={recordId ?? null}
                            lookups={lookups}
                            ar={ar}
                        />
                    )}
                </div>
            </main>
        </AppShell>
    );
}

function FinanceViewRenderer({
    financeView,
    recordId,
    lookups,
    ar,
}: {
    financeView: FinanceView;
    recordId: number | null;
    lookups: FinanceLookups;
    ar: boolean;
}) {
    switch (financeView) {
        case 'sales-list':
            return <DocumentList kind="sale_invoice" lookups={lookups} ar={ar} />;

        case 'sales-create':
            return <DocumentForm kind="sale_invoice" lookups={lookups} ar={ar} />;

        case 'sales-detail':
            return recordId
                ? <DocumentDetail id={recordId} kind="sale_invoice" lookups={lookups} ar={ar} />
                : null;

        case 'purchase-list':
            return <DocumentList kind="purchase_invoice" lookups={lookups} ar={ar} />;

        case 'purchase-create':
            return <DocumentForm kind="purchase_invoice" lookups={lookups} ar={ar} />;

        case 'purchase-detail':
            return recordId
                ? <DocumentDetail id={recordId} kind="purchase_invoice" lookups={lookups} ar={ar} />
                : null;

        case 'payment-list':
            return <CashList direction="outgoing" lookups={lookups} ar={ar} />;

        case 'payment-create':
            return <CashForm direction="outgoing" lookups={lookups} ar={ar} />;

        case 'payment-detail':
            return recordId
                ? <CashDetail id={recordId} direction="outgoing" lookups={lookups} ar={ar} />
                : null;

        case 'receipt-list':
            return <CashList direction="incoming" lookups={lookups} ar={ar} />;

        case 'receipt-create':
            return <CashForm direction="incoming" lookups={lookups} ar={ar} />;

        case 'receipt-detail':
            return recordId
                ? <CashDetail id={recordId} direction="incoming" lookups={lookups} ar={ar} />
                : null;

        case 'taxes':
            return <Taxes lookups={lookups} ar={ar} />;
    }
}
