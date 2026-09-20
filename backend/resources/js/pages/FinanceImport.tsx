import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    CheckCircle2,
    Download,
    FileSpreadsheet,
    ShieldCheck,
    UploadCloud,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';

type ImportType = 'sales_invoices' | 'purchase_invoices' | 'cash_movements';

type Preview = {
    type: ImportType;
    name: string;
    row_count: number;
    headers: string[];
    sample: Record<string, unknown>[];
    missing_required: string[];
    ready: boolean;
};

type ImportResult = {
    type: ImportType;
    created: number;
    skipped: number;
    errors: { row: number; message: string }[];
};

const panel = 'rounded-[20px] border border-[#dbe6f5] bg-white p-5 shadow-[0_8px_28px_rgba(30,75,140,.04)]';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#dbe6f5] bg-white px-4 text-xs font-semibold text-[#345b8f] transition hover:bg-blue-50 disabled:opacity-40';
const primary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-[#1265d8] px-5 text-xs font-semibold text-white transition hover:bg-[#0f58bf] disabled:opacity-40';

function errorText(error: unknown, fallback: string): string {
    if (error instanceof ApiError) {
        return [error.message, ...Object.values(error.errors).flat()].filter(Boolean).join(' ');
    }

    return error instanceof Error ? error.message : fallback;
}

export default function FinanceImport() {
    const ar = useLocale() === 'ar';
    const text = (arabic: string, english: string): string => ar ? arabic : english;
    const [type, setType] = useState<ImportType>('sales_invoices');
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const label = useMemo(() => ({
        sales_invoices: text('فواتير البيع القديمة', 'Legacy sales invoices'),
        purchase_invoices: text('فواتير الشراء القديمة', 'Legacy purchase invoices'),
        cash_movements: text('الدفعات والمقبوضات والمصاريف', 'Payments, receipts & expenses'),
    })[type], [type, ar]);

    function reset(nextType?: ImportType): void {
        if (nextType) {
            setType(nextType);
        }
        setFile(null);
        setPreview(null);
        setResult(null);
        setError('');
    }

    async function inspect(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        if (! file || busy) return;

        setBusy(true);
        setError('');
        setResult(null);

        try {
            const body = new FormData();
            body.set('type', type);
            body.set('file', file);

            const response = await apiRequest<Preview>('/api/finance-import/preview', {
                method: 'POST',
                body,
            });

            setPreview(response);
        } catch (failure) {
            setError(errorText(failure, text('تعذر قراءة الملف.', 'Could not read the file.')));
        } finally {
            setBusy(false);
        }
    }

    async function commit(): Promise<void> {
        if (! file || ! preview?.ready || busy) return;

        setBusy(true);
        setError('');
        setResult(null);

        try {
            const body = new FormData();
            body.set('type', type);
            body.set('file', file);

            const response = await apiRequest<ImportResult>('/api/finance-import/commit', {
                method: 'POST',
                body,
            });

            setResult(response);
        } catch (failure) {
            setError(errorText(failure, text('تعذر إكمال الاستيراد.', 'Could not complete the import.')));
        } finally {
            setBusy(false);
        }
    }

    return (
        <AppShell>
            <Head title={text('استيراد البيانات المالية', 'Import finance data')} />

            <main dir={ar ? 'rtl' : 'ltr'} className="min-h-[calc(100dvh-72px)] bg-[#f8fbff] px-4 py-6 sm:px-8">
                <div className="mx-auto max-w-6xl space-y-5">
                    <header className="flex flex-col gap-4 rounded-[24px] border border-[#dbe6f5] bg-white p-6 shadow-sm sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-[#123d78]">
                                {text('نقل البيانات القديمة إلى AccoNova', 'Move legacy data into AccoNova')}
                            </h1>
                            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
                                {text(
                                    'انقل آلاف السجلات بدل إدخالها يدوياً: استخدم نموذج Excel، أو ارفع CSV/XLS/XLSX، أو ملف JSON مُصدّر من قاعدة بيانات أو نظام قديم. AccoNova يفحص الملف قبل الاعتماد ويحمي من التكرار.',
                                    'Move thousands of records instead of re-entering them: use the Excel template, upload CSV/XLS/XLSX, or a JSON export from a legacy database/system. AccoNova previews the file before import and protects against duplicates.',
                                )}
                            </p>
                        </div>

                        <Link href="/app/finance" className={button}>
                            <ArrowLeft size={15} className="rtl:rotate-180" />
                            {text('رجوع للمالية', 'Back to finance')}
                        </Link>
                    </header>

                    <section className={panel}>
                        <h2 className="font-bold text-[#123d78]">
                            {text('1. اختر نوع البيانات', '1. Choose the data type')}
                        </h2>

                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                            {([
                                ['sales_invoices', text('فواتير البيع', 'Sales invoices')],
                                ['purchase_invoices', text('فواتير الشراء', 'Purchase invoices')],
                                ['cash_movements', text('دفعات ومقبوضات ومصاريف', 'Payments, receipts & expenses')],
                            ] as [ImportType, string][]).map(([value, title]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => reset(value)}
                                    className={[
                                        'rounded-[16px] border p-4 text-start transition',
                                        type === value
                                            ? 'border-[#1265d8] bg-blue-50 text-[#124f9e]'
                                            : 'border-[#e1eaf5] bg-white text-slate-600 hover:bg-slate-50',
                                    ].join(' ')}
                                >
                                    <strong>{title}</strong>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className={panel}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="font-bold text-[#123d78]">
                                    {text('2. نزّل نموذج جاهز', '2. Download a ready template')}
                                </h2>
                                <p className="mt-1 text-xs leading-6 text-slate-500">
                                    {text(
                                        'النموذج يحتوي أمثلة وتعليمات. وإذا كان ملفك من نظام قديم، يتعرف AccoNova على مجموعة واسعة من أسماء الأعمدة العربية والإنجليزية، ومنها رقم الفاتورة والعميل والمورد والمنتج وSKU.',
                                        'The template includes examples and instructions. For legacy exports, AccoNova also recognizes many common Arabic and English column names including invoice number, customer, supplier, product and SKU.',
                                    )}
                                </p>
                            </div>

                            <a
                                href={'/api/finance-import/template/' + type}
                                className={primary}
                            >
                                <Download size={15} />
                                {text('تنزيل نموذج Excel', 'Download Excel template')}
                            </a>
                        </div>
                    </section>

                    <section className={panel}>
                        <h2 className="font-bold text-[#123d78]">
                            {text('3. ارفع الملف وافحصه أولاً', '3. Upload and inspect first')}
                        </h2>

                        <form onSubmit={inspect} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                            <label className="flex-1 text-xs font-semibold text-[#49698f]">
                                {label}
                                <input
                                    type="file"
                                    accept=".csv,.txt,.xls,.xlsx,.json"
                                    onChange={(event) => {
                                        setFile(event.target.files?.[0] ?? null);
                                        setPreview(null);
                                        setResult(null);
                                        setError('');
                                    }}
                                    className="mt-2 block w-full rounded-[14px] border border-[#dbe6f5] bg-white p-3 text-sm"
                                />
                            </label>

                            <button type="submit" disabled={! file || busy} className={button}>
                                <UploadCloud size={15} />
                                {busy ? text('جاري الفحص...', 'Inspecting...') : text('فحص الملف', 'Inspect file')}
                            </button>
                        </form>
                    </section>

                    {error && (
                        <div role="alert" className="rounded-[16px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    {preview && (
                        <section className={panel}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h2 className="font-bold text-[#123d78]">
                                        {text('معاينة قبل الاستيراد', 'Preview before import')}
                                    </h2>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {preview.name} · {preview.row_count} {text('صف', 'rows')}
                                    </p>
                                </div>

                                <span className={[
                                    'rounded-full px-3 py-1 text-xs font-semibold',
                                    preview.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
                                ].join(' ')}>
                                    {preview.ready ? text('جاهز للاستيراد', 'Ready to import') : text('يحتاج تصحيح', 'Needs fixing')}
                                </span>
                            </div>

                            {preview.missing_required.length > 0 && (
                                <div className="mt-4 rounded-[14px] bg-red-50 p-3 text-xs text-red-700">
                                    {text('أعمدة مطلوبة ناقصة: ', 'Missing required columns: ')}
                                    {preview.missing_required.join(', ')}
                                </div>
                            )}

                            {preview.sample.length > 0 && (
                                <div className="mt-4 overflow-x-auto rounded-[14px] border border-[#e5edf7]">
                                    <table className="min-w-full text-xs">
                                        <thead className="bg-[#f7faff] text-[#6680a5]">
                                            <tr>
                                                {preview.headers.map((header) => (
                                                    <th key={header} className="px-3 py-2 text-start">{header}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {preview.sample.map((row, index) => (
                                                <tr key={index} className="border-t border-[#edf3fa]">
                                                    {preview.headers.map((header) => (
                                                        <td key={header} className="whitespace-nowrap px-3 py-2">
                                                            {String(row[header] ?? '')}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="mt-5 flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    disabled={! preview.ready || busy}
                                    onClick={() => void commit()}
                                    className={primary}
                                >
                                    <CheckCircle2 size={15} />
                                    {busy ? text('جاري الاستيراد...', 'Importing...') : text('اعتماد الاستيراد', 'Import data')}
                                </button>

                                <p className="text-[11px] leading-6 text-slate-500">
                                    {text(
                                        'فواتير الماضي المستوردة لا تغيّر مخزون اليوم. وإذا طابقنا SKU أو اسم المنتج، نحفظ ارتباط البند بالمنتج حتى يستفيد النظام من آخر سعر للعميل أو المورد لاحقاً. وإذا كانت دفعة قديمة أكبر من المتبقي على الفاتورة، يبقى الفرق رصيداً مقدماً للطرف.',
                                        'Imported historical invoices do not change today’s stock. When SKU or product name matches, the historical line stays linked to that product so future customer/supplier pricing can reuse the last price. If a legacy payment exceeds the invoice balance, the remainder stays as party advance credit.',
                                    )}
                                </p>
                            </div>
                        </section>
                    )}

                    {result && (
                        <section className={panel}>
                            <div className="flex items-start gap-3">
                                <span className="flex size-11 items-center justify-center rounded-[14px] bg-emerald-50 text-emerald-600">
                                    <CheckCircle2 size={20} />
                                </span>
                                <div className="flex-1">
                                    <h2 className="font-bold text-[#123d78]">
                                        {text('اكتمل الاستيراد', 'Import completed')}
                                    </h2>
                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-[14px] bg-emerald-50 p-4">
                                            <span className="text-xs text-emerald-700">{text('تمت الإضافة', 'Created')}</span>
                                            <strong className="mt-1 block text-2xl text-emerald-800">{result.created}</strong>
                                        </div>
                                        <div className="rounded-[14px] bg-amber-50 p-4">
                                            <span className="text-xs text-amber-700">{text('تم التخطي', 'Skipped')}</span>
                                            <strong className="mt-1 block text-2xl text-amber-800">{result.skipped}</strong>
                                        </div>
                                    </div>

                                    {result.errors.length > 0 && (
                                        <div className="mt-4 max-h-64 overflow-y-auto rounded-[14px] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                                            {result.errors.map((item, index) => (
                                                <p key={index}>{text('الصف ', 'Row ')}{item.row}: {item.message}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    <section className="flex items-start gap-3 rounded-[18px] border border-blue-200 bg-blue-50 p-4 text-xs leading-6 text-blue-800">
                        <ShieldCheck size={18} className="mt-1 shrink-0" />
                        <p>
                            {text(
                                'الاستيراد مصمم للنقل الآمن: العملة تؤخذ من إعدادات الشركة، البنود التاريخية لا تحرك المخزون، والمستندات الموجودة لا تُستبدل بصمت.',
                                'Migration is safety-first: currency comes from workspace settings, historical lines do not move inventory, and existing records are not silently overwritten.',
                            )}
                        </p>
                    </section>
                </div>
            </main>
        </AppShell>
    );
}
