import { AppShell } from '@/layouts/AppShell';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { apiErrorText } from '@/pages/Finance/shared';
import type { FinanceLookups } from '@/pages/Finance/types';
import { Head } from '@inertiajs/react';
import {
    CalendarDays,
    ChevronDown,
    Copy,
    Layers,
    MapPin,
    Play,
    Plus,
    Save,
    X,
    Zap,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type RowType = 'sale' | 'purchase' | 'misc' | 'receipt' | 'payment' | 'petty' | 'prod' | 'staff' | 'attendance';
type Method = 'cash' | 'transfer' | 'check';

type Line = { key: number; productId: number | null; qty: string; price: string };

type Row = {
    id: number;
    type: RowType;
    date: string;
    partyId: number | null;
    ref: string;
    amt: string;
    cat: string;
    staffKind: string;
    productId: number | null;
    notes: string;
    lines: Line[];
    disc: string;
    pay: string;
    full: boolean;
    method: Method;
    chequeId: number | null;
    checkNo: string;
    checkDue: string;
    open: boolean;
    error: string;
    merged: boolean;
};

type Cheque = {
    id: number;
    number: string;
    amount: string;
    currency: string;
    check_number: string | null;
    check_due_date: string | null;
    party_name: string | null;
};

type StaffMember = { id: number; name: string };

type Progress = Record<RowType, { last: string | null; ref: string | null; days: Record<string, number> }>;

type SaveResult = {
    index: number;
    ok: boolean;
    message?: string;
    document_number?: string;
    movement_number?: string;
    merged?: boolean;
};

const TYPES: RowType[] = ['sale', 'purchase', 'misc', 'receipt', 'payment', 'petty', 'prod', 'staff', 'attendance'];

const META: Record<RowType, { ar: string; en: string; color: string; invoice: boolean; pay: boolean; party: 'c' | 's' | null }> = {
    sale: { ar: 'فاتورة بيع', en: 'Sales invoice', color: '#0b8a5a', invoice: true, pay: true, party: 'c' },
    purchase: { ar: 'فاتورة شراء', en: 'Purchase invoice', color: '#1565d8', invoice: true, pay: true, party: 's' },
    misc: { ar: 'متفرقات', en: 'Walk-in sale', color: '#9a6200', invoice: true, pay: false, party: null },
    receipt: { ar: 'قبض', en: 'Receipt', color: '#0b8a5a', invoice: false, pay: true, party: 'c' },
    payment: { ar: 'دفع', en: 'Payment', color: '#1565d8', invoice: false, pay: true, party: 's' },
    petty: { ar: 'نثريات', en: 'Petty expenses', color: '#6a4fd6', invoice: false, pay: false, party: null },
    prod: { ar: 'إنتاج', en: 'Production', color: '#c2570c', invoice: false, pay: false, party: null },
    staff: { ar: 'موظفين', en: 'Staff', color: '#0e7490', invoice: false, pay: false, party: null },
    attendance: { ar: 'حضور وغياب', en: 'Attendance', color: '#be185d', invoice: false, pay: false, party: null },
};

const CATEGORIES: Array<[string, string, string]> = [
    ['operating_expense', 'مصاريف تشغيل', 'Operating expense'],
    ['utilities', 'كهرباء ومياه', 'Utilities'],
    ['maintenance', 'صيانة', 'Maintenance'],
    ['shipping_customs', 'شحن وجمارك', 'Shipping & customs'],
    ['rent', 'إيجار', 'Rent'],
    ['asset_purchase', 'شراء أصل', 'Asset purchase'],
    ['other', 'أخرى', 'Other'],
];

const STAFF_KINDS: Array<[string, string, string]> = [
    ['advance', 'سلفة', 'Advance'],
    ['deduction', 'خصم', 'Deduction'],
    ['bonus', 'مكافأة', 'Bonus'],
    ['allowance', 'بدل', 'Allowance'],
    ['payment', 'دفعة راتب', 'Payment'],
];

const MONTHS_AR = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const field = 'h-9 w-full rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2.5 text-sm text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]';
const btnSecondary = 'inline-flex min-h-9 items-center gap-1.5 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs font-bold text-[var(--ac-accent)] hover:bg-[var(--ac-surface-soft,transparent)] disabled:opacity-50';
const btnPrimary = 'inline-flex min-h-10 items-center gap-2 rounded-[12px] bg-[var(--ac-accent)] px-4 text-sm font-bold text-white disabled:opacity-50';
const card = 'rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4';

const pad = (n: number): string => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;
const todayIso = (): string => {
    const now = new Date();

    return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
};
const addDays = (value: string, n: number): string => {
    const date = new Date(value + 'T00:00:00');
    date.setDate(date.getDate() + n);

    return iso(date.getFullYear(), date.getMonth() + 1, date.getDate());
};
const dayDiff = (a: string, b: string): number =>
    Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
const weekday = (value: string): number => new Date(value + 'T00:00:00').getDay();
const num = (value: string | number): number => Number(String(value).replace(/,/g, '')) || 0;
const money = (value: number): string => value.toLocaleString('en', { maximumFractionDigits: 2 });
const validDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '2000-01-01' && ! Number.isNaN(new Date(value + 'T00:00:00').getTime());

let nextId = 1;
let nextKey = 1;

const newLine = (): Line => ({ key: nextKey++, productId: null, qty: '', price: '' });

const newRow = (type: RowType, date: string): Row => ({
    id: nextId++,
    type,
    date,
    partyId: null,
    ref: '',
    amt: '',
    cat: 'operating_expense',
    staffKind: type === 'attendance' ? 'present' : 'advance',
    productId: null,
    notes: '',
    lines: META[type].invoice ? [newLine()] : [],
    disc: '',
    pay: '',
    full: false,
    method: 'cash',
    chequeId: null,
    checkNo: '',
    checkDue: '',
    open: false,
    error: '',
    merged: false,
});

export default function QuickEntry() {
    const ar = useLocale() === 'ar';
    const text = (arabic: string, english: string): string => ar ? arabic : english;
    const months = ar ? MONTHS_AR : MONTHS_EN;
    const today = todayIso();
    const year = Number(today.slice(0, 4));

    const [lookups, setLookups] = useState<FinanceLookups | null>(null);
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [attendanceStaff, setAttendanceStaff] = useState<StaffMember[]>([]);
    const [cheques, setCheques] = useState<Cheque[]>([]);
    const [progress, setProgress] = useState<Progress | null>(null);
    const [from, setFrom] = useState(`${year}-01-01`);
    const [weekend, setWeekend] = useState<'5' | '5,6' | ''>('5');

    const [rows, setRows] = useState<Row[]>([]);
    const [filter, setFilter] = useState<'all' | RowType>('all');
    const [selected, setSelected] = useState<string[]>([]);
    const [anchor, setAnchor] = useState<string | null>(null);
    const [counts, setCounts] = useState<Record<RowType, number>>({ sale: 0, purchase: 0, misc: 0, receipt: 0, payment: 0, petty: 0, prod: 0, staff: 0, attendance: 0 });
    const [month, setMonth] = useState(Number(today.slice(5, 7)));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const container = useRef<HTMLDivElement>(null);
    const pendingFocus = useRef<number | null>(null);

    useEffect(() => {
        apiRequest<FinanceLookups>('/api/finance/lookups')
            .then(setLookups)
            .catch((failure) => setError(apiErrorText(failure)));

        apiRequest<{ data: Cheque[] }>('/api/finance/cash-movements/cheques-on-hand')
            .then((response) => setCheques(response.data))
            .catch(() => setCheques([]));

        (async () => {
            const members: StaffMember[] = [];

            try {
                for (let page = 1; page <= 10; page++) {
                    const response = await apiRequest<{ data: StaffMember[]; pagination: { last_page: number } }>(
                        `/api/staff-transactions/bulk?per_page=100&page=${page}`,
                    );

                    members.push(...response.data);

                    if (page >= response.pagination.last_page) {
                        break;
                    }
                }
            } catch {
                // No payroll access: the staff rows simply have no employees to pick.
            }

            setStaff(members);

            const present: StaffMember[] = [];

            try {
                for (let page = 1; page <= 10; page++) {
                    const response = await apiRequest<{ data: StaffMember[]; pagination: { last_page: number } }>(
                        `/api/staff-attendance/bulk?per_page=100&page=${page}`,
                    );

                    present.push(...response.data);

                    if (page >= response.pagination.last_page) {
                        break;
                    }
                }
            } catch {
                // No attendance access: this type stays hidden.
            }

            setAttendanceStaff(present);
        })();
    }, []);

    const loadProgress = useCallback(() => {
        apiRequest<{ data: Progress }>(`/api/quick-entry/progress?from=${from}`)
            .then((response) => setProgress(response.data))
            .catch(() => setProgress(null));
    }, [from]);

    useEffect(() => {
        loadProgress();
    }, [loadProgress]);

    const perms = lookups?.permissions;
    const allowed = useMemo<Record<RowType, boolean>>(() => ({
        sale: !! perms?.sales_manage,
        purchase: !! perms?.purchases_manage,
        misc: !! perms?.sales_manage && !! perms?.cash_receive,
        receipt: !! perms?.cash_receive,
        payment: !! perms?.cash_pay,
        petty: !! perms?.cash_pay,
        prod: true,
        staff: staff.length > 0,
        attendance: attendanceStaff.length > 0,
    }), [perms, staff, attendanceStaff]);

    const visibleTypes = TYPES.filter((type) => ! lookups || allowed[type]);
    const customers = useMemo(() => (lookups?.parties ?? []).filter((party) => party.roles.includes('customer')), [lookups]);
    const suppliers = useMemo(() => (lookups?.parties ?? []).filter((party) => party.roles.includes('supplier')), [lookups]);
    const products = lookups?.products ?? [];
    const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
    const typeName = (type: RowType): string => ar ? META[type].ar : META[type].en;
    const isWeekend = (value: string): boolean => weekend.split(',').filter(Boolean).includes(String(weekday(value)));

    /* ---------- calculations ---------- */
    const lineTotal = (line: Line): number => num(line.qty) * num(line.price);
    const discountOf = (row: Row, subtotal: number): number => {
        const value = row.disc.trim();

        if (! value) {
            return 0;
        }

        return value.endsWith('%') ? subtotal * num(value.slice(0, -1)) / 100 : num(value);
    };
    const totals = (row: Row) => {
        const subtotal = row.lines.reduce((sum, line) => sum + lineTotal(line), 0);
        const discount = discountOf(row, subtotal);

        return { subtotal, discount, total: Math.max(subtotal - discount, 0) };
    };
    const payOf = (row: Row): number => {
        if (! META[row.type].pay) {
            return 0;
        }

        return META[row.type].invoice ? (row.full ? totals(row).total : num(row.pay)) : num(row.amt);
    };
    const completeLine = (line: Line): boolean => !! line.productId && num(line.qty) > 0 && line.price !== '' && num(line.price) >= 0;

    const problems = (row: Row): string[] => {
        const meta = META[row.type];
        const found: string[] = [];

        if (! validDate(row.date) || row.date > today) {
            found.push(text('التاريخ', 'Date'));
        }

        if (meta.party && ! row.partyId) {
            found.push(text('الطرف', 'Party'));
        }

        if ((row.type === 'staff' || row.type === 'attendance') && ! row.partyId) {
            found.push(text('الموظف', 'Employee'));
        }

        if (row.type === 'prod' && ! row.productId) {
            found.push(text('المنتج', 'Product'));
        }

        if (meta.invoice) {
            if (! row.lines.some(completeLine)) {
                found.push(text('بند كامل', 'A complete line'));
            }
        } else if (row.type !== 'attendance' && num(row.amt) <= 0) {
            found.push(row.type === 'prod' ? text('الكمية', 'Quantity') : text('المبلغ', 'Amount'));
        }

        if (meta.pay && payOf(row) > 0 && row.method === 'check' && ! row.chequeId && (! row.checkNo || ! validDate(row.checkDue))) {
            found.push(text('بيانات الشيك', 'Check details'));
        }

        return found;
    };
    const isReady = (row: Row): boolean => problems(row).length === 0;

    /* ---------- row operations ---------- */
    const patch = (id: number, changes: Partial<Row>) =>
        setRows((current) => current.map((row) => (row.id === id ? { ...row, ...changes, error: '' } : row)));

    const patchLine = (rowId: number, key: number, changes: Partial<Line>) =>
        setRows((current) => current.map((row) => (row.id === rowId
            ? { ...row, error: '', lines: row.lines.map((line) => (line.key === key ? { ...line, ...changes } : line)) }
            : row)));

    const remove = (id: number) => setRows((current) => current.filter((row) => row.id !== id));

    const sortedRows = useMemo(
        () => [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || a.id - b.id)),
        [rows],
    );

    const addRowAt = (date: string, type: RowType, after?: Row) => {
        const created = newRow(type, date);

        pendingFocus.current = created.id;
        setRows((current) => {
            if (! after) {
                return [...current, created];
            }

            const index = current.findIndex((row) => row.id === after.id);

            return [...current.slice(0, index + 1), created, ...current.slice(index + 1)];
        });
    };

    const chooseProduct = async (row: Row, line: Line, productId: number | null) => {
        patchLine(row.id, line.key, { productId });
        const product = productId ? productById.get(productId) : null;

        if (! product || line.price !== '') {
            return;
        }

        let price = row.type === 'purchase' ? product.cost_price ?? product.unit_price : product.unit_price;

        if (row.partyId && (row.type === 'sale' || row.type === 'purchase')) {
            try {
                const response = await apiRequest<{ unit_price: string }>(
                    `/api/finance/reference-price?party_id=${row.partyId}&product_id=${product.id}&kind=${row.type === 'sale' ? 'sale_invoice' : 'purchase_invoice'}`,
                );
                price = response.unit_price ?? price;
            } catch {
                // Keep the catalog price when no reference price exists.
            }
        }

        patchLine(row.id, line.key, { productId, price: String(Number(price) || 0) });
    };

    const makeLines = (row: Row, value: string) => {
        const wanted = Math.min(Math.max(Math.trunc(Number(value)) || 1, 1), 250);

        setRows((current) => current.map((candidate) => {
            if (candidate.id !== row.id) {
                return candidate;
            }

            const lines = [...candidate.lines];

            while (lines.length < wanted) {
                lines.push(newLine());
            }

            while (lines.length > wanted && ! lines[lines.length - 1].productId && ! lines[lines.length - 1].qty) {
                lines.pop();
            }

            return { ...candidate, lines };
        }));
    };

    const chooseCheque = (row: Row, value: string) => {
        const cheque = cheques.find((candidate) => String(candidate.id) === value);

        if (! cheque) {
            patch(row.id, { chequeId: null, checkNo: '', checkDue: '' });

            return;
        }

        patch(row.id, {
            chequeId: cheque.id,
            checkNo: cheque.check_number ?? '',
            checkDue: cheque.check_due_date ?? '',
            full: false,
            pay: String(Number(cheque.amount)),
            ...(META[row.type].invoice ? {} : { amt: String(Number(cheque.amount)) }),
        });
    };

    const duplicateDay = (date: string) => {
        const target = window.prompt(text('انسخ صفوف هذا اليوم إلى تاريخ (YYYY-MM-DD):', 'Copy this day to date (YYYY-MM-DD):'), addDays(date, 1));

        if (! target || ! validDate(target) || target > today) {
            return;
        }

        setRows((current) => [
            ...current,
            ...current.filter((row) => row.date === date).map((row) => ({
                ...row,
                id: nextId++,
                date: target,
                error: '',
                merged: false,
                lines: row.lines.map((line) => ({ ...line, key: nextKey++ })),
            })),
        ]);
        setSelected((current) => (current.includes(target) ? current : [...current, target]));
    };

    /* ---------- days ---------- */
    const activeDays = useMemo(() => {
        const union: Record<string, number> = {};

        (filter === 'all' ? visibleTypes : [filter]).forEach((type) => {
            Object.entries(progress?.[type]?.days ?? {}).forEach(([day, count]) => {
                union[day] = (union[day] ?? 0) + count;
            });
        });

        return union;
    }, [progress, filter, visibleTypes]);

    const activeLast = useMemo(() => {
        const days = Object.keys(activeDays).sort();

        return days[days.length - 1] ?? from;
    }, [activeDays, from]);

    const addSelected = (days: string[]) => {
        setSelected((current) => [...new Set([...current, ...days])]);
        setRows((current) => {
            const have = new Set(current.map((row) => row.date));
            const type: RowType = filter === 'all' ? (visibleTypes[0] ?? 'sale') : filter;
            const extra = days.filter((day) => ! have.has(day)).flatMap((day) => [newRow(type, day), newRow(type, day)]);

            return extra.length ? [...current, ...extra] : current;
        });
    };

    const toggleDay = (day: string, shift: boolean) => {
        if (shift && anchor) {
            const [a, b] = anchor < day ? [anchor, day] : [day, anchor];
            const range: string[] = [];

            for (let cursor = a; cursor <= b; cursor = addDays(cursor, 1)) {
                if (cursor <= today && ! isWeekend(cursor)) {
                    range.push(cursor);
                }
            }

            addSelected(range);
        } else if (selected.includes(day)) {
            if (! rows.some((row) => row.date === day)) {
                setSelected((current) => current.filter((value) => value !== day));
            }
        } else {
            addSelected([day]);
        }

        setAnchor(day);
    };

    const pickGaps = () => {
        const dim = new Date(year, month, 0).getDate();
        const gaps: string[] = [];

        for (let d = 1; d <= dim; d++) {
            const day = iso(year, month, d);

            if (day >= from && day <= today && ! isWeekend(day) && ! activeDays[day]) {
                gaps.push(day);
            }
        }

        addSelected(gaps);
    };

    const continueFrom = (type: RowType) => {
        const last = progress?.[type]?.last ?? from;

        setMonth(Number(last.slice(5, 7)));
        setFilter(type);
        setSelected((current) => [...new Set([...current, last])]);
        setRows((current) => (current.some((row) => row.date === last) ? current : [...current, newRow(type, last), newRow(type, last)]));
        setNotice(text(`أضفت ${last} (آخر إدخال في «${typeName(type)}»). حدد عدد الصفوف وأنشئها.`, `Added ${last} (last ${typeName(type)} entry). Set the row counts and create them.`));
    };

    const createRows = () => {
        const days = [...selected].sort();

        if (! days.length) {
            return;
        }

        const created: Row[] = [];

        days.forEach((day) => visibleTypes.forEach((type) => {
            for (let i = 0; i < counts[type]; i++) {
                created.push(newRow(type, day));
            }
        }));

        setRows((current) => [...current.filter((row) => ! (created.length && isUntouched(row))), ...created]);
        setNotice(text(`أنشأت ${created.length} صفاً على ${days.length} يوم`, `Created ${created.length} rows over ${days.length} days`));
    };

    const isUntouched = (row: Row): boolean =>
        ! row.partyId && ! row.amt && ! row.ref && ! row.notes && ! row.productId
        && row.lines.every((line) => ! line.productId && ! line.qty && ! line.price) && ! row.pay && ! row.disc;

    /* ---------- save ---------- */
    const requestRow = (row: Row) => {
        const base = { type: row.type, date: row.date, reference: row.ref || null };

        if (row.type === 'petty') {
            return { ...base, category: row.cat, amount: num(row.amt), notes: row.notes || null };
        }

        if (row.type === 'prod') {
            return { ...base, product_id: row.productId, quantity: num(row.amt) };
        }

        if (row.type === 'staff') {
            return { ...base, staff_id: row.partyId, staff_kind: row.staffKind, amount: num(row.amt), notes: row.notes || null };
        }

        if (row.type === 'attendance') {
            return { ...base, staff_id: row.partyId, attendance_status: row.staffKind, quantity: num(row.amt) || undefined, notes: row.notes || null };
        }

        const payment = META[row.type].pay
            ? {
                amount: META[row.type].invoice && row.full ? undefined : payOf(row),
                full: META[row.type].invoice && row.full ? true : undefined,
                method: row.method,
                endorsed_movement_id: row.method === 'check' && row.chequeId ? row.chequeId : undefined,
                check_number: row.method === 'check' && ! row.chequeId ? row.checkNo : undefined,
                check_due_date: row.method === 'check' && ! row.chequeId ? row.checkDue : undefined,
            }
            : undefined;

        if (! META[row.type].invoice) {
            return { ...base, party_id: row.partyId, payment };
        }

        const percent = row.disc.trim().endsWith('%');

        return {
            ...base,
            party_id: row.type === 'misc' ? null : row.partyId,
            lines: row.lines.filter(completeLine).map((line) => ({ product_id: line.productId, quantity: num(line.qty), unit_price: num(line.price) })),
            discount_type: percent ? 'percent' : 'fixed',
            discount_value: percent ? num(row.disc.trim().slice(0, -1)) : num(row.disc),
            payment: row.type === 'misc' ? undefined : (payOf(row) > 0 ? payment : undefined),
        };
    };

    const save = async () => {
        const ready = sortedRows.filter(isReady);

        if (! ready.length) {
            return;
        }

        setSaving(true);
        setError('');
        setNotice('');

        try {
            const failed = new Map<number, string>();
            const saved = new Set<number>();
            let merged = 0;

            for (let start = 0; start < ready.length; start += 100) {
                const chunk = ready.slice(start, start + 100);
                const response = await apiRequest<{ data: SaveResult[] }>('/api/quick-entry', {
                    method: 'POST',
                    body: JSON.stringify({ rows: chunk.map(requestRow) }),
                });

                response.data.forEach((result) => {
                    const row = chunk[result.index];

                    if (result.ok) {
                        saved.add(row.id);
                        merged += result.merged ? 1 : 0;
                    } else {
                        failed.set(row.id, result.message ?? text('تعذّر الحفظ', 'Could not save'));
                    }
                });
            }

            setRows((current) => current
                .filter((row) => ! saved.has(row.id))
                .map((row) => (failed.has(row.id) ? { ...row, error: failed.get(row.id) ?? '', open: true } : row)));
            setSelected((current) => current.filter((day) => rows.some((row) => row.date === day && ! saved.has(row.id))));
            setCheques([]);
            apiRequest<{ data: Cheque[] }>('/api/finance/cash-movements/cheques-on-hand').then((response) => setCheques(response.data)).catch(() => undefined);
            loadProgress();
            setNotice(text(
                `تم حفظ ${saved.size} صف${merged ? ` (منها ${merged} ضُمّت لفاتورة اليوم)` : ''}${failed.size ? `، وتعذّر ${failed.size} (انظر الصفوف الحمراء)` : ''}.`,
                `Saved ${saved.size} row(s)${merged ? ` (${merged} merged into the day's invoice)` : ''}${failed.size ? `, ${failed.size} failed (see the red rows)` : ''}.`,
            ));
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        const id = pendingFocus.current;

        if (id === null) {
            return;
        }

        pendingFocus.current = null;
        container.current?.querySelector<HTMLElement>(`[data-row="${id}"][data-main]`)?.focus();
    });

    const onEnter = (event: React.KeyboardEvent, row: Row, last: boolean) => {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();

        if (last) {
            addRowAt(row.date, row.type, row);

            return;
        }

        const inputs = Array.from(container.current?.querySelectorAll<HTMLElement>('[data-main]') ?? []);
        inputs[inputs.indexOf(event.target as HTMLElement) + 1]?.focus();
    };

    /* ---------- derived ---------- */
    const filteredRows = sortedRows.filter((row) => filter === 'all' || row.type === filter);
    const dates = [...new Set(filteredRows.map((row) => row.date))];
    const readyCount = rows.filter(isReady).length;
    const matrixTotal = visibleTypes.reduce((sum, type) => sum + counts[type], 0) * selected.length;
    const duplicates = (row: Row): boolean =>
        (row.type === 'sale' || row.type === 'purchase') && !! row.partyId
        && rows.some((other) => other.id < row.id && other.type === row.type && other.partyId === row.partyId && other.date === row.date);

    /* ---------- render ---------- */
    function partySelect(row: Row) {
        const meta = META[row.type];

        if (meta.party) {
            return (
                <select data-main data-row={row.id} className={field} value={row.partyId ?? ''} onChange={(event) => patch(row.id, { partyId: event.target.value ? Number(event.target.value) : null })}>
                    <option value="">{meta.party === 'c' ? text('اسم العميل', 'Customer') : text('اسم المورد', 'Supplier')}</option>
                    {(meta.party === 'c' ? customers : suppliers).map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
                </select>
            );
        }

        if (row.type === 'misc') {
            return <span className="text-xs text-[var(--ac-text-muted)]">{text('عميل متفرقات (نقداً)', 'Walk-in customer (cash)')}</span>;
        }

        if (row.type === 'petty') {
            return (
                <select data-main data-row={row.id} className={field} value={row.cat} onChange={(event) => patch(row.id, { cat: event.target.value })}>
                    {CATEGORIES.map(([value, arabic, english]) => <option key={value} value={value}>{text(arabic, english)}</option>)}
                </select>
            );
        }

        if (row.type === 'prod') {
            return (
                <select data-main data-row={row.id} className={field} value={row.productId ?? ''} onChange={(event) => patch(row.id, { productId: event.target.value ? Number(event.target.value) : null })}>
                    <option value="">{text('المنتج النهائي', 'Finished product')}</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
            );
        }

        const roster = row.type === 'attendance' ? attendanceStaff : staff;

        return (
            <select data-main data-row={row.id} className={field} value={row.partyId ?? ''} onChange={(event) => patch(row.id, { partyId: event.target.value ? Number(event.target.value) : null })}>
                <option value="">{text('الموظف', 'Employee')}</option>
                {roster.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
        );
    }

    function paymentBox(row: Row) {
        const meta = META[row.type];
        const dueCheques = cheques.filter((cheque) => (cheque.check_due_date ?? '') >= row.date);

        return (
            <div className="rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3">
                <h4 className="mb-2 text-xs font-bold text-[var(--ac-text-muted)]">
                    {meta.invoice ? text('الخصم والدفعة (الدفعة اختيارية)', 'Discount and payment (optional)') : text('الدفعة', 'Payment')}
                </h4>
                <div className="grid grid-cols-2 gap-2.5">
                    {meta.invoice && (
                        <label className="text-[11px] font-bold text-[var(--ac-text-muted)]">
                            {text('الخصم (5% أو مبلغ)', 'Discount (5% or amount)')}
                            <input className={field + ' mt-1 text-left'} dir="ltr" value={row.disc} placeholder="0" onChange={(event) => patch(row.id, { disc: event.target.value })} />
                        </label>
                    )}
                    {meta.invoice && (
                        <label className="text-[11px] font-bold text-[var(--ac-text-muted)]">
                            {text('مبلغ الدفعة', 'Payment amount')}
                            <div className="mt-1 flex gap-1.5">
                                <input
                                    className={field + ' text-left'}
                                    dir="ltr"
                                    disabled={row.full}
                                    placeholder={text('بدون دفعة', 'No payment')}
                                    value={row.full ? money(totals(row).total) : row.pay}
                                    onChange={(event) => patch(row.id, { pay: event.target.value, full: false })}
                                />
                                <button type="button" className={'shrink-0 rounded-[10px] border px-2.5 text-xs font-bold ' + (row.full ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--ac-line)] text-[var(--ac-accent)]')} onClick={() => patch(row.id, { full: ! row.full, pay: '' })}>
                                    {text('كامل', 'Full')}
                                </button>
                            </div>
                        </label>
                    )}
                    <label className="text-[11px] font-bold text-[var(--ac-text-muted)]">
                        {text('الطريقة', 'Method')}
                        <select className={field + ' mt-1'} value={row.method} onChange={(event) => patch(row.id, { method: event.target.value as Method, chequeId: null })}>
                            <option value="cash">{text('نقدي', 'Cash')}</option>
                            <option value="check">{text('شيك', 'Check')}</option>
                            <option value="transfer">{text('تحويل', 'Transfer')}</option>
                        </select>
                    </label>
                    {row.method === 'check' && meta.party === 's' && (
                        <label className="col-span-2 text-[11px] font-bold text-[var(--ac-text-muted)]">
                            {text('شيك من شيكاتي (تجيير)', 'Check on hand (endorse)')}
                            <select className={field + ' mt-1'} value={row.chequeId ?? ''} onChange={(event) => chooseCheque(row, event.target.value)}>
                                <option value="">{text('شيك جديد (أكتب بياناته)', 'New check (enter details)')}</option>
                                {dueCheques.map((cheque) => (
                                    <option key={cheque.id} value={cheque.id}>
                                        {(cheque.check_number || cheque.number) + ' — ' + (cheque.party_name ?? '') + ' — ' + text('يستحق ', 'due ') + (cheque.check_due_date ?? '') + ' — ' + money(Number(cheque.amount))}
                                    </option>
                                ))}
                            </select>
                            <span className="mt-1 block text-[10px] font-normal">
                                {dueCheques.length
                                    ? text('شيكات استلمتها من زبائن وتستحق بعد تاريخ المستند. يُدفع مبلغ الشيك كاملاً.', 'Checks received from customers due after the document date. The full check amount is paid.')
                                    : text('لا شيكات عندك تستحق بعد هذا التاريخ.', 'No checks on hand fall due after this date.')}
                            </span>
                        </label>
                    )}
                    {row.method === 'check' && ! row.chequeId && (
                        <>
                            <label className="text-[11px] font-bold text-[var(--ac-text-muted)]">
                                {text('رقم الشيك', 'Check number')}
                                <input className={field + ' mt-1 text-left'} dir="ltr" value={row.checkNo} onChange={(event) => patch(row.id, { checkNo: event.target.value })} />
                            </label>
                            <label className="text-[11px] font-bold text-[var(--ac-text-muted)]">
                                {text('تاريخ الاستحقاق', 'Due date')}
                                <input type="date" className={field + ' mt-1'} dir="ltr" min="2000-01-01" value={row.checkDue} onChange={(event) => patch(row.id, { checkDue: event.target.value })} />
                            </label>
                        </>
                    )}
                </div>
                <p className="mt-2 text-[11px] text-[var(--ac-text-muted)]">
                    {meta.invoice
                        ? text('الفائض عن الفاتورة يسدد فواتير أقدم، والباقي رصيد دفعة مقدمة.', 'Any excess settles older invoices; the rest stays as an advance.')
                        : text('يوزَّع تلقائياً على فواتير الطرف المفتوحة، والباقي دفعة مقدمة.', 'Allocated automatically to the party\'s open invoices; the rest stays as an advance.')}
                </p>
            </div>
        );
    }

    function detailPanel(row: Row) {
        const meta = META[row.type];

        if (meta.invoice) {
            const x = totals(row);

            return (
                <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
                    <div className="rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3">
                        <h4 className="mb-2 text-xs font-bold text-[var(--ac-text-muted)]">{text('البنود (كل فاتورة بمنتجاتها)', 'Lines (every invoice with its products)')}</h4>
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--ac-text-muted)]">
                            {text('عدد البنود', 'Lines')}
                            <input
                                className={field + ' !w-16 text-center'}
                                inputMode="numeric"
                                defaultValue={row.lines.length}
                                key={row.lines.length}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        makeLines(row, (event.target as HTMLInputElement).value);
                                    }
                                }}
                            />
                            {text('اكتب العدد ثم Enter لإنشاء كل الصفوف دفعة واحدة', 'Type a number and press Enter to create all lines at once')}
                        </div>
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-[10px] font-bold text-[var(--ac-text-muted)]">
                                    <th className="py-1 text-start">{text('المنتج', 'Product')}</th>
                                    <th className="py-1 text-start">{text('الكمية', 'Qty')}</th>
                                    <th className="py-1 text-start">{text('السعر', 'Price')}</th>
                                    <th className="py-1 text-start">{text('الإجمالي', 'Total')}</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {row.lines.map((line) => (
                                    <tr key={line.key}>
                                        <td className="py-1 pe-1">
                                            <select className={field} value={line.productId ?? ''} onChange={(event) => void chooseProduct(row, line, event.target.value ? Number(event.target.value) : null)}>
                                                <option value="">{text('المنتج', 'Product')}</option>
                                                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                                            </select>
                                        </td>
                                        <td className="py-1 pe-1"><input className={field + ' !w-20 text-left'} dir="ltr" value={line.qty} onChange={(event) => patchLine(row.id, line.key, { qty: event.target.value })} /></td>
                                        <td className="py-1 pe-1"><input className={field + ' !w-24 text-left'} dir="ltr" value={line.price} onChange={(event) => patchLine(row.id, line.key, { price: event.target.value })} /></td>
                                        <td className="py-1 pe-1 text-left" dir="ltr">{money(lineTotal(line))}</td>
                                        <td>
                                            <button type="button" aria-label={text('حذف البند', 'Remove line')} className="p-1.5 text-red-500" onClick={() => setRows((current) => current.map((candidate) => (candidate.id === row.id ? { ...candidate, lines: candidate.lines.length > 1 ? candidate.lines.filter((l) => l.key !== line.key) : [newLine()] } : candidate)))}>
                                                <X size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <button type="button" className={btnSecondary} onClick={() => setRows((current) => current.map((candidate) => (candidate.id === row.id ? { ...candidate, lines: [...candidate.lines, newLine()] } : candidate)))}>
                                <Plus size={14} />{text('بند', 'Line')}
                            </button>
                            <span className="text-xs text-[var(--ac-text-muted)]">
                                {text('المجموع', 'Subtotal')} <b>{money(x.subtotal)}</b> · {text('الخصم', 'Discount')} <b>{money(x.discount)}</b> · {text('الإجمالي', 'Total')} <b>{money(x.total)}</b>
                            </span>
                        </div>
                    </div>
                    {meta.pay ? paymentBox(row) : (
                        <div className="rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3">
                            <label className="text-[11px] font-bold text-[var(--ac-text-muted)]">
                                {text('الخصم (5% أو مبلغ)', 'Discount (5% or amount)')}
                                <input className={field + ' mt-1 text-left'} dir="ltr" value={row.disc} onChange={(event) => patch(row.id, { disc: event.target.value })} />
                            </label>
                            <p className="mt-2 text-[11px] text-[var(--ac-text-muted)]">{text('المتفرقات تُدفع نقداً في نفس اليوم تلقائياً.', 'Walk-in sales are paid in cash the same day automatically.')}</p>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="grid gap-3 lg:grid-cols-2">
                {meta.pay && paymentBox(row)}
                <div className="rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3">
                    {row.type === 'attendance' && (
                        <label className="mb-2 block text-[11px] font-bold text-[var(--ac-text-muted)]">
                            {text('عدد الأيام (اختياري، افتراضياً يوم كامل)', 'Days (optional, default one full day)')}
                            <input className={field + ' mt-1 text-left'} dir="ltr" inputMode="decimal" placeholder="1" value={row.amt} onChange={(event) => patch(row.id, { amt: event.target.value })} />
                        </label>
                    )}
                    {row.type === 'staff' && (
                        <label className="mb-2 block text-[11px] font-bold text-[var(--ac-text-muted)]">
                            {text('نوع الحركة', 'Transaction')}
                            <select className={field + ' mt-1'} value={row.staffKind} onChange={(event) => patch(row.id, { staffKind: event.target.value })}>
                                {STAFF_KINDS.map(([value, arabic, english]) => <option key={value} value={value}>{text(arabic, english)}</option>)}
                            </select>
                        </label>
                    )}
                    <label className="text-[11px] font-bold text-[var(--ac-text-muted)]">
                        {text('ملاحظات', 'Notes')}
                        <input className={field + ' mt-1'} value={row.notes} onChange={(event) => patch(row.id, { notes: event.target.value })} />
                    </label>
                    {row.type === 'prod' && <p className="mt-2 text-[11px] text-[var(--ac-text-muted)]">{text('المواد الخام تُحسب من الوصفة الفعّالة للمنتج.', 'Raw materials are taken from the product\'s active recipe.')}</p>}
                </div>
            </div>
        );
    }

    function mainRow(row: Row, index: number, lastInGroup: boolean) {
        const meta = META[row.type];
        const missing = problems(row);
        const total = meta.invoice ? totals(row).total : 0;
        const hasPanel = true;

        return (
            <Fragment key={row.id}>
                <tr className={row.error ? 'bg-red-500/5' : ''}>
                    <td className="w-7 text-center text-xs text-[var(--ac-text-muted)]">{index + 1}</td>
                    <td className="px-1.5 py-1.5">
                        <select className={field + ' min-w-[112px] font-bold'} style={{ color: meta.color }} value={row.type} onChange={(event) => patch(row.id, { type: event.target.value as RowType, partyId: null, staffKind: event.target.value === 'attendance' ? 'present' : 'advance', lines: META[event.target.value as RowType].invoice && ! row.lines.length ? [newLine()] : row.lines })}>
                            {visibleTypes.map((type) => <option key={type} value={type}>{typeName(type)}</option>)}
                        </select>
                    </td>
                    <td className="px-1.5 py-1.5">
                        <input type="date" className={field + ' min-w-[128px]'} dir="ltr" max={today} min="2000-01-01" value={row.date} onChange={(event) => { patch(row.id, { date: event.target.value }); if (validDate(event.target.value)) { setSelected((current) => [...new Set([...current, event.target.value])]); } }} />
                    </td>
                    <td className="min-w-[160px] px-1.5 py-1.5">
                        {partySelect(row)}
                        {duplicates(row) && <div className="mt-1 inline-block rounded-[8px] bg-violet-500/10 px-2 py-0.5 text-[11px] font-bold text-violet-600">{text('ستُضمّ لفاتورة اليوم', 'Will merge into the day\'s invoice')}</div>}
                        {row.merged && <div className="mt-1 inline-block rounded-[8px] bg-violet-500/10 px-2 py-0.5 text-[11px] font-bold text-violet-600">{text('ضُمّت', 'Merged')}</div>}
                    </td>
                    <td className="min-w-[110px] px-1.5 py-1.5">
                        <input data-main data-row={row.id} className={field} placeholder={text('رقم ورقي', 'Paper no.')} value={row.ref} onChange={(event) => patch(row.id, { ref: event.target.value })} onKeyDown={(event) => onEnter(event, row, false)} />
                    </td>
                    <td className="min-w-[150px] px-1.5 py-1.5">
                        {meta.invoice ? (
                            <div className="flex items-center gap-2">
                                <b className="min-w-[56px] text-sm">{total ? money(total) : '—'}</b>
                                <span className="text-[11px] text-[var(--ac-text-muted)]">{row.lines.filter(completeLine).length} {text('بنود', 'lines')}</span>
                            </div>
                        ) : row.type === 'attendance' ? (
                            <select data-main data-row={row.id} className={field} value={row.staffKind} onChange={(event) => patch(row.id, { staffKind: event.target.value })} onKeyDown={(event) => onEnter(event, row, true)}>
                                <option value="present">{text('حاضر', 'Present')}</option>
                                <option value="absent">{text('غائب', 'Absent')}</option>
                            </select>
                        ) : (
                            <input data-main data-row={row.id} className={field + ' text-left'} dir="ltr" placeholder={row.type === 'prod' ? text('الكمية', 'Quantity') : text('المبلغ', 'Amount')} value={row.amt} onChange={(event) => patch(row.id, { amt: event.target.value })} onKeyDown={(event) => onEnter(event, row, true)} />
                        )}
                    </td>
                    <td className="px-1.5 py-1.5 text-xs text-[var(--ac-text-muted)]">
                        {meta.invoice ? (meta.pay ? (payOf(row) > 0 ? money(payOf(row)) : text('بدون دفعة', 'No payment')) : text('نقداً فوراً', 'Cash now')) : meta.pay ? (row.method === 'check' ? text('شيك', 'Check') : row.method === 'transfer' ? text('تحويل', 'Transfer') : text('نقدي', 'Cash')) : '—'}
                    </td>
                    <td className="px-1.5 py-1.5">
                        {row.error
                            ? <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-[11px] font-bold text-red-600">{row.error}</span>
                            : missing.length
                                ? <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">{text('ينقص: ', 'Missing: ')}{missing[0]}</span>
                                : <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">{text('جاهز', 'Ready')}</span>}
                    </td>
                    <td className="px-1.5 py-1.5">
                        {hasPanel && (
                            <button type="button" aria-expanded={row.open} className={'inline-flex min-h-9 items-center gap-1 rounded-[10px] border px-2.5 text-xs font-bold ' + (row.open ? 'border-[var(--ac-accent)] bg-[var(--ac-accent)] text-white' : 'border-[var(--ac-line)] text-[var(--ac-accent)]')} onClick={() => patch(row.id, { open: ! row.open })}>
                                <ChevronDown size={14} className={row.open ? 'rotate-180' : ''} />{text('تفاصيل', 'Details')}
                            </button>
                        )}
                    </td>
                    <td className="px-1.5">
                        <button type="button" aria-label={text('حذف الصف', 'Remove row')} className="p-2 text-red-500" onClick={() => remove(row.id)}><X size={16} /></button>
                    </td>
                </tr>
                {row.open && (
                    <tr className="bg-[var(--ac-surface-soft,#fafcff)]">
                        <td />
                        <td colSpan={9} className="px-3 py-3">{detailPanel(row)}</td>
                    </tr>
                )}
                {lastInGroup && null}
            </Fragment>
        );
    }

    const calendar = () => {
        const first = new Date(year, month - 1, 1).getDay();
        const dim = new Date(year, month, 0).getDate();
        const cells: React.ReactNode[] = [];

        for (let i = 0; i < first; i++) {
            cells.push(<span key={'b' + i} />);
        }

        for (let d = 1; d <= dim; d++) {
            const day = iso(year, month, d);
            const future = day > today || day < from;
            const has = !! activeDays[day];
            const gap = ! has && ! future && ! isWeekend(day) && day < activeLast;
            const picked = selected.includes(day);

            cells.push(
                <button
                    key={day}
                    type="button"
                    disabled={future}
                    aria-label={day}
                    onClick={(event) => toggleDay(day, event.shiftKey)}
                    className={'min-h-9 rounded-[10px] border text-sm ' + (picked ? 'border-[var(--ac-accent)] bg-[var(--ac-accent)] font-bold text-white' : has ? 'border-emerald-300 bg-emerald-500/15 font-bold text-emerald-700' : gap ? 'border-amber-300 bg-amber-500/15' : 'border-[var(--ac-line)] bg-[var(--ac-surface)]') + (day === today ? ' ring-2 ring-[var(--ac-accent)]' : '') + (future ? ' opacity-30' : '')}
                >
                    {d}
                </button>,
            );
        }

        return cells;
    };

    return (
        <AppShell>
            <Head title={text('الإدخال السريع', 'Quick entry')} />
            <main ref={container} className="mx-auto w-full max-w-[1500px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-3">
                            <span className="grid size-10 place-items-center rounded-[12px] bg-[var(--ac-accent-soft,#e3eeff)] text-[var(--ac-accent)]"><Zap size={20} /></span>
                            <h1 className="text-2xl font-bold tracking-[-0.03em] text-[var(--ac-text)]">{text('الإدخال السريع', 'Quick entry')}</h1>
                        </div>
                        <p className="mt-1 max-w-3xl text-sm text-[var(--ac-text-muted)]">
                            {text('فواتير ودفعات ونثريات وإنتاج وموظفين في جدول واحد. اختر الأيام، حدد كم صفاً من كل نوع لكل يوم، واملأ الجدول.', 'Invoices, payments, petty expenses, production and staff in one table. Pick the days, set how many rows of each type per day, then fill the table.')}
                        </p>
                    </div>
                    <button type="button" className={btnPrimary} disabled={! readyCount || saving} onClick={() => void save()}>
                        <Save size={16} />{saving ? text('جارٍ الحفظ…', 'Saving…') : text(`حفظ الجاهز (${readyCount})`, `Save ready (${readyCount})`)}
                    </button>
                </header>

                {error && <div className="rounded-[14px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
                {notice && <div className="rounded-[14px] border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-700">{notice}</div>}

                <section className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2">
                    {visibleTypes.map((type) => {
                        const info = progress?.[type];
                        const behind = info?.last ? dayDiff(info.last, today) : null;

                        return (
                            <div key={type} className={'rounded-[14px] border bg-[var(--ac-surface)] p-3 ' + (behind !== null && behind > 45 ? 'border-amber-300 bg-amber-500/5' : 'border-[var(--ac-line)]')}>
                                <div className="flex items-center justify-between text-sm font-bold">
                                    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: META[type].color }} />{typeName(type)}</span>
                                    {behind !== null && <span className={'rounded-full px-2 py-0.5 text-[11px] ' + (behind > 30 ? 'bg-amber-500/15 text-amber-700' : 'bg-emerald-500/15 text-emerald-700')}>{behind} {text('يوم', 'd')}</span>}
                                </div>
                                <p className="mb-2 mt-1 text-xs text-[var(--ac-text-muted)]">
                                    {info?.last ? `${text('وصلت: ', 'Reached: ')}${info.last} · ${info.ref ?? ''}` : text('لا إدخال في هذه الفترة', 'No entries in this period')}
                                </p>
                                <button type="button" className={btnSecondary + ' w-full justify-center'} onClick={() => continueFrom(type)}><Play size={13} />{text('تابع من هنا', 'Continue here')}</button>
                            </div>
                        );
                    })}
                </section>

                <div className="grid items-start gap-4 xl:grid-cols-[1fr_340px]">
                    <div className="space-y-3">
                        <nav className="flex flex-wrap gap-1 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-1.5" aria-label={text('نوع الإدخال', 'Entry type')}>
                            {(['all', ...visibleTypes] as Array<'all' | RowType>).map((type) => (
                                <button key={type} type="button" className={'inline-flex min-h-10 items-center gap-1.5 rounded-[11px] px-3 text-sm font-bold ' + (filter === type ? 'bg-[var(--ac-accent)] text-white' : 'text-[var(--ac-text-muted)]')} onClick={() => setFilter(type)}>
                                    {type !== 'all' && <span className="size-2 rounded-full" style={{ background: META[type].color }} />}
                                    {type === 'all' ? text('الكل', 'All') : typeName(type)}
                                    <span className={'rounded-full px-1.5 text-[11px] ' + (filter === type ? 'bg-white/25' : 'bg-[var(--ac-accent-soft,#e3eeff)] text-[var(--ac-accent)]')}>{rows.filter((row) => type === 'all' || row.type === type).length}</span>
                                </button>
                            ))}
                        </nav>

                        <div className="overflow-hidden rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)]">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ac-line)] bg-[var(--ac-accent-soft,#eef4ff)] px-4 py-2.5 text-xs text-[var(--ac-text-muted)]">
                                <span><kbd className="rounded border border-[var(--ac-line)] bg-white px-1.5">Enter</kbd> {text('الحقل التالي، وفي آخر حقل صف جديد بنفس اليوم والنوع. كل صف يحتفظ بتاريخه.', 'next field; in the last field a new row on the same day and type. Every row keeps its own date.')}</span>
                                <span className="flex gap-1.5">
                                    <button type="button" className={btnSecondary} onClick={() => setRows((current) => current.map((row) => ({ ...row, open: false })))}>{text('طيّ الكل', 'Collapse all')}</button>
                                    <button type="button" className={btnSecondary} onClick={() => setRows((current) => current.map((row) => ({ ...row, open: true })))}>{text('توسيع الكل', 'Expand all')}</button>
                                </span>
                            </div>

                            {filteredRows.length === 0 ? (
                                <div className="p-10 text-center text-sm text-[var(--ac-text-muted)]">
                                    <CalendarDays className="mx-auto mb-2" size={28} />
                                    {text('اختر يوماً أو أكثر من التقويم، حدد كم صفاً من كل نوع، واضغط «أنشئ الصفوف».', 'Pick one or more days from the calendar, set how many rows of each type, and press “Create rows”.')}
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-start">
                                        <thead>
                                            <tr className="border-b border-[var(--ac-line)] text-[11px] font-bold text-[var(--ac-text-muted)]">
                                                <th />
                                                <th className="px-2 py-2.5 text-start">{text('النوع', 'Type')}</th>
                                                <th className="px-2 py-2.5 text-start">{text('التاريخ', 'Date')}</th>
                                                <th className="px-2 py-2.5 text-start">{text('الطرف / البيان', 'Party / item')}</th>
                                                <th className="px-2 py-2.5 text-start">{text('الرقم الورقي', 'Paper no.')}</th>
                                                <th className="px-2 py-2.5 text-start">{text('الإجمالي / المبلغ', 'Total / amount')}</th>
                                                <th className="px-2 py-2.5 text-start">{text('الدفعة', 'Payment')}</th>
                                                <th className="px-2 py-2.5 text-start">{text('الحالة', 'Status')}</th>
                                                <th /><th />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dates.map((date) => {
                                                const group = filteredRows.filter((row) => row.date === date);
                                                const summary = visibleTypes
                                                    .filter((type) => group.some((row) => row.type === type))
                                                    .map((type) => `${typeName(type)} ${group.filter((row) => row.type === type).length}`)
                                                    .join(' · ');

                                                return (
                                                    <Fragment key={date}>
                                                        <tr className="bg-[var(--ac-accent-soft,#e3eeff)]">
                                                            <td colSpan={10} className="px-4 py-2">
                                                                <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
                                                                    <span>
                                                                        {(ar ? DAYS_AR : DAYS_EN)[weekday(date)]} {Number(date.slice(8))} {months[Number(date.slice(5, 7)) - 1]}
                                                                        <span className="ms-2 rounded-full bg-[var(--ac-surface)] px-2 py-0.5 text-[11px] text-[var(--ac-accent)]">{group.filter(isReady).length}/{group.length} {text('جاهز', 'ready')}</span>
                                                                        <span className="ms-2 text-xs font-normal text-[var(--ac-text-muted)]">{summary}</span>
                                                                    </span>
                                                                    <span className="flex gap-1.5">
                                                                        <button type="button" className={btnSecondary} onClick={() => addRowAt(date, filter === 'all' ? (visibleTypes[0] ?? 'sale') : filter)}><Plus size={13} />{text('صف', 'Row')}</button>
                                                                        <button type="button" className={btnSecondary} onClick={() => duplicateDay(date)}><Copy size={13} />{text('انسخ ليوم آخر', 'Copy to another day')}</button>
                                                                    </span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        {group.map((row, index) => mainRow(row, index, index === group.length - 1))}
                                                    </Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--ac-accent-soft,#eef4ff)] px-4 py-2.5 text-xs text-[var(--ac-text-muted)]">
                                <span>{text('أيام', 'Days')}: <b>{dates.length}</b> · {text('صفوف', 'Rows')}: <b>{filteredRows.length}</b> · {text('جاهز', 'Ready')}: <b>{readyCount}</b></span>
                                <span>{text('فاتورتا نفس الطرف في نفس اليوم تُضمّان تلقائياً.', 'Two invoices for the same party on the same day merge automatically.')}</span>
                            </div>
                        </div>
                    </div>

                    <aside className="space-y-3 xl:sticky xl:top-3">
                        <section className={card}>
                            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><CalendarDays size={16} />{text('الأيام', 'Days')} {filter === 'all' ? text('(كل الأنواع)', '(all types)') : '— ' + typeName(filter)}</h3>
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <button type="button" aria-label={text('الشهر السابق', 'Previous month')} className={btnSecondary} onClick={() => setMonth(Math.max(1, month - 1))}>‹</button>
                                <b className="text-sm">{months[month - 1]} {year}</b>
                                <button type="button" aria-label={text('الشهر التالي', 'Next month')} className={btnSecondary} onClick={() => setMonth(Math.min(12, month + 1))}>›</button>
                            </div>
                            <div className="grid grid-cols-7 gap-1 text-center">
                                {(ar ? ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']).map((label, index) => <span key={index} className="py-1 text-[11px] text-[var(--ac-text-muted)]">{label}</span>)}
                                {calendar()}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--ac-text-muted)]">
                                <span><i className="me-1 inline-block size-3 rounded bg-emerald-500/30" />{text('مدخل', 'Entered')}</span>
                                <span><i className="me-1 inline-block size-3 rounded bg-amber-500/30" />{text('فراغ', 'Gap')}</span>
                                <span><i className="me-1 inline-block size-3 rounded bg-[var(--ac-accent)]" />{text('محدد', 'Selected')}</span>
                            </div>
                            <p className="mt-2 text-[11px] text-[var(--ac-text-muted)]">{text('عدة أيام: اضغط كل يوم، أو Shift + ضغطة لتحديد مدى.', 'Several days: click each, or Shift + click for a range.')}</p>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold text-[var(--ac-text-muted)]">
                                <label>
                                    {text('عرض من تاريخ', 'Show from')}
                                    <input type="date" className={field + ' mt-1'} dir="ltr" min="2000-01-01" max={today} value={from} onChange={(event) => validDate(event.target.value) && setFrom(event.target.value)} />
                                </label>
                                <label>
                                    {text('أيام العطلة', 'Days off')}
                                    <select className={field + ' mt-1'} value={weekend} onChange={(event) => setWeekend(event.target.value as typeof weekend)}>
                                        <option value="5">{text('الجمعة', 'Friday')}</option>
                                        <option value="5,6">{text('الجمعة والسبت', 'Friday & Saturday')}</option>
                                        <option value="">{text('لا يوجد', 'None')}</option>
                                    </select>
                                </label>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <button type="button" className={btnSecondary} onClick={pickGaps}>{text('حدد أيام الفراغ في الشهر', 'Select gaps this month')}</button>
                                <button type="button" className={btnSecondary} onClick={() => setSelected([...new Set(rows.map((row) => row.date))])}>{text('أزل غير المستخدم', 'Clear unused')}</button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {selected.length
                                    ? [...selected].sort().map((day) => (
                                        <button key={day} type="button" className="rounded-full bg-[var(--ac-accent-soft,#e3eeff)] px-2.5 py-0.5 text-xs font-bold text-[var(--ac-accent)]" onClick={() => toggleDay(day, false)}>{Number(day.slice(8))} {months[Number(day.slice(5, 7)) - 1]} ✕</button>
                                    ))
                                    : <span className="text-xs text-[var(--ac-text-muted)]">{text('لم تحدد أياماً بعد', 'No days selected yet')}</span>}
                            </div>
                        </section>

                        <section className={card}>
                            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Layers size={16} />{text('كم صفاً من كل نوع لكل يوم؟', 'Rows of each type per day')}</h3>
                            <div className="grid grid-cols-[1fr_70px] items-center gap-x-2 gap-y-1.5">
                                {visibleTypes.map((type) => (
                                    <Fragment key={type}>
                                        <span className="flex items-center gap-2 text-sm"><span className="size-2.5 rounded-full" style={{ background: META[type].color }} />{typeName(type)}</span>
                                        <input className={field + ' text-center'} inputMode="numeric" value={counts[type]} onChange={(event) => setCounts((current) => ({ ...current, [type]: Math.min(Math.max(Math.trunc(num(event.target.value)), 0), 50) }))} />
                                    </Fragment>
                                ))}
                            </div>
                            <p className="my-2 text-[11px] text-[var(--ac-text-muted)]">{text('مثال: نثريات 3، فواتير بيع 4، دفع 3 = 10 صفوف في كل يوم محدد.', 'Example: petty 3, sales 4, payments 3 = 10 rows on every selected day.')}</p>
                            <button type="button" className={btnPrimary + ' w-full justify-center'} disabled={! selected.length || ! matrixTotal} onClick={createRows}>
                                <MapPin size={15} />{text(`أنشئ ${matrixTotal} صف على ${selected.length} يوم`, `Create ${matrixTotal} rows over ${selected.length} days`)}
                            </button>
                        </section>
                    </aside>
                </div>
            </main>
        </AppShell>
    );
}
