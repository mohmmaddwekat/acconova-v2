import { StaffModuleNav } from '@/components/staff/StaffModuleNav';
import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    Database,
    FileSpreadsheet,
    RefreshCcw,
    ShieldCheck,
    UploadCloud,
    UsersRound,
    WalletCards,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';

type ImportType = 'employees' | 'attendance' | 'transactions';

type SheetPreview = {
    name: string;
    headers: string[];
    sample: Record<string, unknown>[];
    row_count: number;
};

type PreviewResponse = {
    token: string;
    name: string;
    sheets: SheetPreview[];
};

type ImportResult = {
    type: ImportType;
    created: number;
    updated: number;
    skipped: number;
    errors: { row: number; message: string }[];
};

type FieldDefinition = {
    key: string;
    required?: boolean;
    ar: string;
    en: string;
    aliases: string[];
};

const panel =
    'rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]';
const field =
    'w-full rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3.5 py-3 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:bg-[var(--ac-surface)]';
const button =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-4 text-xs font-semibold text-[var(--ac-text)] transition hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)] disabled:cursor-not-allowed disabled:opacity-40';
const primary =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-accent-solid)] px-5 text-xs font-semibold text-[var(--ac-accent-solid-text)] transition hover:bg-[var(--ac-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40';

const definitions: Record<ImportType, FieldDefinition[]> = {
    employees: [
        { key: 'name', required: true, ar: 'اسم الموظف', en: 'Employee name', aliases: ['name', 'employee', 'employee name', 'full name', 'اسم', 'اسم الموظف', 'الموظف'] },
        { key: 'job_title', ar: 'المسمى الوظيفي', en: 'Job title', aliases: ['job title', 'job_title', 'title', 'position', 'المسمى الوظيفي', 'الوظيفة'] },
        { key: 'phone', ar: 'الهاتف', en: 'Phone', aliases: ['phone', 'mobile', 'telephone', 'الهاتف', 'الجوال', 'رقم الهاتف'] },
        { key: 'email', ar: 'البريد الإلكتروني', en: 'Email', aliases: ['email', 'e-mail', 'mail', 'البريد', 'البريد الإلكتروني', 'ايميل'] },
        { key: 'department', ar: 'القسم', en: 'Department', aliases: ['department', 'dept', 'section', 'القسم', 'قسم'] },
        { key: 'basis', required: true, ar: 'أساس الأجر', en: 'Pay basis', aliases: ['basis', 'pay basis', 'salary type', 'payment basis', 'أساس الأجر', 'نوع الراتب', 'نوع الأجر'] },
        { key: 'unit', ar: 'الوحدة', en: 'Unit', aliases: ['unit', 'piece unit', 'الوحدة', 'اسم القطعة'] },
        { key: 'rate', required: true, ar: 'الراتب / المعدل', en: 'Salary / rate', aliases: ['rate', 'salary', 'wage', 'base salary', 'الأجر', 'الراتب', 'المعدل'] },
        { key: 'monthly_allowance', ar: 'العلاوة الشهرية', en: 'Monthly allowance', aliases: ['monthly allowance', 'allowance', 'monthly_allowance', 'العلاوة الشهرية', 'بدل شهري', 'العلاوة'] },
        { key: 'started_on', required: true, ar: 'تاريخ بدء العمل', en: 'Start date', aliases: ['started on', 'start date', 'hire date', 'joining date', 'started_on', 'تاريخ بدء العمل', 'تاريخ التعيين', 'تاريخ البدء'] },
        { key: 'active', ar: 'الحالة', en: 'Active status', aliases: ['active', 'status', 'employment status', 'الحالة', 'نشط', 'حالة الموظف'] },
    ],
    attendance: [
        { key: 'employee', required: true, ar: 'معرّف الموظف', en: 'Employee identifier', aliases: ['employee', 'employee name', 'name', 'phone', 'email', 'الموظف', 'اسم الموظف', 'الهاتف', 'البريد'] },
        { key: 'occurred_on', required: true, ar: 'التاريخ', en: 'Date', aliases: ['date', 'attendance date', 'occurred_on', 'التاريخ', 'تاريخ الحضور'] },
        { key: 'status', required: true, ar: 'الحالة', en: 'Status', aliases: ['status', 'attendance', 'الحالة', 'الحضور'] },
        { key: 'quantity', ar: 'الكمية / الساعات', en: 'Quantity / hours', aliases: ['quantity', 'hours', 'work hours', 'الكمية', 'الساعات', 'ساعات العمل'] },
        { key: 'overtime_hours', ar: 'ساعات إضافية', en: 'Overtime hours', aliases: ['overtime', 'overtime hours', 'overtime_hours', 'ساعات إضافية', 'الإضافي'] },
        { key: 'overtime_rate', ar: 'أجر ساعة الإضافي', en: 'Overtime rate', aliases: ['overtime rate', 'overtime_rate', 'أجر الإضافي', 'سعر الإضافي'] },
        { key: 'notes', ar: 'ملاحظات', en: 'Notes', aliases: ['notes', 'note', 'comment', 'ملاحظات', 'ملاحظة'] },
    ],
    transactions: [
        { key: 'employee', required: true, ar: 'معرّف الموظف', en: 'Employee identifier', aliases: ['employee', 'employee name', 'name', 'phone', 'email', 'الموظف', 'اسم الموظف', 'الهاتف', 'البريد'] },
        { key: 'kind', required: true, ar: 'نوع الحركة', en: 'Transaction type', aliases: ['kind', 'type', 'entry type', 'transaction type', 'نوع العملية', 'نوع الحركة', 'النوع'] },
        { key: 'occurred_on', required: true, ar: 'التاريخ', en: 'Date', aliases: ['date', 'occurred_on', 'transaction date', 'payment date', 'التاريخ', 'تاريخ العملية', 'تاريخ الدفعة'] },
        { key: 'amount', required: true, ar: 'المبلغ', en: 'Amount', aliases: ['amount', 'value', 'total', 'payment amount', 'المبلغ', 'القيمة'] },
        { key: 'notes', ar: 'البيان / الملاحظات', en: 'Description / notes', aliases: ['notes', 'description', 'memo', 'reference', 'البيان', 'ملاحظات', 'الوصف', 'المرجع'] },
    ],
};

function normalize(value: string): string {
    return value.trim().toLocaleLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
}

function autoMapping(headers: string[], type: ImportType): Record<string, string> {
    const result: Record<string, string> = {};

    for (const definition of definitions[type]) {
        const aliases = definition.aliases.map(normalize);
        const exact = headers.find((header) => aliases.includes(normalize(header)));

        if (exact) {
            result[definition.key] = exact;
            continue;
        }

        result[definition.key] = headers.find((header) => {
            const candidate = normalize(header);
            return aliases.some((alias) => candidate.includes(alias) || alias.includes(candidate));
        }) ?? '';
    }

    return result;
}

function errorMessage(error: unknown, fallback: string): string {
    if (error instanceof ApiError) {
        return [error.message, ...Object.values(error.errors).flat()].filter(Boolean).join(' ');
    }

    return error instanceof Error ? error.message : fallback;
}

export default function StaffImportPage() {
    const ar = useLocale() === 'ar';
    const [type, setType] = useState<ImportType>('employees');
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<PreviewResponse | null>(null);
    const [sheetName, setSheetName] = useState('');
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [matchBy, setMatchBy] = useState<'name' | 'phone' | 'email'>('phone');
    const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update'>('skip');
    const [createDepartments, setCreateDepartments] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<ImportResult | null>(null);

    const selectedSheet = preview?.sheets.find((sheet) => sheet.name === sheetName) ?? null;
    const mappedRequired = useMemo(
        () => definitions[type].filter((item) => item.required).every((item) => Boolean(mapping[item.key])),
        [mapping, type],
    );

    function resetPreview(): void {
        setPreview(null);
        setSheetName('');
        setMapping({});
        setResult(null);
        setError('');
    }

    function changeType(nextType: ImportType): void {
        setType(nextType);
        setMatchBy(nextType === 'employees' ? 'phone' : 'name');
        setResult(null);
        setError('');

        if (selectedSheet) {
            setMapping(autoMapping(selectedSheet.headers, nextType));
        } else {
            setMapping({});
        }
    }

    function selectSheet(name: string, response = preview): void {
        const sheet = response?.sheets.find((item) => item.name === name) ?? null;
        setSheetName(name);
        setMapping(sheet ? autoMapping(sheet.headers, type) : {});
    }

    async function inspect(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        if (!file || busy) return;

        setBusy(true);
        setError('');
        setResult(null);

        try {
            const body = new FormData();
            body.set('file', file);
            const response = await apiRequest<PreviewResponse>('/api/staff-import/preview', {
                method: 'POST',
                body,
            });

            setPreview(response);
            const first = response.sheets[0];
            setSheetName(first?.name ?? '');
            setMapping(first ? autoMapping(first.headers, type) : {});
        } catch (failure) {
            setError(errorMessage(failure, ar ? 'تعذر قراءة الملف.' : 'Could not read this file.'));
        } finally {
            setBusy(false);
        }
    }

    async function commit(): Promise<void> {
        if (!preview || !selectedSheet || !mappedRequired || busy) return;

        setBusy(true);
        setError('');
        setResult(null);

        try {
            const response = await apiRequest<ImportResult>('/api/staff-import/commit', {
                method: 'POST',
                body: JSON.stringify({
                    token: preview.token,
                    sheet: selectedSheet.name,
                    type,
                    mapping,
                    match_by: matchBy,
                    duplicate_strategy: duplicateStrategy,
                    create_departments: createDepartments,
                }),
            });
            setResult(response);
        } catch (failure) {
            setError(errorMessage(failure, ar ? 'تعذر إكمال الاستيراد.' : 'Could not complete the import.'));
        } finally {
            setBusy(false);
        }
    }

    const cards: { id: ImportType; ar: string; en: string; helpAr: string; helpEn: string }[] = [
        {
            id: 'employees',
            ar: 'الموظفون',
            en: 'Employees',
            helpAr: 'الأسماء، الأقسام، الوظائف وشروط الراتب الأساسية.',
            helpEn: 'Names, departments, jobs and base pay terms.',
        },
        {
            id: 'attendance',
            ar: 'الحضور والدوام',
            en: 'Attendance',
            helpAr: 'الحضور، الغياب، الساعات والإضافي. النظام يحسب الراتب المستحق تلقائيًا.',
            helpEn: 'Attendance, absences, hours and overtime. AccoNova calculates salary entitlement automatically.',
        },
        {
            id: 'transactions',
            ar: 'الدفعات والحركات المالية',
            en: 'Payments & adjustments',
            helpAr: 'استيراد الدفعات والخصومات والمكافآت والبدلات والسلف القديمة فقط.',
            helpEn: 'Import historical payments, deductions, bonuses, allowances and advances only.',
        },
    ];

    const matchLabel = type === 'employees'
        ? (ar ? 'اكتشاف الموظف بواسطة' : 'Match employee by')
        : (ar ? 'مطابقة السجل بالموظف بواسطة' : 'Match record to employee by');

    return (
        <AppShell>
            <Head title={ar ? 'استيراد بيانات الموظفين' : 'Import employee data'} />
            <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
                <header className="rounded-[28px] border border-[var(--ac-line)] bg-gradient-to-br from-[var(--ac-surface)] via-[var(--ac-surface)] to-[var(--ac-accent-soft)] p-5 sm:p-7">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-4">
                            <span className="flex size-12 shrink-0 items-center justify-center rounded-[17px] bg-[var(--ac-text)] text-white">
                                <FileSpreadsheet size={22} />
                            </span>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ac-accent-strong)]">
                                    {ar ? 'مركز نقل البيانات' : 'Migration center'}
                                </p>
                                <h1 className="mt-1 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">
                                    {ar ? 'انقل الموظفين والحضور والدفعات القديمة' : 'Import employees, attendance and old payments'}
                                </h1>
                                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'الراتب المستحق نفسه لا يُرفع بملف؛ AccoNova يحسبه من الحضور وشروط الأجر. لكن يمكنك رفع الدفعات والخصومات والمكافآت والبدلات والسلف القديمة.'
                                        : 'Salary entitlement itself is never uploaded; AccoNova derives it from attendance and pay terms. Historical payments, deductions, bonuses, allowances and advances can be imported.'}
                                </p>
                            </div>
                        </div>
                        <Link href="/app/staff/directory" className={button}>
                            {ar ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
                            {ar ? 'العودة إلى الموظفين' : 'Back to employees'}
                        </Link>
                    </div>
                </header>

                <div className="mt-4"><StaffModuleNav /></div>

                <section className="mt-6 rounded-[20px] border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-[var(--ac-text)]">
                    <strong>{ar ? 'القاعدة:' : 'Rule:'}</strong>
                    <span className="ms-2">
                        {ar
                            ? 'الحضور → الراتب المستحق تلقائيًا. ملف الحركات المالية → فقط ما تم دفعه أو إضافته أو خصمه يدويًا.'
                            : 'Attendance → automatic salary entitlement. Financial transaction files → only manual payments/additions/deductions.'}
                    </span>
                </section>

                <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
                    <div className="space-y-5">
                        <section className={panel}>
                            <div className="mb-5 flex items-start gap-3">
                                <span className="flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]"><Database size={18} /></span>
                                <div>
                                    <h2 className="text-sm font-bold">{ar ? '1. اختر البيانات' : '1. Choose data'}</h2>
                                    <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                        {ar ? 'الموظفون أولًا، ثم الحضور، وبعدها الحركات المالية القديمة إن وجدت.' : 'Employees first, then attendance, then historical financial transactions if needed.'}
                                    </p>
                                </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-3">
                                {cards.map((card) => (
                                    <button
                                        type="button"
                                        key={card.id}
                                        onClick={() => changeType(card.id)}
                                        className={[
                                            'rounded-[17px] border p-4 text-start transition',
                                            type === card.id
                                                ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]'
                                                : 'border-[var(--ac-line)] bg-[var(--ac-surface)] hover:bg-[var(--ac-surface-soft)]',
                                        ].join(' ')}
                                    >
                                        <strong className="text-xs">{ar ? card.ar : card.en}</strong>
                                        <p className="mt-2 text-[10px] leading-5 text-[var(--ac-text-muted)]">{ar ? card.helpAr : card.helpEn}</p>
                                    </button>
                                ))}
                            </div>
                        </section>

                        {type === 'transactions' && (
                            <section className="rounded-[20px] border border-amber-500/20 bg-amber-500/10 p-4 text-xs leading-6 text-[var(--ac-text)]">
                                <div className="flex items-start gap-3">
                                    <WalletCards size={18} className="mt-0.5 shrink-0" />
                                    <div>
                                        <strong>{ar ? 'القيم المسموحة في نوع الحركة:' : 'Allowed transaction types:'}</strong>
                                        <p className="mt-1">
                                            {ar
                                                ? 'دفعة، خصم، مكافأة، بدل، سلفة. إذا وجد راتب / work / salary أو إضافي في الملف سيتم رفض ذلك الصف لأن النظام يحسبهم من الحضور.'
                                                : 'Payment, deduction, bonus, allowance, advance. Salary/work/overtime rows are rejected because AccoNova derives them from attendance.'}
                                        </p>
                                    </div>
                                </div>
                            </section>
                        )}

                        <section className={panel}>
                            <h2 className="text-sm font-bold">{ar ? '2. ارفع الملف' : '2. Upload file'}</h2>
                            <p className="mt-2 text-xs leading-6 text-[var(--ac-text-muted)]">
                                {ar ? 'XLSX أو XLS أو CSV حتى 20MB.' : 'XLSX, XLS or CSV up to 20MB.'}
                            </p>
                            <form onSubmit={(event) => void inspect(event)} className="mt-4">
                                <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-[18px] border border-dashed border-[var(--ac-line-strong)] bg-[var(--ac-surface-soft)] p-6 text-center transition hover:border-[var(--ac-accent)]">
                                    <UploadCloud size={30} className="text-[var(--ac-accent-strong)]" />
                                    <strong className="mt-3 text-xs">{file?.name ?? (ar ? 'اختر Excel أو CSV' : 'Choose Excel or CSV')}</strong>
                                    <span className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                        {ar ? 'أو استخدم رابط Google Sheets الموجود أعلى الصفحة.' : 'Or use the Google Sheets link control above this page.'}
                                    </span>
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls,.csv,.txt"
                                        className="hidden"
                                        onChange={(event) => {
                                            setFile(event.target.files?.[0] ?? null);
                                            resetPreview();
                                        }}
                                    />
                                </label>
                                <button disabled={!file || busy} className={`${primary} mt-4`}>
                                    <FileSpreadsheet size={14} />
                                    {busy ? (ar ? 'جاري القراءة…' : 'Reading…') : (ar ? 'قراءة ومعاينة' : 'Inspect file')}
                                </button>
                            </form>
                        </section>

                        {preview && (
                            <section className={panel}>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <h2 className="text-sm font-bold">{ar ? '3. اختر الورقة وطابق الأعمدة' : '3. Choose sheet and map columns'}</h2>
                                        <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">{preview.name}</p>
                                    </div>
                                    <select value={sheetName} onChange={(event) => selectSheet(event.target.value)} className={`${field} max-w-xs`}>
                                        {preview.sheets.map((sheet) => (
                                            <option key={sheet.name} value={sheet.name}>{sheet.name} · {sheet.row_count} {ar ? 'صف' : 'rows'}</option>
                                        ))}
                                    </select>
                                </div>

                                {selectedSheet && (
                                    <>
                                        <div className="mt-5 grid gap-3 md:grid-cols-2">
                                            {definitions[type].map((definition) => (
                                                <label key={definition.key} className="text-xs font-semibold">
                                                    {ar ? definition.ar : definition.en}
                                                    {definition.required && <span className="ms-1 text-red-500">*</span>}
                                                    <select
                                                        value={mapping[definition.key] ?? ''}
                                                        onChange={(event) => setMapping((current) => ({ ...current, [definition.key]: event.target.value }))}
                                                        className={`${field} mt-2`}
                                                    >
                                                        <option value="">{ar ? 'لا يوجد عمود' : 'Not mapped'}</option>
                                                        {selectedSheet.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                                                    </select>
                                                </label>
                                            ))}
                                        </div>

                                        <div className="mt-5 overflow-x-auto rounded-[16px] border border-[var(--ac-line)]">
                                            <table className="w-full min-w-[780px] text-xs">
                                                <thead className="bg-[var(--ac-surface-soft)] text-[10px] text-[var(--ac-text-muted)]">
                                                    <tr>{selectedSheet.headers.slice(0, 8).map((header) => <th key={header} className="px-3 py-2.5 text-start">{header}</th>)}</tr>
                                                </thead>
                                                <tbody className="divide-y divide-[var(--ac-line)]">
                                                    {selectedSheet.sample.map((row, index) => (
                                                        <tr key={index}>
                                                            {selectedSheet.headers.slice(0, 8).map((header) => (
                                                                <td key={header} className="max-w-48 truncate px-3 py-2.5">{String(row[header] ?? '')}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </section>
                        )}

                        {preview && selectedSheet && (
                            <section className={panel}>
                                <h2 className="text-sm font-bold">{ar ? '4. المطابقة والتكرار' : '4. Matching & duplicates'}</h2>
                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                    <label className="text-xs font-semibold">
                                        {matchLabel}
                                        <select value={matchBy} onChange={(event) => setMatchBy(event.target.value as 'name' | 'phone' | 'email')} className={`${field} mt-2`}>
                                            <option value="phone">{ar ? 'رقم الهاتف' : 'Phone'}</option>
                                            <option value="email">{ar ? 'البريد الإلكتروني' : 'Email'}</option>
                                            <option value="name">{ar ? 'الاسم' : 'Name'}</option>
                                        </select>
                                    </label>

                                    {type !== 'transactions' ? (
                                        <label className="text-xs font-semibold">
                                            {ar ? 'إذا وجد سجل مكرر' : 'When duplicate exists'}
                                            <select value={duplicateStrategy} onChange={(event) => setDuplicateStrategy(event.target.value as 'skip' | 'update')} className={`${field} mt-2`}>
                                                <option value="skip">{ar ? 'تخطيه بدون تغيير' : 'Skip'}</option>
                                                <option value="update">{ar ? 'تحديث الموجود' : 'Update existing'}</option>
                                            </select>
                                        </label>
                                    ) : (
                                        <div className="rounded-[15px] bg-[var(--ac-surface-soft)] p-4 text-xs leading-5 text-[var(--ac-text-muted)]">
                                            {ar
                                                ? 'الحركة المطابقة تمامًا لنفس الموظف والنوع والتاريخ والمبلغ والبيان يتم تخطيها تلقائيًا حتى لا تتكرر الدفعة.'
                                                : 'An identical transaction for the same employee, type, date, amount and note is skipped automatically to prevent duplicate payments.'}
                                        </div>
                                    )}
                                </div>

                                {type === 'employees' && (
                                    <label className="mt-4 flex items-center gap-3 rounded-[15px] bg-[var(--ac-surface-soft)] p-4 text-xs">
                                        <input type="checkbox" checked={createDepartments} onChange={(event) => setCreateDepartments(event.target.checked)} />
                                        <span><strong className="block">{ar ? 'إنشاء الأقسام غير الموجودة تلقائيًا' : 'Create missing departments automatically'}</strong></span>
                                    </label>
                                )}

                                <button type="button" disabled={busy || !mappedRequired} onClick={() => void commit()} className={`${primary} mt-5`}>
                                    <CheckCircle2 size={14} />
                                    {busy ? (ar ? 'جاري الاستيراد…' : 'Importing…') : (ar ? `استيراد ${selectedSheet.row_count} صف` : `Import ${selectedSheet.row_count} rows`)}
                                </button>
                                {!mappedRequired && <p className="mt-2 text-[10px] text-red-600">{ar ? 'طابق جميع الحقول المطلوبة أولًا.' : 'Map all required fields first.'}</p>}
                            </section>
                        )}

                        {error && <div role="alert" className="rounded-[18px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

                        {result && (
                            <section className={panel}>
                                <div className="flex items-start gap-3">
                                    <span className="flex size-11 items-center justify-center rounded-[15px] bg-emerald-50 text-emerald-600"><CheckCircle2 size={20} /></span>
                                    <div className="flex-1">
                                        <h2 className="text-sm font-bold">{ar ? 'اكتمل الاستيراد' : 'Import completed'}</h2>
                                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                            <div className="rounded-[14px] bg-emerald-50 p-3"><p className="text-[10px] text-emerald-700">{ar ? 'تمت الإضافة' : 'Created'}</p><strong className="mt-1 block text-lg text-emerald-800">{result.created}</strong></div>
                                            <div className="rounded-[14px] bg-blue-50 p-3"><p className="text-[10px] text-blue-700">{ar ? 'تم التحديث' : 'Updated'}</p><strong className="mt-1 block text-lg text-blue-800">{result.updated}</strong></div>
                                            <div className="rounded-[14px] bg-amber-50 p-3"><p className="text-[10px] text-amber-700">{ar ? 'تم التخطي' : 'Skipped'}</p><strong className="mt-1 block text-lg text-amber-800">{result.skipped}</strong></div>
                                        </div>
                                        {result.errors.length > 0 && (
                                            <div className="mt-4 max-h-64 overflow-y-auto rounded-[15px] border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-800">
                                                {result.errors.map((item, index) => <p key={index}>{ar ? `الصف ${item.row}: ` : `Row ${item.row}: `}{item.message}</p>)}
                                            </div>
                                        )}
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <Link href="/app/staff/directory" className={primary}><UsersRound size={14} />{ar ? 'عرض الموظفين' : 'View employees'}</Link>
                                            <button type="button" className={button} onClick={() => { setFile(null); resetPreview(); }}><RefreshCcw size={14} />{ar ? 'استيراد ملف آخر' : 'Import another file'}</button>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>

                    <aside className="space-y-5">
                        <section className={panel}>
                            <div className="flex items-start gap-3">
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-emerald-50 text-emerald-600"><ShieldCheck size={18} /></span>
                                <div>
                                    <h2 className="text-sm font-bold">{ar ? 'المستحقات تُحسب تلقائيًا' : 'Entitlements are automatic'}</h2>
                                    <p className="mt-2 text-[10px] leading-6 text-[var(--ac-text-muted)]">
                                        {ar
                                            ? 'الحضور ينشئ استحقاق الراتب والإضافي تلقائيًا حسب نوع أجر الموظف. لذلك لا نسمح برفع salary/work أو overtime من ملف الحركات المالية.'
                                            : 'Attendance creates salary and overtime entitlement automatically according to the employee pay basis, so salary/work and overtime cannot be imported as manual transactions.'}
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section className={panel}>
                            <h2 className="text-sm font-bold">{ar ? 'شو ممكن ترفع؟' : 'What can you import?'}</h2>
                            <p className="mt-2 text-xs leading-6 text-[var(--ac-text-muted)]">
                                {ar ? 'دفعات رواتب قديمة، خصومات، مكافآت، بدلات وسلف. كل هذه تدخل في كشف حساب الموظف وتؤثر على الرصيد.' : 'Historical salary payments, deductions, bonuses, allowances and advances. These post to the employee ledger and affect the balance.'}
                            </p>
                        </section>

                        <section className={panel}>
                            <h2 className="text-sm font-bold">{ar ? 'ترتيب النقل المقترح' : 'Recommended migration order'}</h2>
                            <div className="mt-4 space-y-3 text-xs">
                                {[
                                    ar ? '1. الموظفون والأقسام' : '1. Employees & departments',
                                    ar ? '2. الحضور والدوام' : '2. Attendance',
                                    ar ? '3. الدفعات والحركات المالية القديمة' : '3. Historical payments & adjustments',
                                ].map((item) => (
                                    <div key={item} className="rounded-[14px] bg-[var(--ac-surface-soft)] p-3">{item}</div>
                                ))}
                            </div>
                        </section>
                    </aside>
                </div>
            </main>
        </AppShell>
    );
}
