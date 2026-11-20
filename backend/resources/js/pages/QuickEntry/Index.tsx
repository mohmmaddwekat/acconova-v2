import { Select } from '@/components/ui/Select';
import { AppShell } from '@/layouts/AppShell';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { useLiveRefresh } from '@/lib/live';
import { apiErrorText } from '@/pages/Finance/shared';
import type { FinanceLookups } from '@/pages/Finance/types';
import { Head, usePage } from '@inertiajs/react';
import {
    CalendarDays,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Copy,
    GripVertical,
    MapPin,
    Play,
    Plus,
    Save,
    Search,
    TriangleAlert,
    X,
    Zap,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type RowType = 'sale' | 'purchase' | 'misc' | 'receipt' | 'payment' | 'petty' | 'prod' | 'staff' | 'attendance';
type Method = 'cash' | 'transfer' | 'check';

/** One more payment on the same document: a second cash amount, a transfer or one more check. */
type ExtraPart = { key: number; method: Method; amt: string; chequeId: number | null; checkNo: string; checkBank: string; checkDue: string };

/** `typed` is false while the price is one the system filled in, so choosing another product may replace it. */
type Line = { key: number; productId: number | null; qty: string; price: string; typed?: boolean };

/** An entry the system already holds for the same party and day, shown before the same one is typed twice. */
type ExistingEntry = {
    number: string | null;
    amount: string;
    method: string | null;
    check_number: string | null;
    /** What kind of entry it is, for entries that have no number (a petty category, a staff payment kind). */
    label?: string;
    lines: Array<{ name: string | null; quantity: string; unit_price: string; total: string }>;
};

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
    /** Tax rule applied to every line of an invoice row; none means the product's own rate. */
    taxRuleId: number | null;
    pay: string;
    full: boolean;
    method: Method;
    chequeId: number | null;
    checkNo: string;
    checkBank: string;
    checkDue: string;
    extra: ExtraPart[];
    open: boolean;
    error: string;
    merged: boolean;
    stock: boolean;
    /** Entries found in the system for this row's party and day, until the user decides what to do. */
    exist: ExistingEntry[] | null;
    /** The user confirmed this row differs from what the system already holds. */
    dupOk: boolean;
    /** Show exactly what is missing in this row, field by field. */
    flag: boolean;
};

/** One thing a row still needs: which field, what it is called, and why it is required. */
type Issue = { key: 'date' | 'party' | 'employee' | 'product' | 'lines' | 'amount' | 'check'; label: string; why: string };

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
/**
 * Focuses a field. A dropdown (wa-select) that has only just been added has no inner input yet and its focus()
 * throws, which would blank the whole page, so wait for it to finish rendering and never let a failed focus escape.
 */
const safeFocus = (element: HTMLElement | null | undefined): void => {
    if (! element) {
        return;
    }

    const pending = (element as unknown as { updateComplete?: Promise<unknown> }).updateComplete;
    const run = (): void => {
        try {
            element.focus();
        } catch {
            // Nothing to focus yet.
        }
    };

    if (pending) {
        void pending.then(run, run);
    } else {
        run();
    }
};

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
    taxRuleId: null,
    pay: '',
    full: false,
    method: 'cash',
    chequeId: null,
    checkNo: '',
    checkBank: '',
    checkDue: '',
    extra: [],
    open: false,
    error: '',
    merged: false,
    // Purchases add stock by default so raw material bought the same day can be used in production.
    stock: type === 'purchase' || type === 'sale' || type === 'misc',
    exist: null,
    dupOk: false,
    flag: false,
});

const MAX_PER_DAY = 50;
const DRAFT_VERSION = 1;

/** Date field that applies a typed date only once it is complete, so half-typed years never move the row. */
function CommitDate({ value, max, label, className, onCommit }: { value: string; max: string; label: string; className: string; onCommit: (next: string) => void }) {
    const [draft, setDraft] = useState<string | null>(null);
    const timer = useRef<number | undefined>(undefined);
    const shown = draft ?? value;

    useEffect(() => () => window.clearTimeout(timer.current), []);

    const commit = (next: string) => {
        window.clearTimeout(timer.current);
        setDraft(null);

        if (next !== value && validDate(next) && next <= max) {
            onCommit(next);
        }
    };

    return (
        <input
            type="date"
            aria-label={label}
            className={className}
            dir="ltr"
            min="2000-01-01"
            max={max}
            value={shown}
            onChange={(event) => {
                const next = event.target.value;

                setDraft(next);
                window.clearTimeout(timer.current);

                if (validDate(next) && next <= max) {
                    timer.current = window.setTimeout(() => commit(next), 900);
                }
            }}
            onBlur={(event) => {
                const next = event.target.value;

                window.setTimeout(() => commit(next), 250);
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    commit((event.target as HTMLInputElement).value);
                }
            }}
        />
    );
}

/**
 * The "number of lines" box of an invoice: applies by itself shortly after typing (no Enter needed) and selects the
 * old number when it is clicked, so a new number can simply be typed over it.
 */
function LineCountField({ count, className, onApply }: { count: number; className: string; onApply: (value: string) => void }) {
    const [value, setValue] = useState(String(count));
    const focused = useRef(false);
    const timer = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (! focused.current) {
            setValue(String(count));
        }
    }, [count]);

    useEffect(() => () => window.clearTimeout(timer.current), []);

    return (
        <input
            className={className}
            inputMode="numeric"
            value={value}
            onFocus={(event) => {
                focused.current = true;
                event.target.select();
            }}
            onChange={(event) => {
                const next = event.target.value.replace(/[^0-9]/g, '');

                setValue(next);
                window.clearTimeout(timer.current);

                if (next !== '') {
                    timer.current = window.setTimeout(() => onApply(next), 350);
                }
            }}
            onBlur={() => {
                focused.current = false;
                window.clearTimeout(timer.current);

                if (value !== '' && value !== String(count)) {
                    onApply(value);
                }

                setValue(String(count));
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    window.clearTimeout(timer.current);

                    if (value !== '') {
                        onApply(value);
                    }
                }
            }}
        />
    );
}

function CountStepper({ value, label, onChange }: { value: number; label: string; onChange: (next: number) => void }) {
    const clamp = (next: number): number => Math.min(Math.max(Math.trunc(next) || 0, 0), MAX_PER_DAY);
    const step = 'inline-flex size-8 items-center justify-center rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-surface)] text-base font-bold text-[var(--ac-accent)] hover:bg-[var(--ac-accent-soft,#e3eeff)]';

    return (
        <span className="inline-flex items-center gap-1">
            <button type="button" className={step} aria-label={`− ${label}`} onClick={() => onChange(clamp(value - 1))}>−</button>
            <input
                className={field + ' !h-8 !w-12 text-center'}
                inputMode="numeric"
                aria-label={label}
                value={value}
                onFocus={(event) => event.target.select()}
                onChange={(event) => onChange(clamp(Number(event.target.value.replace(/\D/g, ''))))}
            />
            <button type="button" className={step} aria-label={`+ ${label}`} onClick={() => onChange(clamp(value + 1))}>+</button>
        </span>
    );
}

type OffsetPlan = { sales_open: number; purchases_open: number; available: number };

/**
 * For a party that is both customer and supplier: shows what is open in each direction on
 * saved invoices and offers to cancel the common part against each other (a "مقاصة").
 */
function OffsetHint({ partyId, name, ar }: { partyId: number; name: string; ar: boolean }) {
    const [plan, setPlan] = useState<OffsetPlan | null>(null);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(() => {
        apiRequest<{ data: OffsetPlan }>(`/api/parties/${partyId}/offsets/preview`, { method: 'POST', body: JSON.stringify({}) })
            .then((response) => setPlan(response.data))
            .catch(() => setPlan(null));
    }, [partyId]);

    useEffect(() => {
        setDone('');
        setError('');
        load();
    }, [load]);

    async function apply(): Promise<void> {
        setBusy(true);
        setError('');

        try {
            const response = await apiRequest<{ data: { total: number } }>(`/api/parties/${partyId}/offsets`, { method: 'POST', body: JSON.stringify({}) });

            setDone(ar ? `تمت المقاصة بمبلغ ${money(Number(response.data.total))}.` : `Offset of ${money(Number(response.data.total))} done.`);
            load();
        } catch (exception) {
            setError(exception instanceof Error ? exception.message : (ar ? 'تعذّرت المقاصة.' : 'Offset failed.'));
        } finally {
            setBusy(false);
        }
    }

    if (! plan || (plan.available <= 0 && ! done)) {
        return null;
    }

    return (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[14px] border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <span className="min-w-0 flex-1">
                {done || (ar
                    ? `${name}: له علينا ${money(plan.purchases_open)} وعليه لنا ${money(plan.sales_open)} (فواتير محفوظة مفتوحة). يمكن مقاصة ${money(plan.available)} من بعض بدون حركة نقد.`
                    : `${name}: we owe ${money(plan.purchases_open)} and they owe ${money(plan.sales_open)} on saved open invoices. ${money(plan.available)} can be offset with no cash moving.`)}
                {error && <b className="ms-2 text-red-600">{error}</b>}
            </span>
            {plan.available > 0 && (
                <button type="button" disabled={busy} onClick={() => void apply()} className="rounded-full bg-amber-600 px-3 py-1 font-bold text-white disabled:opacity-60">
                    {ar ? 'اعمل مقاصة' : 'Offset now'}
                </button>
            )}
        </div>
    );
}

export default function QuickEntry() {
    const ar = useLocale() === 'ar';
    const text = (arabic: string, english: string): string => ar ? arabic : english;
    const today = todayIso();
    const year = Number(today.slice(0, 4));

    const [lookups, setLookups] = useState<FinanceLookups | null>(null);
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [attendanceStaff, setAttendanceStaff] = useState<StaffMember[]>([]);
    const [cheques, setCheques] = useState<Cheque[]>([]);
    const [progress, setProgress] = useState<Progress | null>(null);
    const [balances, setBalances] = useState<Record<number, { owed_to_us: number; we_owe: number }>>({});
    const [from, setFrom] = useState(`${year}-01-01`);
    const [weekend, setWeekend] = useState<'5' | '5,6' | ''>('5');

    const [rows, setRows] = useState<Row[]>([]);
    const [filter, setFilter] = useState<'all' | RowType>('all');
    const [selected, setSelected] = useState<string[]>([]);
    const [anchor, setAnchor] = useState<string | null>(null);
    // What to create: which types, and for every day its own count per type (never one number for all days).
    const [plan, setPlan] = useState<Record<string, Partial<Record<RowType, number>>>>({});
    const [activeDay, setActiveDay] = useState<string | null>(null);
    const [typeMenu, setTypeMenu] = useState(false);
    const [typeQuery, setTypeQuery] = useState('');
    const [showMatrix, setShowMatrix] = useState(false);
    const [collapsedDays, setCollapsedDays] = useState<string[]>([]);
    const [dragId, setDragId] = useState<number | null>(null);
    /* Rows ticked for a change that applies to all of them at once. */
    const [picked, setPicked] = useState<number[]>([]);
    const lastPicked = useRef<number | null>(null);
    const [bulkField, setBulkField] = useState('');
    const [bulkValue, setBulkValue] = useState('');
    const [dropMark, setDropMark] = useState<{ id: number | string; where: 'before' | 'after' | 'day' } | null>(null);
    const [copyingDay, setCopyingDay] = useState<string | null>(null);
    const [dupRowId, setDupRowId] = useState<number | null>(null);
    const askedExisting = useRef<Set<string>>(new Set());
    const [month, setMonth] = useState(Number(today.slice(5, 7)));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const container = useRef<HTMLDivElement>(null);
    const pendingFocus = useRef<number | null>(null);
    const pendingGrip = useRef<number | null>(null);
    const pendingLineFocus = useRef<string | null>(null);

    const loadCheques = useCallback(() => {
        apiRequest<{ data: Cheque[] }>('/api/finance/cash-movements/cheques-on-hand')
            .then((response) => setCheques(response.data))
            .catch(() => undefined);
    }, []);

    const loadLookups = useCallback(() => {
        apiRequest<FinanceLookups>('/api/finance/lookups')
            .then(setLookups)
            .catch((failure) => setError(apiErrorText(failure)));
    }, []);

    const loadRosters = useCallback(async () => {
        {
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
        }
    }, []);

    useEffect(() => {
        loadLookups();
        loadCheques();
        void loadRosters();
    }, [loadLookups, loadCheques, loadRosters]);

    /*
     * Rows typed but not yet saved are kept as a draft in this browser, per user and workspace,
     * so a reload, a failed save or a closed tab never throws the typing away.
     */
    const shared = usePage<{ auth?: { user?: { id: number } | null }; workspace?: { activeOrganization?: { id: number } | null } }>().props;
    const draftKey = `acconova.quick-entry.draft.v${DRAFT_VERSION}.${shared.auth?.user?.id ?? 0}.${shared.workspace?.activeOrganization?.id ?? 0}`;
    const [restored, setRestored] = useState(0);
    const draftReady = useRef(false);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(draftKey);
            const draft = raw ? JSON.parse(raw) as { rows?: Row[]; selected?: string[] } : null;

            if (draft && Array.isArray(draft.rows) && draft.rows.length) {
                nextId = Math.max(nextId, ...draft.rows.map((row) => row.id + 1));
                nextKey = Math.max(nextKey, ...draft.rows.flatMap((row) => row.lines.map((line) => line.key + 1)), 1);
                // Restored rows were already checked against the system when they were typed.
                draft.rows.forEach((row) => {
                    const key = existingKey(row);

                    if (key) {
                        askedExisting.current.add(`${row.id}|${key}`);
                    }
                });
                setRows(draft.rows.map((row) => ({ ...row, extra: row.extra ?? [], exist: null, flag: false, error: '' })));
                setSelected(Array.isArray(draft.selected) ? draft.selected : []);
                setRestored(draft.rows.length);
            }
        } catch {
            // Storage is blocked or the draft is unreadable: start from an empty table.
        }

        draftReady.current = true;
    }, [draftKey]);

    useEffect(() => {
        if (! draftReady.current) {
            return;
        }

        const timer = window.setTimeout(() => {
            try {
                if (rows.length) {
                    window.localStorage.setItem(draftKey, JSON.stringify({ rows, selected, savedAt: Date.now() }));
                } else {
                    window.localStorage.removeItem(draftKey);
                }
            } catch {
                // Storage is full or blocked: the page keeps working, just without a draft.
            }
        }, 600);

        return () => window.clearTimeout(timer);
    }, [rows, selected, draftKey]);

    const loadProgress = useCallback(() => {
        apiRequest<{ data: Progress }>(`/api/quick-entry/progress?from=${from}`)
            .then((response) => setProgress(response.data))
            .catch(() => setProgress(null));
    }, [from]);

    useEffect(() => {
        loadProgress();
    }, [loadProgress]);

    /*
     * Join the system-wide live refresh: any save made elsewhere (another page,
     * tab or person) quietly reloads the lists here without touching your rows,
     * and keeps this page from being re-mounted while you work.
     */
    const partyIdsKey = useMemo(
        () => [...new Set(rows.filter((row) => row.partyId && ['sale', 'purchase', 'receipt', 'payment'].includes(row.type)).map((row) => row.partyId as number))].sort((a, b) => a - b).join(','),
        [rows],
    );

    const loadBalances = useCallback(() => {
        if (! partyIdsKey) {
            return;
        }

        const query = partyIdsKey.split(',').map((id) => `ids[]=${id}`).join('&');

        apiRequest<{ data: Record<string, { owed_to_us: number; we_owe: number }> }>(`/api/quick-entry/balances?${query}`)
            .then((response) => setBalances((current) => ({ ...current, ...Object.fromEntries(Object.entries(response.data).map(([id, value]) => [Number(id), value])) })))
            .catch(() => undefined);
    }, [partyIdsKey]);

    useEffect(() => {
        loadBalances();
    }, [loadBalances]);

    useLiveRefresh(() => {
        loadBalances();
        loadCheques();
        loadLookups();
        loadProgress();
        void loadRosters();
    });

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
    const taxRuleOf = (row: Row) => (row.taxRuleId ? (lookups?.tax_rules ?? []).find((rule) => rule.id === row.taxRuleId) ?? null : null);
    const taxRulesFor = (row: Row) => (lookups?.tax_rules ?? []).filter((rule) => rule.applies_to === 'both' || rule.applies_to === (row.type === 'sale' ? 'sales' : 'purchases'));
    const totals = (row: Row) => {
        const subtotal = row.lines.reduce((sum, line) => sum + lineTotal(line), 0);
        const discount = discountOf(row, subtotal);

        const rule = taxRuleOf(row);
        const taxable = Math.max(subtotal - discount, 0);
        const rate = rule ? num(rule.rate) : 0;
        const tax = rule && ! rule.inclusive ? taxable * rate / 100 : 0;
        const included = rule?.inclusive && rate > 0 ? taxable - taxable / (1 + rate / 100) : 0;

        return { subtotal, discount, tax, included, total: taxable + tax };
    };
    const extrasTotal = (row: Row): number => row.extra.reduce((sum, part) => sum + num(part.amt), 0);
    /** The first payment part; "Full" pays what the invoice total leaves after the extra parts. */
    const mainPay = (row: Row): number => {
        if (! META[row.type].pay) {
            return 0;
        }

        return META[row.type].invoice
            ? (row.full ? Math.max(totals(row).total - extrasTotal(row), 0) : num(row.pay))
            : num(row.amt);
    };
    const payOf = (row: Row): number => (META[row.type].pay ? mainPay(row) + extrasTotal(row) : 0);
    const completeLine = (line: Line): boolean => !! line.productId && num(line.qty) > 0 && line.price !== '' && num(line.price) >= 0;

    /** Everything this row still needs, each with the field it belongs to and why it is required. */
    const issuesOf = (row: Row): Issue[] => {
        const meta = META[row.type];
        const found: Issue[] = [];

        if (! validDate(row.date) || row.date > today) {
            found.push({ key: 'date', label: text('التاريخ', 'Date'), why: text('اختر تاريخاً صحيحاً لا يتجاوز اليوم، فالقيد يُسجَّل في هذا التاريخ.', 'Pick a valid date that is not in the future; the entry is booked on it.') });
        }

        if (meta.party && ! row.partyId) {
            found.push({
                key: 'party',
                label: meta.party === 'c' ? text('العميل', 'Customer') : text('المورد', 'Supplier'),
                why: meta.party === 'c'
                    ? text('اختر العميل من عمود «الطرف / البيان»، فبدونه لا يُسجَّل المستند على حسابه.', 'Choose the customer in the “Party / item” column; without one the entry has no account to post to.')
                    : text('اختر المورد من عمود «الطرف / البيان»، فبدونه لا يُسجَّل المستند على حسابه.', 'Choose the supplier in the “Party / item” column; without one the entry has no account to post to.'),
            });
        }

        if ((row.type === 'staff' || row.type === 'attendance') && ! row.partyId) {
            found.push({ key: 'employee', label: text('الموظف', 'Employee'), why: text('اختر الموظف من عمود «الطرف / البيان».', 'Choose the employee in the “Party / item” column.') });
        }

        if (row.type === 'prod' && ! row.productId) {
            found.push({ key: 'product', label: text('المنتج', 'Product'), why: text('اختر المنتج النهائي الذي تم إنتاجه من عمود «الطرف / البيان».', 'Choose the finished product in the “Party / item” column.') });
        }

        if (meta.invoice) {
            if (! row.lines.some(completeLine)) {
                found.push({ key: 'lines', label: text('بند كامل', 'A complete line'), why: text('كل فاتورة تحتاج بنداً واحداً على الأقل فيه المنتج والكمية والسعر. افتح «تفاصيل» وأكمل الخانات الحمراء.', 'Every invoice needs at least one line with product, quantity and price. Open “Details” and fill the red fields.') });
            }
        } else if (row.type !== 'attendance' && num(row.amt) <= 0) {
            found.push({
                key: 'amount',
                label: row.type === 'prod' ? text('الكمية', 'Quantity') : text('المبلغ', 'Amount'),
                why: row.type === 'prod' ? text('اكتب كمية الإنتاج، وتكون أكبر من صفر.', 'Type the produced quantity, greater than zero.') : text('اكتب المبلغ في عمود «الإجمالي / المبلغ»، ويكون أكبر من صفر.', 'Type the amount in the “Total / amount” column, greater than zero.'),
            });
        }

        if (meta.pay && row.extra.some((part) => num(part.amt) <= 0 || (part.method === 'check' && ! part.chequeId && (! part.checkNo || ! validDate(part.checkDue))))) {
            found.push({ key: 'check', label: text('بيانات الدفعات الإضافية', 'Extra payment details'), why: text('كل دفعة إضافية تحتاج مبلغاً، والشيك يحتاج رقماً وتاريخ استحقاق (أو شيكاً من شيكاتك).', 'Every extra payment needs an amount, and a check needs a number and due date (or a check on hand).') });
        }

        if (meta.pay && payOf(row) > 0 && row.method === 'check' && ! row.chequeId && (! row.checkNo || ! validDate(row.checkDue))) {
            found.push({ key: 'check', label: text('بيانات الشيك', 'Check details'), why: text('الدفعة بشيك: اكتب رقم الشيك وتاريخ استحقاقه في «تفاصيل»، أو اختر شيكاً من شيكاتك.', 'The payment is by check: enter the check number and due date in “Details”, or pick a check on hand.') });
        }

        return found;
    };
    const problems = (row: Row): string[] => issuesOf(row).map((issue) => issue.label);
    const isReady = (row: Row): boolean => issuesOf(row).length === 0;
    /** Red outline for a field that is still missing, once the row has been flagged. */
    const bad = (row: Row, ...keys: Issue['key'][]): string => (row.flag && issuesOf(row).some((issue) => keys.includes(issue.key)) ? ' !border-red-500 !ring-1 !ring-red-300' : '');

    /* ---------- row operations ---------- */
    // Changing the party, day or type makes any earlier "already in the system" finding stale.
    const patch = (id: number, changes: Partial<Row>) =>
        setRows((current) => current.map((row) => (row.id === id
            ? { ...row, ...('partyId' in changes || 'date' in changes || 'type' in changes ? { exist: null, dupOk: false } : {}), ...changes, error: '' }
            : row)));

    const patchLine = (rowId: number, key: number, changes: Partial<Line>) =>
        setRows((current) => current.map((row) => (row.id === rowId
            ? { ...row, error: '', lines: row.lines.map((line) => (line.key === key ? { ...line, ...changes } : line)) }
            : row)));

    const remove = (id: number) => setRows((current) => current.filter((row) => row.id !== id));

    const rowIds = new Set(rows.map((row) => row.id));
    const pickedIds = picked.filter((id) => rowIds.has(id));
    const pickedSet = new Set(pickedIds);

    const togglePick = (id: number, shift: boolean, order: number[]) => {
        setPicked((current) => {
            if (shift && lastPicked.current !== null && order.includes(lastPicked.current)) {
                const a = order.indexOf(lastPicked.current);
                const b = order.indexOf(id);
                const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);

                return [...new Set([...current, ...range])];
            }

            return current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
        });
        lastPicked.current = id;
    };

    const pickMany = (ids: number[], on: boolean) =>
        setPicked((current) => (on ? [...new Set([...current, ...ids])] : current.filter((id) => ! ids.includes(id))));

    /** Change one field on every ticked row it makes sense for, and say how many were changed. */
    const applyToPicked = (label: string, change: (row: Row) => Partial<Row> | null) => {
        const targets = rows.filter((row) => pickedSet.has(row.id) && change(row) !== null);

        if (! targets.length) {
            setNotice(text('لا يوجد بين الصفوف المحددة ما ينطبق عليه «' + label + '».', 'None of the ticked rows can take “' + label + '”.'));

            return;
        }

        const ids = new Set(targets.map((row) => row.id));

        setRows((current) => current.map((row) => (ids.has(row.id) ? { ...row, ...(change(row) ?? {}), error: '' } : row)));
        setNotice(text('طُبّق «' + label + '» على ' + targets.length + ' من ' + pickedIds.length + ' صف محدد.', 'Applied “' + label + '” to ' + targets.length + ' of ' + pickedIds.length + ' ticked rows.'));
    };

    const copyPickedTo = (target: string) => {
        if (! validDate(target) || target > today) {
            return;
        }

        setRows((current) => [
            ...current,
            ...current.filter((row) => pickedSet.has(row.id)).map((row) => ({
                ...row,
                id: nextId++,
                date: target,
                error: '',
                merged: false,
                exist: null,
                dupOk: false,
                lines: row.lines.map((line) => ({ ...line, key: nextKey++ })),
                extra: row.extra.map((part) => ({ ...part, key: nextKey++ })),
            })),
        ]);
        setSelected((current) => (current.includes(target) ? current : [...current, target]));
        setNotice(text('نُسخ ' + pickedIds.length + ' صف إلى ' + target, 'Copied ' + pickedIds.length + ' rows to ' + target));
    };

    const applyBulk = () => {
        const value = bulkValue.trim();

        switch (bulkField) {
            case 'date':
                if (! validDate(value) || value > today) {
                    return;
                }

                applyToPicked(text('التاريخ', 'Date'), () => ({ date: value }));
                setSelected((current) => (current.includes(value) ? current : [...current, value]));
                break;
            case 'type':
                applyToPicked(text('النوع', 'Type'), (row) => (value && value !== row.type
                    ? {
                        type: value as RowType,
                        partyId: null,
                        staffKind: value === 'attendance' ? 'present' : 'advance',
                        stock: ['purchase', 'sale', 'misc'].includes(value),
                        lines: META[value as RowType].invoice && ! row.lines.length ? [newLine()] : row.lines,
                    }
                    : null));
                break;
            case 'party': {
                const [side, id] = value.split(':');

                applyToPicked(text('الطرف', 'Party'), (row) => (META[row.type].party === side && id ? { partyId: Number(id) } : null));
                break;
            }
            case 'category':
                applyToPicked(text('التصنيف', 'Category'), (row) => (row.type === 'petty' && value ? { cat: value } : null));
                break;
            case 'method':
                applyToPicked(text('طريقة الدفع', 'Payment method'), (row) => (META[row.type].pay && value ? { method: value as Method, chequeId: null } : null));
                break;
            case 'amount':
                applyToPicked(text('المبلغ', 'Amount'), (row) => (! META[row.type].invoice && row.type !== 'attendance' && num(value) > 0 ? { amt: String(num(value)) } : null));
                break;
            case 'discount':
                applyToPicked(text('الخصم', 'Discount'), (row) => (META[row.type].invoice ? { disc: value } : null));
                break;
            case 'notes':
                applyToPicked(text('الملاحظات', 'Notes'), () => ({ notes: value }));
                break;
            case 'copy':
                copyPickedTo(value);
                break;
            default:
                break;
        }
    };

    useEffect(() => {
        if (! pickedIds.length) {
            return;
        }

        const escape = (event: KeyboardEvent): void => {
            if (event.key === 'Escape' && ! (event.target as HTMLElement | null)?.closest('wa-select, [role="dialog"]')) {
                setPicked([]);
            }
        };

        document.addEventListener('keydown', escape);

        return () => document.removeEventListener('keydown', escape);
    }, [pickedIds.length]);

    // Rows keep the order the user gave them inside a day (drag to reorder); only the days are sorted.
    const sortedRows = useMemo(
        () => [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
        [rows],
    );

    const [addType, setAddType] = useState<RowType | ''>('');
    const [addCount, setAddCount] = useState(1);

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

    /**
     * Keyboard movement inside an invoice's lines: Enter goes product, quantity, price, then the next line's product
     * (a new line is added after the last one); up and down keep the same column on the line above or below.
     */
    const lineKey = (event: React.KeyboardEvent, row: Row, index: number, field: 'p' | 'q' | 'r') => {
        const target = (line: Line | undefined, column: 'p' | 'q' | 'r') => (line ? `${row.id}:${line.key}:${column}` : null);
        let next: string | null = null;

        if (event.key === 'Enter') {
            if (field === 'p') {
                next = target(row.lines[index], 'q');
            } else if (field === 'q') {
                next = target(row.lines[index], 'r');
            } else if (row.lines[index + 1]) {
                next = target(row.lines[index + 1], 'p');
            } else {
                const created = newLine();

                setRows((current) => current.map((candidate) => (candidate.id === row.id ? { ...candidate, lines: [...candidate.lines, created] } : candidate)));
                next = target(created, 'p');
            }
        } else if (field !== 'p' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            next = target(row.lines[index + (event.key === 'ArrowDown' ? 1 : -1)], field);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            // Columns run product, quantity, price from the reading start; in a right-to-left page that start is the right edge.
            const columns: Array<'p' | 'q' | 'r'> = ['p', 'q', 'r'];
            const rtl = document.documentElement.dir === 'rtl';
            const forward = (event.key === 'ArrowLeft') === rtl;
            const input = event.target instanceof HTMLInputElement ? event.target : null;
            // Inside a number box the arrows move the caret until it reaches the edge in that direction.
            const atEdge = ! input || (event.key === 'ArrowLeft'
                ? input.selectionStart === 0 && input.selectionEnd === 0
                : input.selectionStart === input.value.length && input.selectionEnd === input.value.length);
            const column = columns[columns.indexOf(field) + (forward ? 1 : -1)];

            if (atEdge && column) {
                next = target(row.lines[index], column);
            }
        }

        if (next === null) {
            return;
        }

        event.preventDefault();
        pendingLineFocus.current = next;
        safeFocus(container.current?.querySelector<HTMLElement>(`[data-lf="${next}"]`));
    };

    const chooseProduct = async (row: Row, line: Line, productId: number | null) => {
        patchLine(row.id, line.key, { productId });
        const product = productId ? productById.get(productId) : null;

        // A price the user typed by hand stays; one the system filled in follows the newly chosen product.
        if (! product || (line.price !== '' && line.typed !== false)) {
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

        patchLine(row.id, line.key, { productId, price: String(Number(price) || 0), typed: false });
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

    const duplicateDay = (date: string, target: string) => {
        if (! validDate(target) || target > today || target === date) {
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
                exist: null,
                dupOk: false,
                lines: row.lines.map((line) => ({ ...line, key: nextKey++ })),
                extra: row.extra.map((part) => ({ ...part, key: nextKey++ })),
            })),
        ]);
        setSelected((current) => (current.includes(target) ? current : [...current, target]));
        setCollapsedDays((current) => current.filter((day) => day !== target));
        setCopyingDay(null);
    };

    /** Moves a row next to another one (or to the top of a day) and gives it that day's date. */
    const moveRow = (id: number, target: { rowId: number; after: boolean } | { day: string }) => {
        setRows((current) => {
            const moving = current.find((row) => row.id === id);

            if (! moving) {
                return current;
            }

            const rest = current.filter((row) => row.id !== id);

            if ('day' in target) {
                const first = rest.findIndex((row) => row.date === target.day);
                const placed = { ...moving, date: target.day };

                return first < 0 ? [...rest, placed] : [...rest.slice(0, first), placed, ...rest.slice(first)];
            }

            const index = rest.findIndex((row) => row.id === target.rowId);

            if (index < 0) {
                return current;
            }

            const placed = { ...moving, date: rest[index].date };

            return [...rest.slice(0, index + (target.after ? 1 : 0)), placed, ...rest.slice(index + (target.after ? 1 : 0))];
        });
    };

    /** Keyboard alternative to dragging: swap the row with its neighbour in the same day. */
    const nudgeRow = (row: Row, direction: -1 | 1) => {
        const siblings = sortedRows.filter((candidate) => candidate.date === row.date && (filter === 'all' || candidate.type === filter));
        const neighbour = siblings[siblings.indexOf(row) + direction];

        if (! neighbour) {
            return;
        }

        pendingGrip.current = row.id;
        setRows((current) => {
            const a = current.findIndex((candidate) => candidate.id === row.id);
            const b = current.findIndex((candidate) => candidate.id === neighbour.id);
            const next = [...current];

            [next[a], next[b]] = [next[b], next[a]];

            return next;
        });
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

    /** How many saved entries a type has since the "show from" date, and how many working days it still misses before its last entry. */
    const savedCount = (type: RowType): number => Object.values(progress?.[type]?.days ?? {}).reduce((sum, count) => sum + count, 0);
    const gapCount = (type: RowType): number => {
        const info = progress?.[type];

        if (! info?.last) {
            return 0;
        }

        let missing = 0;

        for (let cursor = from; cursor <= info.last; cursor = addDays(cursor, 1)) {
            if (! isWeekend(cursor) && ! info.days[cursor]) {
                missing++;
            }
        }

        return missing;
    };

    const addSelected = (days: string[]) => {
        setSelected((current) => [...new Set([...current, ...days])]);
        setRows((current) => {
            const have = new Set(current.map((row) => row.date));
            const type: RowType = filter === 'all' ? (visibleTypes[0] ?? 'sale') : filter;
            const extra = days.filter((day) => ! have.has(day)).flatMap((day) => [newRow(type, day), newRow(type, day)]);

            return extra.length ? [...current, ...extra] : current;
        });
    };

    /** Takes a day out of the selection and drops its empty placeholder rows; rows already filled stay. */
    const deselectDay = (day: string) => {
        const keptFilled = rows.some((row) => row.date === day && ! isUntouched(row));

        setSelected((current) => current.filter((value) => value !== day));
        setRows((current) => current.filter((row) => ! (row.date === day && isUntouched(row))));
        setPlan((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== day)));
        setNotice(keptFilled
            ? text(`أُزيل ${day} من التحديد، وبقيت صفوفه المعبأة في الجدول (احذفها بـ ✕ إن لم تُردها).`, `${day} was removed from the selection; its filled rows stay in the table (remove them with ✕ if you do not want them).`)
            : '');
    };

    const clearSelection = () => {
        const days = new Set(selected);
        const keptFilled = rows.some((row) => days.has(row.date) && ! isUntouched(row));

        setSelected([]);
        setActiveDay(null);
        setPlan({});
        setRows((current) => current.filter((row) => ! (days.has(row.date) && isUntouched(row))));
        setNotice(keptFilled
            ? text('أُلغي تحديد الأيام، وبقيت الصفوف المعبأة في الجدول.', 'The day selection was cleared; filled rows stay in the table.')
            : '');
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
            deselectDay(day);
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

        days.forEach((day) => dayTypes(day).forEach((type) => {
            for (let i = 0; i < (plan[day]?.[type] ?? 0); i++) {
                created.push(newRow(type, day));
            }
        }));

        if (! created.length) {
            return;
        }

        setRows((current) => [...current.filter((row) => ! isUntouched(row)), ...created]);
        setCollapsedDays((current) => current.filter((day) => ! days.includes(day)));
        setNotice(text(`أنشأت ${created.length} صفاً على ${days.length} يوم`, `Created ${created.length} rows over ${days.length} days`));
    };

    const plannedOf = (day: string, type: RowType): number => plan[day]?.[type] ?? 0;

    /** The types chosen for one day only; every day keeps its own list, so adding or removing never touches another day. */
    const dayTypes = (day: string): RowType[] => visibleTypes.filter((type) => plan[day] !== undefined && type in plan[day]);

    const toggleDayType = (day: string, type: RowType) =>
        setPlan((current) => {
            const mine = { ...(current[day] ?? {}) };

            if (type in mine) {
                delete mine[type];
            } else {
                mine[type] = 1;
            }

            return { ...current, [day]: mine };
        });

    const setDayTypes = (day: string, types: RowType[]) =>
        setPlan((current) => ({ ...current, [day]: Object.fromEntries(types.map((type) => [type, current[day]?.[type] ?? 1])) }));

    const setPlanned = (day: string, type: RowType, value: number) =>
        setPlan((current) => ({ ...current, [day]: { ...current[day], [type]: value } }));

    /** Writes one day's counts onto every other selected day. */
    const repeatDay = (day: string) =>
        setPlan((current) => Object.fromEntries([...selected].map((other) => [other, other === day ? current[day] ?? {} : { ...(current[day] ?? {}) }])));

    /* ---------- undo (Ctrl+Z), duplicate row (Ctrl+D), "/" to change the type ---------- */
    const undoStack = useRef<Row[][]>([]);
    const previousRows = useRef<Row[]>([]);
    const undoing = useRef(false);
    const burstTimer = useRef<number | undefined>(undefined);
    const [undoCount, setUndoCount] = useState(0);

    useEffect(() => {
        if (undoing.current) {
            undoing.current = false;
            previousRows.current = rows;

            return;
        }

        if (previousRows.current !== rows) {
            // Typing in a box is one step, not one step per letter: a pause of 0.7s ends the step.
            if (burstTimer.current === undefined && previousRows.current.length > 0) {
                undoStack.current = [...undoStack.current.slice(-49), previousRows.current];
                setUndoCount(undoStack.current.length);
            }

            window.clearTimeout(burstTimer.current);
            burstTimer.current = window.setTimeout(() => {
                burstTimer.current = undefined;
            }, 700);
            previousRows.current = rows;
        }
    }, [rows]);

    const undo = () => {
        const previous = undoStack.current.pop();

        setUndoCount(undoStack.current.length);

        if (! previous) {
            return;
        }

        window.clearTimeout(burstTimer.current);
        burstTimer.current = undefined;
        undoing.current = true;
        setRows(previous);
        setNotice(text('تم التراجع عن آخر تعديل.', 'Last change undone.'));
    };

    const duplicateRow = (id: number) => {
        const created = nextId++;

        setRows((current) => {
            const index = current.findIndex((row) => row.id === id);

            if (index < 0) {
                return current;
            }

            const source = current[index];
            const copy: Row = {
                ...source,
                id: created,
                error: '',
                merged: false,
                exist: null,
                dupOk: false,
                lines: source.lines.map((line) => ({ ...line, key: nextKey++ })),
                extra: source.extra.map((part) => ({ ...part, key: nextKey++ })),
            };

            return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
        });
        pendingFocus.current = created;
        setNotice(text('نُسخ الصف.', 'Row duplicated.'));
    };

    const rowShortcuts = (event: React.KeyboardEvent<HTMLElement>): boolean => {
        const target = event.target as HTMLElement;
        const tag = target.tagName.toLowerCase();
        const typing = tag === 'textarea' || (tag === 'input' && ! ['checkbox', 'radio', 'button'].includes((target as HTMLInputElement).type));
        const tr = target.closest<HTMLTableRowElement>('tr[data-mainrow]');
        const modifier = event.ctrlKey || event.metaKey;

        if (modifier && event.key.toLowerCase() === 'z' && ! event.shiftKey && ! typing) {
            event.preventDefault();
            undo();

            return true;
        }

        if (modifier && event.key.toLowerCase() === 'd' && tr) {
            event.preventDefault();
            duplicateRow(Number(tr.dataset.mainrow));

            return true;
        }

        if (event.key === '/' && tr && ! modifier && (! typing || (target as HTMLInputElement).value === '')) {
            const typeBox = tr.querySelector<HTMLElement>('[data-typecell]');

            if (typeBox) {
                event.preventDefault();
                typeBox.focus();

                return true;
            }
        }

        return false;
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
                amount: META[row.type].invoice && row.full ? undefined : mainPay(row),
                full: META[row.type].invoice && row.full ? true : undefined,
                method: row.method,
                extra: row.extra.length
                    ? row.extra.map((part) => ({
                        method: part.method,
                        amount: num(part.amt),
                        endorsed_movement_id: part.method === 'check' && part.chequeId ? part.chequeId : undefined,
                        check_number: part.method === 'check' && ! part.chequeId ? part.checkNo : undefined,
                        check_bank: part.method === 'check' && ! part.chequeId ? part.checkBank || undefined : undefined,
                        check_due_date: part.method === 'check' && ! part.chequeId ? part.checkDue : undefined,
                    }))
                    : undefined,
                endorsed_movement_id: row.method === 'check' && row.chequeId ? row.chequeId : undefined,
                check_number: row.method === 'check' && ! row.chequeId ? row.checkNo : undefined,
                check_bank: row.method === 'check' && ! row.chequeId ? row.checkBank || undefined : undefined,
                check_due_date: row.method === 'check' && ! row.chequeId ? row.checkDue : undefined,
            }
            : undefined;

        if (! META[row.type].invoice) {
            return { ...base, party_id: row.partyId, payment, settlement_discount: num(row.disc) || undefined };
        }

        const percent = row.disc.trim().endsWith('%');

        return {
            ...base,
            party_id: row.type === 'misc' ? null : row.partyId,
            lines: row.lines.filter(completeLine).map((line) => ({ product_id: line.productId, quantity: num(line.qty), unit_price: num(line.price) })),
            affects_stock: row.stock,
            tax_rule_id: row.taxRuleId ?? undefined,
            discount_type: percent ? 'percent' : 'fixed',
            discount_value: percent ? num(row.disc.trim().slice(0, -1)) : num(row.disc),
            payment: row.type === 'misc' ? undefined : (payOf(row) > 0 ? payment : undefined),
        };
    };

    /** Opens the "what is missing" explanation of a row and scrolls to the first row that needs attention. */
    const toggleFlag = (id: number, force?: boolean) =>
        setRows((current) => current.map((row) => {
            if (row.id !== id) {
                return row;
            }

            const next = force ?? ! row.flag;

            return { ...row, flag: next, open: row.open || (next && issuesOf(row).some((issue) => issue.key === 'lines' || issue.key === 'check')) };
        }));

    const scrollToIncomplete = () => {
        window.setTimeout(() => container.current?.querySelector('[data-incomplete]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
    };

    const save = async () => {
        const ready = sortedRows.filter(isReady);
        const incomplete = sortedRows.filter((row) => ! isReady(row));

        // Rows that cannot be saved yet are never skipped silently: each one shows exactly what it lacks.
        if (incomplete.length) {
            const ids = new Set(incomplete.map((row) => row.id));

            setRows((current) => current.map((row) => (ids.has(row.id)
                ? { ...row, flag: true, open: row.open || issuesOf(row).some((issue) => issue.key === 'lines' || issue.key === 'check') }
                : row)));
            scrollToIncomplete();
        }

        if (! ready.length) {
            setNotice('');
            setError(text(
                `لا توجد صفوف جاهزة للحفظ (${incomplete.length} ناقص). ما ينقص كل صف مكتوب تحته بالأحمر، والحقول الناقصة معلَّمة.`,
                `No rows are ready to save (${incomplete.length} incomplete). What each row still needs is written under it in red, and the missing fields are marked.`,
            ));

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
                .map((row) => (failed.has(row.id) ? { ...row, error: failed.get(row.id) ?? '', open: true, flag: true } : row)));
            if (failed.size) {
                scrollToIncomplete();
            }
            setSelected((current) => current.filter((day) => rows.some((row) => row.date === day && ! saved.has(row.id))));
            loadCheques();
            loadProgress();
            loadBalances();
            setNotice(text(
                `تم حفظ ${saved.size} صف${merged ? ` (منها ${merged} ضُمّت لفاتورة اليوم)` : ''}${failed.size ? `، وتعذّر ${failed.size} (سبب الرفض مكتوب تحت كل صف أحمر)` : ''}${incomplete.length ? `، وبقي ${incomplete.length} ناقصاً لم يُحفظ (ما ينقصه مكتوب تحته)` : ''}. الصفوف التي لم تُحفظ بقيت كما أدخلتها.`,
                `Saved ${saved.size} row(s)${merged ? ` (${merged} merged into the day's invoice)` : ''}${failed.size ? `, ${failed.size} rejected (the reason is written under each red row)` : ''}${incomplete.length ? `, ${incomplete.length} incomplete and not saved (what they lack is written under them)` : ''}. Rows that were not saved are kept as you typed them.`,
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
        safeFocus(container.current?.querySelector<HTMLElement>(`[data-row="${id}"][data-main]`));
    });

    useEffect(() => {
        const target = pendingLineFocus.current;

        if (target === null) {
            return;
        }

        pendingLineFocus.current = null;
        safeFocus(container.current?.querySelector<HTMLElement>(`[data-lf="${target}"]`));
    });

    useEffect(() => {
        if (dupRowId === null) {
            return;
        }

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setDupRowId(null);
            }
        };

        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    }, [dupRowId]);

    useEffect(() => {
        const id = pendingGrip.current;

        if (id === null) {
            return;
        }

        pendingGrip.current = null;
        container.current?.querySelector<HTMLElement>(`[data-grip="${id}"]`)?.focus();
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
        safeFocus(inputs[inputs.indexOf(event.target as HTMLElement) + 1]);
    };

    /*
     * Spreadsheet-style movement. Up/Down jump to the same column in the row above or below (across days
     * too), Left/Right to the next cell, PageUp/PageDown to the previous or next day. In a text box the
     * arrows only leave when it is empty or fully selected, so typing and editing keep working; Ctrl+arrow
     * moves from any cell, including the dropdowns and date boxes where the arrows have their own meaning.
     */
    const navigateTable = (event: React.KeyboardEvent<HTMLElement>) => {
        if (rowShortcuts(event)) {
            return;
        }

        const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'];

        if (! keys.includes(event.key) || event.altKey || event.shiftKey || event.metaKey) {
            return;
        }

        const target = event.target as HTMLElement;
        const tr = target.closest<HTMLTableRowElement>('tr[data-mainrow]');
        const cell = target.closest<HTMLTableCellElement>('td');

        if (! tr || ! cell || (target as unknown as { open?: boolean }).open) {
            return;
        }

        const tag = target.tagName.toLowerCase();
        const input = tag === 'input' ? (target as HTMLInputElement) : null;
        const textual = input !== null && ! ['date', 'checkbox', 'radio', 'time', 'datetime-local', 'month', 'week'].includes(input.type);
        const ctrl = event.ctrlKey;
        const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
        const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
        const paging = event.key === 'PageUp' || event.key === 'PageDown';

        if (! ctrl) {
            if (paging && ! textual && tag !== 'button' && tag !== 'span') {
                // PageUp/PageDown inside a dropdown or date box keep their own meaning.
                return;
            }

            if (vertical && ! textual) {
                return;
            }

            if (horizontal) {
                if (! textual) {
                    return;
                }

                const whole = input.selectionStart === 0 && input.selectionEnd === input.value.length;

                if (input.value !== '' && ! whole) {
                    return;
                }
            }
        }

        const rtl = document.documentElement.dir === 'rtl';
        const rowsList = Array.from(container.current?.querySelectorAll<HTMLTableRowElement>('tr[data-mainrow]') ?? []);
        const rowIndex = rowsList.indexOf(tr);
        const column = Array.from(tr.children).indexOf(cell);
        let nextRow = rowIndex;
        let nextColumn = column;

        if (event.key === 'ArrowDown') {
            nextRow = rowIndex + 1;
        } else if (event.key === 'ArrowUp') {
            nextRow = rowIndex - 1;
        } else if (paging) {
            const day = tr.dataset.day;

            if (event.key === 'PageDown') {
                nextRow = rowsList.findIndex((row, index) => index > rowIndex && row.dataset.day !== day);
            } else {
                // The first row of the previous day.
                const before = rowsList.slice(0, rowIndex).reverse().find((row) => row.dataset.day !== day);

                nextRow = before ? rowsList.findIndex((row) => row.dataset.day === before.dataset.day) : -1;
            }
        } else if (horizontal) {
            // In a right-to-left page the first column is on the right, so Left means the next column.
            const forward = rtl ? event.key === 'ArrowLeft' : event.key === 'ArrowRight';

            nextColumn = column + (forward ? 1 : -1);
        }

        if (nextRow < 0 || nextRow >= rowsList.length || nextColumn < 0) {
            return;
        }

        const focusableIn = (row: HTMLTableRowElement, index: number): HTMLElement | null => {
            const td = row.children[index];

            return td
                ? td.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]), wa-select:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [role="button"]')
                : null;
        };

        const destination = rowsList[nextRow];
        let found: HTMLElement | null = null;

        // Walk outward from the wanted column to the nearest cell that can take focus.
        for (let offset = 0; offset <= destination.children.length && ! found; offset++) {
            const order = horizontal ? [offset * (nextColumn >= column ? 1 : -1)] : [offset, -offset];

            for (const delta of order) {
                found = focusableIn(destination, nextColumn + delta);

                if (found) {
                    break;
                }
            }

            if (horizontal) {
                break;
            }
        }

        if (! found) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        safeFocus(found);

        if (found instanceof HTMLInputElement && ! ['date', 'checkbox'].includes(found.type)) {
            window.setTimeout(() => found instanceof HTMLInputElement && found.select(), 0);
        }
    };

    /* ---------- derived ---------- */
    const filteredRows = sortedRows.filter((row) => filter === 'all' || row.type === filter);
    const dates = [...new Set(filteredRows.map((row) => row.date))];
    const readyCount = rows.filter(isReady).length;
    const selectedDays = [...selected].sort();
    const matrixTypes = visibleTypes.filter((type) => selectedDays.some((day) => dayTypes(day).includes(type)));
    const matrixTotal = selectedDays.reduce((sum, day) => sum + dayTypes(day).reduce((inner, type) => inner + plannedOf(day, type), 0), 0);
    const currentDay = activeDay && selected.includes(activeDay) ? activeDay : (selectedDays[0] ?? null);
    const currentTypes = currentDay ? dayTypes(currentDay) : [];
    const dupRow = dupRowId === null ? null : (rows.find((row) => row.id === dupRowId) ?? null);
    const duplicates = (row: Row): boolean =>
        (row.type === 'sale' || row.type === 'purchase') && !! row.partyId
        && rows.some((other) => other.id < row.id && other.type === row.type && other.partyId === row.partyId && other.date === row.date);

    /* ---------- warn when the system already holds this party's entry for the day ---------- */
    const existingKey = (row: Row): string | null => {
        if (! validDate(row.date) || row.date > today) {
            return null;
        }

        if (row.type === 'sale' || row.type === 'purchase' || row.type === 'receipt' || row.type === 'payment') {
            return row.partyId ? `${row.type}|${row.partyId}|${row.date}` : null;
        }

        if (row.type === 'prod') {
            return row.productId ? `prod|${row.productId}|${row.date}` : null;
        }

        if (row.type === 'staff' || row.type === 'attendance') {
            return row.partyId ? `${row.type}|${row.partyId}|${row.date}` : null;
        }

        return row.type === 'misc' && totals(row).total > 0 ? `misc||${row.date}` : null;
    };

    useEffect(() => {
        rows.forEach((row) => {
            const key = existingKey(row);

            if (! key || askedExisting.current.has(`${row.id}|${key}`)) {
                return;
            }

            askedExisting.current.add(`${row.id}|${key}`);

            const query = new URLSearchParams({ type: row.type, date: row.date });

            if (['sale', 'purchase', 'receipt', 'payment'].includes(row.type) && row.partyId) {
                query.set('party_id', String(row.partyId));
            }

            if (row.type === 'prod' && row.productId) {
                query.set('product_id', String(row.productId));
            }

            if ((row.type === 'staff' || row.type === 'attendance') && row.partyId) {
                query.set('staff_id', String(row.partyId));
            }


            apiRequest<{ data: ExistingEntry[] }>(`/api/quick-entry/existing?${query.toString()}`)
                .then((response) => {
                    if (! response.data.length) {
                        return;
                    }

                    setRows((current) => current.map((candidate) => (candidate.id === row.id && existingKey(candidate) === key
                        ? { ...candidate, exist: response.data, dupOk: false }
                        : candidate)));
                    setDupRowId(row.id);
                })
                .catch(() => undefined);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows]);

    const daySums = (group: Row[]) => {
        const sums = { sales: 0, purchases: 0, received: 0, paid: 0, petty: 0 };

        group.forEach((row) => {
            if (row.type === 'sale') {
                sums.sales += totals(row).total;
                sums.received += payOf(row);
            } else if (row.type === 'misc') {
                sums.sales += totals(row).total;
                sums.received += totals(row).total;
            } else if (row.type === 'purchase') {
                sums.purchases += totals(row).total;
                sums.paid += payOf(row);
            } else if (row.type === 'receipt') {
                sums.received += payOf(row);
            } else if (row.type === 'payment') {
                sums.paid += payOf(row);
            } else if (row.type === 'petty') {
                sums.petty += num(row.amt);
            }
        });

        return sums;
    };

    function sumChips(group: Row[]) {
        const sums = daySums(group);
        const items: Array<[string, number, string]> = [
            [text('مبيعات', 'Sales'), sums.sales, ''],
            [text('مشتريات', 'Purchases'), sums.purchases, ''],
            [text('مقبوض', 'Received'), sums.received, 'text-emerald-600'],
            [text('مدفوع', 'Paid'), sums.paid, 'text-red-600'],
            [text('نثريات', 'Petty'), sums.petty, ''],
        ];
        const visible = items.filter(([, value]) => value > 0);

        if (! visible.length) {
            return <span className="text-xs font-normal text-[var(--ac-text-muted)]">{text('لا مبالغ بعد', 'No amounts yet')}</span>;
        }

        const chip = 'inline-flex items-baseline gap-1 rounded-full border border-[var(--ac-line)] bg-[var(--ac-surface)] px-2.5 py-0.5 text-[11px] font-normal text-[var(--ac-text-muted)]';

        return (
            <>
                {visible.map(([label, value, tone]) => (
                    <span key={label} className={chip}>{label} <b className={'font-bold tabular-nums text-[var(--ac-text)] ' + tone}>{money(value)}</b></span>
                ))}
                <span className={chip}>{text('صافي النقد', 'Net cash')} <b className="font-bold tabular-nums text-[var(--ac-text)]">{money(sums.received - sums.paid - sums.petty)}</b></span>
            </>
        );
    }

    /* ---------- render ---------- */
    /* How a row moves what the party owes us (positive = they owe us), before it is saved. */
    function balanceEffect(row: Row): number {
        const meta = META[row.type];

        if (meta.invoice) {
            const net = totals(row).total - payOf(row);

            return row.type === 'sale' ? net : row.type === 'purchase' ? -net : 0;
        }

        if (row.type === 'receipt') {
            return -(num(row.amt) + num(row.disc));
        }

        if (row.type === 'payment') {
            return num(row.amt) + num(row.disc);
        }

        return 0;
    }

    const formatNet = (value: number): string =>
        Math.abs(value) < 0.005
            ? text('الحساب مسوّى', 'Settled')
            : value > 0
                ? text(`لي عليه ${money(value)}`, `They owe ${money(value)}`)
                : text(`له علي ${money(-value)}`, `We owe ${money(-value)}`);

    function balanceChip(row: Row) {
        const saved = row.partyId ? balances[row.partyId] : undefined;

        if (! row.partyId || ! saved || ! ['sale', 'purchase', 'receipt', 'payment'].includes(row.type)) {
            return null;
        }

        const current = saved.owed_to_us - saved.we_owe;
        const pending = rows
            .filter((other) => other.partyId === row.partyId && ['sale', 'purchase', 'receipt', 'payment'].includes(other.type))
            .reduce((sum, other) => sum + balanceEffect(other), 0);
        const after = current + pending;
        const tone = (value: number): string => Math.abs(value) < 0.005 ? 'text-[var(--ac-text-muted)]' : value > 0 ? 'text-emerald-700' : 'text-red-600';

        return (
            <div className="mt-1 space-y-0.5 text-[11px] leading-4" title={text('الرصيد المحفوظ الآن، وبعد حفظ كل الصفوف المكتوبة لهذا الطرف. لا يتغير شيء قبل الحفظ.', 'Saved balance now, and after saving every row typed for this party. Nothing changes before you save.')}>
                <div className="text-[var(--ac-text-muted)]">{text('الآن: ', 'Now: ')}<b className={tone(current)}>{formatNet(current)}</b></div>
                {Math.abs(pending) >= 0.005 && (
                    <div className="text-[var(--ac-text-muted)]">{text('بعد الحفظ: ', 'After saving: ')}<b className={tone(after)}>{formatNet(after)}</b></div>
                )}
            </div>
        );
    }

    function partySelect(row: Row) {
        const meta = META[row.type];

        if (meta.party) {
            return (
                <>
                    <Select data-main data-row={row.id} className={field + bad(row, 'party')} value={row.partyId ?? ''} onChange={(event) => patch(row.id, { partyId: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">{meta.party === 'c' ? text('اسم العميل', 'Customer') : text('اسم المورد', 'Supplier')}</option>
                        {(meta.party === 'c' ? customers : suppliers).map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
                    </Select>
                    {balanceChip(row)}
                </>
            );
        }

        if (row.type === 'misc') {
            return <span className="text-xs text-[var(--ac-text-muted)]">{text('عميل متفرقات (نقداً)', 'Walk-in customer (cash)')}</span>;
        }

        if (row.type === 'petty') {
            return (
                <Select data-main data-row={row.id} className={field} value={row.cat} onChange={(event) => patch(row.id, { cat: event.target.value })}>
                    {CATEGORIES.map(([value, arabic, english]) => <option key={value} value={value}>{text(arabic, english)}</option>)}
                </Select>
            );
        }

        if (row.type === 'prod') {
            return (
                <Select data-main data-row={row.id} className={field + bad(row, 'product')} value={row.productId ?? ''} onChange={(event) => patch(row.id, { productId: event.target.value ? Number(event.target.value) : null })}>
                    <option value="">{text('المنتج النهائي', 'Finished product')}</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </Select>
            );
        }

        const roster = row.type === 'attendance' ? attendanceStaff : staff;

        return (
            <Select data-main data-row={row.id} className={field + bad(row, 'employee')} value={row.partyId ?? ''} onChange={(event) => patch(row.id, { partyId: event.target.value ? Number(event.target.value) : null })}>
                <option value="">{text('الموظف', 'Employee')}</option>
                {roster.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </Select>
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
                    {! meta.invoice && (
                        <label className="col-span-2 text-[11px] font-bold text-[var(--ac-text-muted)]">
                            {row.type === 'receipt' ? text('خصم على الباقي (مبلغ، اختياري)', 'Discount on what is left (amount, optional)') : text('خصم مكتسب على الباقي (مبلغ، اختياري)', 'Discount received on what is left (amount, optional)')}
                            <input className={field + ' mt-1 text-left'} dir="ltr" inputMode="decimal" placeholder="0" value={row.disc} onChange={(event) => patch(row.id, { disc: event.target.value })} />
                            <span className="mt-1 block text-[10px] font-normal">
                                {text('لا يُحسب تلقائياً: تكتبه أنت فقط. يُوزَّع على فواتير الطرف المفتوحة من الأقدم فتُغلق، مثلاً عليه 3725 دفع 3600 فاكتب 125.', 'Never automatic: only what you type. It is spread over the party\'s open invoices from the oldest so they close, e.g. owes 3725, pays 3600, type 125.')}
                            </span>
                        </label>
                    )}
                    {meta.invoice && (
                        <label className="text-[11px] font-bold text-[var(--ac-text-muted)]">
                            {text('الخصم (5% أو مبلغ)', 'Discount (5% or amount)')}
                            <input className={field + ' mt-1 text-left'} dir="ltr" value={row.disc} placeholder="0" onChange={(event) => patch(row.id, { disc: event.target.value })} />
                        </label>
                    )}
                    {meta.invoice && row.type !== 'misc' && taxRulesFor(row).length > 0 && (
                        <label className="col-span-2 text-[11px] font-bold text-[var(--ac-text-muted)]">
                            {text('الضريبة', 'Tax')}
                            <Select className={field + ' mt-1'} value={row.taxRuleId ?? ''} onChange={(event) => patch(row.id, { taxRuleId: event.target.value ? Number(event.target.value) : null })}>
                                <option value="">{text('بدون ضريبة إضافية', 'No extra tax')}</option>
                                {taxRulesFor(row).map((rule) => <option key={rule.id} value={rule.id}>{rule.name} ({num(rule.rate)}%{rule.inclusive ? text('، شاملة', ', inclusive') : ''})</option>)}
                            </Select>
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
                                    value={row.full ? money(mainPay(row)) : row.pay}
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
                        <Select className={field + ' mt-1'} value={row.method} onChange={(event) => { patch(row.id, { method: event.target.value as Method, chequeId: null }); if (event.target.value === 'check') { loadCheques(); } }}>
                            <option value="cash">{text('نقدي', 'Cash')}</option>
                            <option value="check">{text('شيك', 'Check')}</option>
                            <option value="transfer">{text('تحويل', 'Transfer')}</option>
                        </Select>
                    </label>
                    {row.method === 'check' && meta.party === 's' && (
                        <label className="col-span-2 text-[11px] font-bold text-[var(--ac-text-muted)]">
                            <span className="flex items-center justify-between">
                                {text('شيك من شيكاتي (تجيير)', 'Check on hand (endorse)')}
                                <button type="button" className="text-[11px] font-bold text-[var(--ac-accent)]" onClick={loadCheques}>{text('تحديث القائمة', 'Refresh list')}</button>
                            </span>
                            <Select className={field + ' mt-1'} value={row.chequeId ?? ''} onChange={(event) => chooseCheque(row, event.target.value)}>
                                <option value="">{text('شيك جديد (أكتب بياناته)', 'New check (enter details)')}</option>
                                {dueCheques.map((cheque) => (
                                    <option key={cheque.id} value={cheque.id}>
                                        {(cheque.check_number || cheque.number) + ' — ' + (cheque.party_name ?? '') + ' — ' + text('يستحق ', 'due ') + (cheque.check_due_date ?? '') + ' — ' + money(Number(cheque.amount))}
                                    </option>
                                ))}
                            </Select>
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
                                <input className={field + ' mt-1 text-left' + bad(row, 'check')} dir="ltr" value={row.checkNo} onChange={(event) => patch(row.id, { checkNo: event.target.value })} />
                            </label>
                            <label className="col-span-2 text-[11px] font-bold text-[var(--ac-text-muted)]">
                                {text('البنك (يميّز شيكين بنفس الرقم من بنكين)', 'Bank (tells apart two checks with the same number)')}
                                <input className={field + ' mt-1'} value={row.checkBank} onChange={(event) => patch(row.id, { checkBank: event.target.value })} />
                            </label>
                            <label className="text-[11px] font-bold text-[var(--ac-text-muted)]">
                                {text('تاريخ الاستحقاق', 'Due date')}
                                <input type="date" className={field + ' mt-1' + bad(row, 'check')} dir="ltr" min="2000-01-01" value={row.checkDue} onChange={(event) => patch(row.id, { checkDue: event.target.value })} />
                            </label>
                        </>
                    )}
                </div>

                {row.extra.map((part, index) => (
                    <div key={part.key} className="mt-3 rounded-[12px] border border-dashed border-[var(--ac-line)] p-2.5">
                        <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-[var(--ac-text-muted)]">
                            <span>{text(`دفعة إضافية ${index + 2}`, `Extra payment ${index + 2}`)}</span>
                            <button type="button" aria-label={text('حذف الدفعة', 'Remove payment')} className="p-1 text-red-500" onClick={() => patch(row.id, { extra: row.extra.filter((other) => other.key !== part.key) })}><X size={14} /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            <label className="text-[11px] font-bold text-[var(--ac-text-muted)]">
                                {text('الطريقة', 'Method')}
                                <Select className={field + ' mt-1'} value={part.method} onChange={(event) => { patch(row.id, { extra: row.extra.map((other) => (other.key === part.key ? { ...other, method: event.target.value as Method, chequeId: null } : other)) }); if (event.target.value === 'check') { loadCheques(); } }}>
                                    <option value="cash">{text('نقدي', 'Cash')}</option>
                                    <option value="check">{text('شيك', 'Check')}</option>
                                    <option value="transfer">{text('تحويل', 'Transfer')}</option>
                                </Select>
                            </label>
                            <label className="text-[11px] font-bold text-[var(--ac-text-muted)]">
                                {text('المبلغ', 'Amount')}
                                <input className={field + ' mt-1 text-left'} dir="ltr" inputMode="decimal" placeholder="0" value={part.amt} onChange={(event) => patch(row.id, { extra: row.extra.map((other) => (other.key === part.key ? { ...other, amt: event.target.value } : other)) })} />
                            </label>
                            {part.method === 'check' && meta.party === 's' && (
                                <label className="col-span-2 text-[11px] font-bold text-[var(--ac-text-muted)]">
                                    {text('شيك من شيكاتي (تجيير)', 'Check on hand (endorse)')}
                                    <Select
                                        className={field + ' mt-1'}
                                        value={part.chequeId ?? ''}
                                        onChange={(event) => {
                                            const cheque = cheques.find((candidate) => String(candidate.id) === event.target.value);

                                            patch(row.id, { extra: row.extra.map((other) => (other.key === part.key
                                                ? { ...other, chequeId: cheque ? cheque.id : null, checkNo: cheque?.check_number ?? '', checkDue: cheque?.check_due_date ?? '', amt: cheque ? String(Number(cheque.amount)) : other.amt }
                                                : other)) });
                                        }}
                                    >
                                        <option value="">{text('شيك جديد (أكتب بياناته)', 'New check (enter details)')}</option>
                                        {dueCheques
                                            .filter((cheque) => cheque.id !== row.chequeId && ! row.extra.some((other) => other.key !== part.key && other.chequeId === cheque.id))
                                            .map((cheque) => (
                                                <option key={cheque.id} value={cheque.id}>
                                                    {(cheque.check_number || cheque.number) + ' — ' + (cheque.party_name ?? '') + ' — ' + text('يستحق ', 'due ') + (cheque.check_due_date ?? '') + ' — ' + money(Number(cheque.amount))}
                                                </option>
                                            ))}
                                    </Select>
                                </label>
                            )}
                            {part.method === 'check' && ! part.chequeId && (
                                <>
                                    <label className="text-[11px] font-bold text-[var(--ac-text-muted)]">
                                        {text('رقم الشيك', 'Check number')}
                                        <input className={field + ' mt-1 text-left'} dir="ltr" value={part.checkNo} onChange={(event) => patch(row.id, { extra: row.extra.map((other) => (other.key === part.key ? { ...other, checkNo: event.target.value } : other)) })} />
                                    </label>
                                    <label className="col-span-2 text-[11px] font-bold text-[var(--ac-text-muted)]">
                                        {text('البنك', 'Bank')}
                                        <input className={field + ' mt-1'} value={part.checkBank} onChange={(event) => patch(row.id, { extra: row.extra.map((other) => (other.key === part.key ? { ...other, checkBank: event.target.value } : other)) })} />
                                    </label>
                                    <label className="text-[11px] font-bold text-[var(--ac-text-muted)]">
                                        {text('تاريخ الاستحقاق', 'Due date')}
                                        <input type="date" className={field + ' mt-1'} dir="ltr" min="2000-01-01" value={part.checkDue} onChange={(event) => patch(row.id, { extra: row.extra.map((other) => (other.key === part.key ? { ...other, checkDue: event.target.value } : other)) })} />
                                    </label>
                                </>
                            )}
                        </div>
                    </div>
                ))}

                <button
                    type="button"
                    className={btnSecondary + ' mt-3'}
                    disabled={row.extra.length >= 10}
                    onClick={() => patch(row.id, { extra: [...row.extra, { key: nextKey++, method: 'check', amt: '', chequeId: null, checkNo: '', checkBank: '', checkDue: '' }] })}
                >
                    <Plus size={13} />{text('دفعة أخرى (نقدي أو شيك)', 'Another payment (cash or check)')}
                </button>
                {row.extra.length > 0 && (
                    <p className="mt-2 text-[11px] text-[var(--ac-text-muted)]">
                        {text('مجموع الدفعات: ', 'Total payments: ')}<b>{money(payOf(row))}</b>
                        {meta.invoice && totals(row).total > 0 && (
                            <>
                                {' · '}{payOf(row) > totals(row).total + 0.005 ? text('الفائض يسدد فواتير أقدم', 'Excess settles older invoices') : text('المتبقي: ', 'Left: ')}
                                {payOf(row) <= totals(row).total + 0.005 && <b>{money(Math.max(totals(row).total - payOf(row), 0))}</b>}
                            </>
                        )}
                    </p>
                )}
                <p className="mt-2 text-[11px] text-[var(--ac-text-muted)]">
                    {meta.invoice
                        ? text('الفائض عن الفاتورة يسدد فواتير أقدم، والباقي رصيد دفعة مقدمة.', 'Any excess settles older invoices; the rest stays as an advance.')
                        : text('يوزَّع تلقائياً على فواتير الطرف المفتوحة، والباقي دفعة مقدمة.', 'Allocated automatically to the party\'s open invoices; the rest stays as an advance.')}
                </p>
            </div>
        );
    }

    /** The row's party when it is both customer and supplier and the user may offset; otherwise null. */
    function offsetParty(row: Row) {
        if (! row.partyId || ! ['sale', 'purchase', 'receipt', 'payment'].includes(row.type) || ! (perms?.sales_manage && perms?.purchases_manage)) {
            return null;
        }

        const party = (lookups?.parties ?? []).find((candidate) => candidate.id === row.partyId);

        return party && party.roles.includes('customer') && party.roles.includes('supplier') ? party : null;
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
                            <LineCountField className={field + ' !w-16 text-center'} count={row.lines.length} onApply={(value) => makeLines(row, value)} />
                            {text('اكتب العدد وتُنشأ البنود تلقائياً', 'Type a number and the lines are created automatically')}
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
                                {row.lines.map((line, lineIndex) => (
                                    <tr key={line.key}>
                                        <td className="py-1 pe-1">
                                            <Select data-lf={`${row.id}:${line.key}:p`} onKeyDown={(event) => lineKey(event, row, lineIndex, 'p')} className={field + (bad(row, 'lines') && ! line.productId ? ' !border-red-500 !ring-1 !ring-red-300' : '')} value={line.productId ?? ''} onChange={(event) => void chooseProduct(row, line, event.target.value ? Number(event.target.value) : null)}>
                                                <option value="">{text('المنتج', 'Product')}</option>
                                                {products
                                                    .filter((product) => product.id === line.productId || (row.type === 'purchase' ? product.usage !== 'sale' : product.usage !== 'purchase'))
                                                    .map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                                            </Select>
                                        </td>
                                        <td className="py-1 pe-1"><input data-lf={`${row.id}:${line.key}:q`} onKeyDown={(event) => lineKey(event, row, lineIndex, 'q')} className={field + ' !w-20 text-left' + (bad(row, 'lines') && ! (num(line.qty) > 0) ? ' !border-red-500 !ring-1 !ring-red-300' : '')} dir="ltr" value={line.qty} onChange={(event) => patchLine(row.id, line.key, { qty: event.target.value })} /></td>
                                        <td className="py-1 pe-1"><input data-lf={`${row.id}:${line.key}:r`} onKeyDown={(event) => lineKey(event, row, lineIndex, 'r')} className={field + ' !w-24 text-left' + (bad(row, 'lines') && line.price === '' ? ' !border-red-500 !ring-1 !ring-red-300' : '')} dir="ltr" value={line.price} onChange={(event) => patchLine(row.id, line.key, { price: event.target.value, typed: event.target.value !== '' })} /></td>
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
                            <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--ac-text-muted)]">
                                <input type="checkbox" className="size-4" checked={row.stock} onChange={(event) => patch(row.id, { stock: event.target.checked })} />
                                {row.type === 'purchase' ? text('يُضاف للمخزون (للمنتجات المتتبَّعة)', 'Adds to stock (tracked products)') : text('يُخصم من المخزون (للمنتجات المتتبَّعة)', 'Deducts from stock (tracked products)')}
                            </label>
                            <span className="text-xs text-[var(--ac-text-muted)]">
                                {text('المجموع', 'Subtotal')} <b>{money(x.subtotal)}</b> · {text('الخصم', 'Discount')} <b>{money(x.discount)}</b> · {(x.tax > 0 || x.included > 0) && <>{text('الضريبة', 'Tax')} <b>{money(x.tax || x.included)}</b> · </>}{text('الإجمالي', 'Total')} <b>{money(x.total)}</b>
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
                            <Select className={field + ' mt-1'} value={row.staffKind} onChange={(event) => patch(row.id, { staffKind: event.target.value })}>
                                {STAFF_KINDS.map(([value, arabic, english]) => <option key={value} value={value}>{text(arabic, english)}</option>)}
                            </Select>
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
                <tr
                    data-mainrow={row.id}
                    data-day={row.date}
                    className={(row.error ? 'bg-red-500/5 ' : '') + (dragId === row.id ? 'opacity-40' : '')}
                    style={{
                        backgroundColor: `color-mix(in srgb, ${meta.color} ${pickedSet.has(row.id) ? 34 : 18}%, transparent)`,
                        ...(pickedSet.has(row.id) ? { outline: '2px solid var(--ac-accent)', outlineOffset: '-2px' } : {}),
                        ...(dropMark?.id === row.id && dropMark.where !== 'day'
                            ? { boxShadow: dropMark.where === 'before' ? 'inset 0 2px 0 var(--ac-accent)' : 'inset 0 -2px 0 var(--ac-accent)' }
                            : {}),
                    }}
                    onDragOver={(event) => {
                        if (dragId === null || dragId === row.id) {
                            return;
                        }

                        event.preventDefault();

                        const rect = event.currentTarget.getBoundingClientRect();

                        setDropMark({ id: row.id, where: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' });
                    }}
                    onDrop={(event) => {
                        if (dragId === null) {
                            return;
                        }

                        event.preventDefault();

                        const rect = event.currentTarget.getBoundingClientRect();

                        if (dragId !== row.id) {
                            moveRow(dragId, { rowId: row.id, after: event.clientY >= rect.top + rect.height / 2 });
                        }

                        setDragId(null);
                        setDropMark(null);
                    }}
                >
                    <td className="w-14 px-0.5" style={{ borderInlineStart: `6px solid ${meta.color}` }}>
                        <div className="flex items-center gap-1">
                        <input
                            type="checkbox"
                            className="size-4 shrink-0 cursor-pointer accent-[var(--ac-accent)]"
                            aria-label={text('تحديد الصف ' + (index + 1), 'Tick row ' + (index + 1))}
                            checked={pickedSet.has(row.id)}
                            onChange={() => undefined}
                            onClick={(event) => togglePick(row.id, event.shiftKey, filteredRows.map((candidate) => candidate.id))}
                        />
                        <span
                            role="button"
                            tabIndex={0}
                            draggable
                            data-grip={row.id}
                            title={text('اسحب لتغيير الترتيب', 'Drag to reorder')}
                            aria-label={text('تغيير ترتيب الصف: اسحب، أو استخدم السهمين للأعلى والأسفل', 'Reorder row: drag, or use the up and down arrow keys')}
                            className="inline-flex size-6 cursor-grab items-center justify-center rounded-md text-[var(--ac-text-muted)] hover:bg-[var(--ac-accent-soft,#e3eeff)] active:cursor-grabbing"
                            onDragStart={(event) => {
                                setDragId(row.id);
                                event.dataTransfer.effectAllowed = 'move';
                                event.dataTransfer.setData('text/plain', String(row.id));

                                const tr = event.currentTarget.closest('tr');

                                if (tr) {
                                    event.dataTransfer.setDragImage(tr, 24, 16);
                                }
                            }}
                            onDragEnd={() => {
                                setDragId(null);
                                setDropMark(null);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                                    event.preventDefault();
                                    nudgeRow(row, event.key === 'ArrowUp' ? -1 : 1);
                                }
                            }}
                        >
                            <GripVertical size={14} />
                        </span>
                        </div>
                    </td>
                    <td className="w-7 text-center text-xs text-[var(--ac-text-muted)]">{index + 1}</td>
                    <td className="px-1.5 py-1.5">
                        <Select data-typecell className={field + ' min-w-[112px] font-bold'} style={{ color: meta.color }} value={row.type} onChange={(event) => patch(row.id, { type: event.target.value as RowType, partyId: null, staffKind: event.target.value === 'attendance' ? 'present' : 'advance', stock: ['purchase', 'sale', 'misc'].includes(event.target.value), lines: META[event.target.value as RowType].invoice && ! row.lines.length ? [newLine()] : row.lines })}>
                            {visibleTypes.map((type) => <option key={type} value={type} data-color={META[type].color}>{typeName(type)}</option>)}
                        </Select>
                    </td>
                    <td className="px-1.5 py-1.5">
                        <CommitDate
                            label={text('التاريخ', 'Date')}
                            className={field + ' min-w-[128px]' + bad(row, 'date')}
                            value={row.date}
                            max={today}
                            onCommit={(next) => {
                                patch(row.id, { date: next });
                                setSelected((current) => [...new Set([...current, next])]);
                                setCollapsedDays((current) => current.filter((day) => day !== next));
                            }}
                        />
                    </td>
                    <td className="min-w-[160px] px-1.5 py-1.5">
                        {partySelect(row)}
                        {duplicates(row) && <div className="mt-1 inline-block rounded-[8px] bg-violet-500/10 px-2 py-0.5 text-[11px] font-bold text-violet-600">{text('ستُضمّ لفاتورة اليوم', 'Will merge into the day\'s invoice')}</div>}
                        {row.merged && <div className="mt-1 inline-block rounded-[8px] bg-violet-500/10 px-2 py-0.5 text-[11px] font-bold text-violet-600">{text('ضُمّت', 'Merged')}</div>}
                        {row.exist && (
                            <button type="button" className="mt-1 inline-flex items-center gap-1 rounded-[8px] bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700" onClick={() => setDupRowId(row.id)}>
                                <TriangleAlert size={12} />{text('يوجد إدخال سابق · راجع', 'Already entered · review')}
                            </button>
                        )}
                        {! row.exist && row.dupOk && (
                            <div className="mt-1 inline-block rounded-[8px] bg-violet-500/10 px-2 py-0.5 text-[11px] font-bold text-violet-600">
                                {meta.invoice ? text('مؤكَّدة: تُضمّ لفاتورة اليوم', 'Confirmed: merges into the day\'s invoice') : text('مؤكَّد: قيد إضافي', 'Confirmed: separate entry')}
                            </div>
                        )}
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
                            <Select data-main data-row={row.id} className={field} value={row.staffKind} onChange={(event) => patch(row.id, { staffKind: event.target.value })} onKeyDown={(event) => onEnter(event, row, true)}>
                                <option value="present">{text('حاضر', 'Present')}</option>
                                <option value="absent">{text('غائب', 'Absent')}</option>
                            </Select>
                        ) : (
                            <input data-main data-row={row.id} className={field + ' text-left' + bad(row, 'amount')} dir="ltr" placeholder={row.type === 'prod' ? text('الكمية', 'Quantity') : text('المبلغ', 'Amount')} value={row.amt} onChange={(event) => patch(row.id, { amt: event.target.value })} onKeyDown={(event) => onEnter(event, row, true)} />
                        )}
                    </td>
                    <td className="px-1.5 py-1.5 text-xs text-[var(--ac-text-muted)]">
                        {meta.invoice ? (meta.pay ? (payOf(row) > 0 ? money(payOf(row)) : text('بدون دفعة', 'No payment')) : text('نقداً فوراً', 'Cash now')) : meta.pay ? (row.method === 'check' ? text('شيك', 'Check') : row.method === 'transfer' ? text('تحويل', 'Transfer') : text('نقدي', 'Cash')) : '—'}
                    </td>
                    <td className="min-w-[150px] px-1.5 py-1.5">
                        {row.error
                            ? <button type="button" className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-start text-[11px] font-bold text-red-600" onClick={() => toggleFlag(row.id)}>{text('رفضه النظام · اضغط لترى السبب', 'Rejected · tap for the reason')}</button>
                            : missing.length
                                ? (
                                    <button type="button" title={text('اضغط لترى ما الناقص ولماذا', 'Tap to see what is missing and why')} className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-start text-[11px] font-bold text-amber-700" onClick={() => toggleFlag(row.id)}>
                                        {text('ينقص: ', 'Missing: ')}{missing[0]}{missing.length > 1 ? ` +${missing.length - 1}` : ''}
                                    </button>
                                )
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
                {(row.error || (row.flag && missing.length > 0)) && (
                    <tr data-incomplete className="bg-red-500/5">
                        <td />
                        <td />
                        <td colSpan={9} className="px-3 pb-3 pt-1">
                            <div className="rounded-[12px] border border-red-500/30 bg-red-500/10 p-3 text-sm text-[var(--ac-text)]">
                                {row.error && (
                                    <div className="mb-2">
                                        <b className="text-red-600">{text('رفض النظام هذا الصف:', 'The system rejected this row:')}</b> {row.error}
                                        <div className="mt-0.5 text-xs text-[var(--ac-text-muted)]">{text('صحّح ما ذُكر ثم اضغط «حفظ الجاهز» مرة ثانية. بقية بيانات الصف محفوظة كما كتبتها.', 'Fix what is mentioned, then press “Save ready” again. The rest of the row is kept as you typed it.')}</div>
                                    </div>
                                )}
                                {missing.length > 0 && (
                                    <>
                                        <b className="text-red-600">{text(`ما ينقص هذا الصف (${missing.length}):`, `What this row still needs (${missing.length}):`)}</b>
                                        <ul className="mt-1 space-y-1">
                                            {issuesOf(row).map((issue) => (
                                                <li key={issue.key} className="flex flex-wrap items-baseline gap-2">
                                                    <span className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{issue.label}</span>
                                                    <span className="text-xs text-[var(--ac-text-muted)]">{issue.why}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                                {! row.error && <button type="button" className={btnSecondary + ' mt-2'} onClick={() => toggleFlag(row.id, false)}>{text('إخفاء', 'Hide')}</button>}
                            </div>
                        </td>
                    </tr>
                )}
                {row.open && (
                    <tr className="bg-[var(--ac-surface-soft,#fafcff)]" style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 9%, var(--ac-surface))`, boxShadow: `inset 6px 0 0 ${meta.color}` }}>
                        <td />
                        <td />
                        <td colSpan={9} className="px-3 py-3">
                            {offsetParty(row) && <OffsetHint partyId={row.partyId as number} name={offsetParty(row)?.name ?? ''} ar={ar} />}
                            {detailPanel(row)}
                        </td>
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
                            {text('فواتير ودفعات ونثريات وإنتاج وموظفين في جدول واحد. اختر الأيام والأنواع، حدد عدد كل نوع في كل يوم على حدة، واملأ الجدول.', 'Invoices, payments, petty expenses, production and staff in one table. Pick the days and types, set the count of each type for each day separately, then fill the table.')}
                        </p>
                    </div>
                    <button type="button" className={btnPrimary} disabled={! rows.length || saving} onClick={() => void save()}>
                        <Save size={16} />{saving ? text('جارٍ الحفظ…', 'Saving…') : text(`حفظ الجاهز (${readyCount})`, `Save ready (${readyCount})`)}
                    </button>
                </header>

                {restored > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-sky-500/25 bg-sky-500/10 p-3 text-sm text-[var(--ac-text)]">
                        <span>{text(`استُعيد ${restored} صف من آخر مرة. تُحفظ مسودتك تلقائياً في هذا المتصفح، ولم تُرسل للنظام بعد حتى تضغط «حفظ الجاهز».`, `${restored} row(s) were restored from last time. Your draft is kept automatically in this browser and is not sent to the system until you press “Save ready”.`)}</span>
                        <span className="flex gap-2">
                            <button type="button" className={btnSecondary} onClick={() => setRestored(0)}>{text('تمام', 'OK')}</button>
                            <button type="button" className={btnSecondary} onClick={() => { setRows([]); setSelected([]); setRestored(0); }}>{text('تجاهل المسودة', 'Discard draft')}</button>
                        </span>
                    </div>
                )}
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
                                <div className="mb-2 flex flex-wrap gap-1 text-[11px] font-bold">
                                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700" title={text('مدخلات محفوظة في النظام منذ تاريخ «عرض من»', 'Entries saved in the system since the “show from” date')}>{savedCount(type)} {text('محفوظ', 'saved')}</span>
                                    {gapCount(type) > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700" title={text('أيام عمل قبل آخر إدخال ليس فيها إدخال من هذا النوع', 'Working days before the last entry with none of this type')}>{gapCount(type)} {text('يوم فراغ', 'gap days')}</span>}
                                    {rows.filter((row) => row.type === type).length > 0 && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-700" title={text('صفوف في الجدول لم تُحفظ بعد', 'Rows in the table not saved yet')}>{rows.filter((row) => row.type === type).length} {text('بالجدول', 'in table')}</span>}
                                </div>
                                <button type="button" className={btnSecondary + ' w-full justify-center'} onClick={() => continueFrom(type)}><Play size={13} />{text('تابع من هنا', 'Continue here')}</button>
                            </div>
                        );
                    })}
                </section>

                <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="min-w-0 space-y-3">
                        <nav className="flex flex-wrap gap-1 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-1.5" aria-label={text('نوع الإدخال', 'Entry type')}>
                            {(['all', ...visibleTypes] as Array<'all' | RowType>).map((type) => (
                                <button key={type} type="button" className={'inline-flex min-h-10 items-center gap-1.5 rounded-[11px] px-3 text-sm font-bold ' + (filter === type ? 'bg-[var(--ac-accent)] text-white' : 'text-[var(--ac-text-muted)]')} onClick={() => setFilter(type)}>
                                    {type !== 'all' && <span className="size-2 rounded-full" style={{ background: META[type].color }} />}
                                    {type === 'all' ? text('الكل', 'All') : typeName(type)}
                                    <span className={'rounded-full px-1.5 text-[11px] ' + (filter === type ? 'bg-white/25' : 'bg-[var(--ac-accent-soft,#e3eeff)] text-[var(--ac-accent)]')}>{rows.filter((row) => type === 'all' || row.type === type).length}</span>
                                </button>
                            ))}
                        </nav>

                        <section className={card + ' !border-2 !border-[var(--ac-accent)]'} aria-labelledby="qe-compose">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <h3 id="qe-compose" className="text-sm font-bold">{text('إضافة صفوف', 'Add rows')}</h3>
                                <span className="text-xs text-[var(--ac-text-muted)]">{text('لكل يوم أنواعه وأعداده الخاصة، ولا يتأثر بغيره.', 'Every day has its own types and counts and is never affected by the others.')}</span>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-2">
                                <div>
                                    <div className="mb-1.5 flex items-center justify-between gap-2">
                                        <p className="text-xs font-bold text-[var(--ac-text-muted)]">{text('الأيام المحددة', 'Selected days')}{selectedDays.length ? ` (${selectedDays.length})` : ''}</p>
                                        {selectedDays.length > 0 && <button type="button" className="text-xs font-bold text-[var(--ac-accent)] hover:underline" onClick={clearSelection}>{text('إلغاء التحديد', 'Clear selection')}</button>}
                                    </div>
                                    <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                                        {selectedDays.length ? selectedDays.map((day) => (
                                            <span key={day} className={'inline-flex items-center rounded-full border text-xs font-bold ' + (day === currentDay ? 'border-[var(--ac-accent)] bg-[var(--ac-accent)] text-white' : 'border-[var(--ac-line)] bg-[var(--ac-surface)] text-[var(--ac-text)]')}>
                                                <button type="button" aria-pressed={day === currentDay} aria-label={text(`تعديل أنواع وأعداد ${day}`, `Edit types and counts for ${day}`)} className="rounded-full px-2.5 py-1 hover:bg-black/10" onClick={() => setActiveDay(day)}>
                                                    <bdi dir="ltr">{day.slice(8)}/{day.slice(5, 7)}</bdi>
                                                    {dayTypes(day).length > 0 && <span className="ms-1.5 opacity-80">· {dayTypes(day).reduce((sum, type) => sum + plannedOf(day, type), 0)}</span>}
                                                </button>
                                                <button type="button" aria-label={text(`إزالة ${day}`, `Remove ${day}`)} className="rounded-full px-1.5 py-1 hover:bg-black/10" onClick={() => deselectDay(day)}>
                                                    <X size={12} />
                                                </button>
                                            </span>
                                        )) : <span className="text-xs text-[var(--ac-text-muted)]">{text('لم تحدد أياماً بعد. اختر من التقويم.', 'No days yet. Pick them from the calendar.')}</span>}
                                    </div>
                                    {currentDay && (
                                        <div className="mt-3">
                                                <button type="button" aria-expanded={typeMenu} className={btnSecondary + ' w-full justify-between'} onClick={() => setTypeMenu((open) => ! open)}>
                                                    <span>{text(`إضافة أنواع ليوم ${currentDay.slice(8)}/${currentDay.slice(5, 7)}`, `Add types to ${currentDay.slice(8)}/${currentDay.slice(5, 7)}`)}</span>
                                                    <ChevronDown size={16} className={typeMenu ? 'rotate-180' : ''} />
                                                </button>

                                                {typeMenu && (
                                                    <div className="mt-2 overflow-hidden rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)]">
                                                        <label className="flex items-center gap-2 border-b border-[var(--ac-line)] px-3">
                                                            <Search size={14} className="text-[var(--ac-text-muted)]" />
                                                            <input className="h-10 w-full bg-transparent text-sm outline-none" placeholder={text('ابحث عن نوع…', 'Search types…')} value={typeQuery} onChange={(event) => setTypeQuery(event.target.value)} />
                                                        </label>
                                                        <ul role="listbox" aria-multiselectable="true" className="max-h-[220px] overflow-y-auto">
                                                            {visibleTypes
                                                                .filter((type) => `${META[type].ar} ${META[type].en}`.toLowerCase().includes(typeQuery.trim().toLowerCase()))
                                                                .map((type) => {
                                                                    const on = currentTypes.includes(type);

                                                                    return (
                                                                        <li key={type} role="option" aria-selected={on}>
                                                                            <button type="button" className={'flex min-h-9 w-full items-center gap-2 px-3 text-start text-sm hover:bg-[var(--ac-accent-soft,#e3eeff)] ' + (on ? 'bg-[var(--ac-accent-soft,#eef4ff)]' : '')} onClick={() => toggleDayType(currentDay, type)}>
                                                                                <span className={'grid size-[18px] place-items-center rounded-[5px] border ' + (on ? 'border-[var(--ac-accent)] bg-[var(--ac-accent)] text-white' : 'border-[var(--ac-line)] bg-[var(--ac-surface)]')}>{on && <Check size={12} />}</span>
                                                                                <span className="size-2.5 rounded-full" style={{ background: META[type].color }} />
                                                                                <span className="flex-1">{typeName(type)}</span>
                                                                                <small className="text-[11px] text-[var(--ac-text-muted)]">{text(`حتى ${MAX_PER_DAY} في اليوم`, `up to ${MAX_PER_DAY} per day`)}</small>
                                                                            </button>
                                                                        </li>
                                                                    );
                                                                })}
                                                        </ul>
                                                        <div className="flex gap-2 border-t border-[var(--ac-line)] p-2">
                                                            <button type="button" className={btnSecondary} onClick={() => setDayTypes(currentDay, [...visibleTypes])}>{text('كل الأنواع لهذا اليوم', 'All types for this day')}</button>
                                                            <button type="button" className={btnSecondary} onClick={() => setDayTypes(currentDay, [])}>{text('مسح أنواع هذا اليوم', 'Clear this day')}</button>
                                                        </div>
                                                    </div>
                                                )}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    {currentDay ? (
                                        <div className="rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft,#f8fbff)] p-3">
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <button type="button" className={btnSecondary + ' !px-2'} aria-label={text('اليوم السابق', 'Previous day')} disabled={selectedDays.indexOf(currentDay) <= 0} onClick={() => setActiveDay(selectedDays[selectedDays.indexOf(currentDay) - 1])}>
                                                    {ar ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                                                </button>
                                                <div className="text-center text-sm font-bold">
                                                    {(ar ? DAYS_AR : DAYS_EN)[weekday(currentDay)]} <bdi dir="ltr">{currentDay.slice(8)}/{currentDay.slice(5, 7)}/{currentDay.slice(0, 4)}</bdi>
                                                    <div className="text-[11px] font-normal text-[var(--ac-text-muted)]">{text(`اليوم ${selectedDays.indexOf(currentDay) + 1} من ${selectedDays.length} · أنواع هذا اليوم فقط`, `Day ${selectedDays.indexOf(currentDay) + 1} of ${selectedDays.length} · types for this day only`)}</div>
                                                </div>
                                                <button type="button" className={btnSecondary + ' !px-2'} aria-label={text('اليوم التالي', 'Next day')} disabled={selectedDays.indexOf(currentDay) >= selectedDays.length - 1} onClick={() => setActiveDay(selectedDays[selectedDays.indexOf(currentDay) + 1])}>
                                                    {ar ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                                                </button>
                                            </div>

                                            <div className="mt-2 max-h-[240px] overflow-y-auto pe-1">
                                                {currentTypes.length === 0 ? (
                                                    <p className="text-xs text-[var(--ac-text-muted)]">{text('لم تُضف أنواعاً لهذا اليوم بعد. اضغط «إضافة أنواع لهذا اليوم».', 'No types added to this day yet. Press “Add types to this day”.')}</p>
                                                ) : currentTypes.map((type) => (
                                                    <div key={type} className="flex items-center gap-2 border-b border-[var(--ac-line)] py-1 last:border-b-0">
                                                        <span className="size-2.5 rounded-full" style={{ background: META[type].color }} />
                                                        <span className="flex-1 text-sm">{typeName(type)}</span>
                                                        <CountStepper value={plannedOf(currentDay, type)} label={`${typeName(type)} ${currentDay}`} onChange={(value) => setPlanned(currentDay, type, value)} />
                                                        <button type="button" aria-label={text(`إزالة ${typeName(type)} من هذا اليوم فقط`, `Remove ${typeName(type)} from this day only`)} title={text('إزالة من هذا اليوم فقط', 'Remove from this day only')} className="rounded-md p-1.5 text-red-500 hover:bg-red-500/10" onClick={() => toggleDayType(currentDay, type)}>
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>

                                            {currentTypes.length > 0 && (
                                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                                    <span className="text-xs text-[var(--ac-text-muted)]">{text('مجموع هذا اليوم', 'This day')}: <b className="text-[var(--ac-text)]">{currentTypes.reduce((sum, type) => sum + plannedOf(currentDay, type), 0)}</b></span>
                                                    {selectedDays.length > 1 && <button type="button" className={btnSecondary} title={text('ينسخ أنواع وأعداد هذا اليوم إلى كل الأيام المحددة', 'Copies this day\'s types and counts to every selected day')} onClick={() => repeatDay(currentDay)}>{text('كرّر على بقية الأيام', 'Repeat on the other days')}</button>}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="rounded-[14px] border border-dashed border-[var(--ac-line)] p-4 text-sm text-[var(--ac-text-muted)]">{text('اختر يوماً من التقويم أولاً، ثم أضف له أنواعه وأعدادها.', 'Pick a day from the calendar first, then add its types and counts.')}</p>
                                    )}
                                </div>
                            </div>

                            {selectedDays.length > 0 && matrixTypes.length > 0 && (
                                <div className="mt-3">
                                    <button type="button" className={btnSecondary} aria-expanded={showMatrix} onClick={() => setShowMatrix((open) => ! open)}>
                                        {showMatrix ? text('إخفاء جدول كل الأيام', 'Hide all-days table') : text('عرض جدول كل الأيام', 'Show all-days table')}
                                    </button>
                                    {showMatrix && (
                                        <div className="mt-2 max-h-[320px] overflow-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="text-xs font-bold text-[var(--ac-text-muted)]">
                                                        <th className="px-2 py-2 text-start">{text('اليوم', 'Day')}</th>
                                                        {matrixTypes.map((type) => (
                                                            <th key={type} className="px-2 py-2 text-center"><span className="me-1.5 inline-block size-2 rounded-full" style={{ background: META[type].color }} />{typeName(type)}</th>
                                                        ))}
                                                        <th className="px-2 py-2 text-center">{text('المجموع', 'Total')}</th>
                                                        <th />
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {selectedDays.map((day) => (
                                                        <tr key={day} className="border-t border-[var(--ac-line)]">
                                                            <th className="whitespace-nowrap px-2 py-1.5 text-start text-sm font-bold">{(ar ? DAYS_AR : DAYS_EN)[weekday(day)]} <bdi dir="ltr">{day.slice(8)}/{day.slice(5, 7)}</bdi></th>
                                                            {matrixTypes.map((type) => (
                                                                <td key={type} className="px-2 py-1.5 text-center">
                                                                    {dayTypes(day).includes(type) ? (
                                                                        <span className="inline-flex items-center gap-1">
                                                                            <CountStepper value={plannedOf(day, type)} label={`${typeName(type)} ${day}`} onChange={(value) => setPlanned(day, type, value)} />
                                                                            <button type="button" aria-label={text(`إزالة ${typeName(type)} من ${day} فقط`, `Remove ${typeName(type)} from ${day} only`)} className="rounded-md p-1 text-red-500 hover:bg-red-500/10" onClick={() => toggleDayType(day, type)}><X size={13} /></button>
                                                                        </span>
                                                                    ) : (
                                                                        <button type="button" className={btnSecondary} onClick={() => toggleDayType(day, type)}><Plus size={12} />{text('أضف', 'Add')}</button>
                                                                    )}
                                                                </td>
                                                            ))}
                                                            <td className="px-2 py-1.5 text-center font-bold tabular-nums">{dayTypes(day).reduce((sum, type) => sum + plannedOf(day, type), 0)}</td>
                                                            <td className="px-2 py-1.5">{selectedDays.length > 1 && <button type="button" className={btnSecondary} onClick={() => repeatDay(day)}>{text('كرّر على الباقي', 'Repeat on the rest')}</button>}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="border-t border-[var(--ac-line)] text-xs font-bold text-[var(--ac-text-muted)]">
                                                        <th className="px-2 py-2 text-start">{text('المجموع', 'Total')}</th>
                                                        {matrixTypes.map((type) => <td key={type} className="px-2 py-2 text-center tabular-nums">{selectedDays.reduce((sum, day) => sum + (dayTypes(day).includes(type) ? plannedOf(day, type) : 0), 0)}</td>)}
                                                        <td className="px-2 py-2 text-center tabular-nums">{matrixTotal}</td>
                                                        <td />
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            <button type="button" className={btnPrimary + ' mt-3 w-full justify-center'} disabled={! selected.length || ! matrixTotal} onClick={createRows}>
                                <MapPin size={15} />{text(`أنشئ ${matrixTotal} صف على ${selected.length} يوم`, `Create ${matrixTotal} rows over ${selected.length} days`)}
                            </button>
                        </section>

                        <div className="overflow-hidden rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)]">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ac-line)] bg-[var(--ac-accent-soft,#eef4ff)] px-4 py-2.5 text-xs text-[var(--ac-text-muted)]">
                                <span><kbd className="rounded border border-[var(--ac-line)] bg-white px-1.5">Enter</kbd> {text('الحقل التالي، وفي آخر حقل صف جديد بنفس اليوم والنوع. كل صف يحتفظ بتاريخه.', 'next field; in the last field a new row on the same day and type. Every row keeps its own date.')}</span>
                                <span className="text-[11px]">
                                    <kbd className="rounded border border-[var(--ac-line)] bg-white px-1.5">↑ ↓ ← →</kbd> {text('تنقّل بين الخلايا (Ctrl + سهم من أي خلية)', 'move between cells (Ctrl + arrow from any cell)')}
                                    {' · '}<kbd className="rounded border border-[var(--ac-line)] bg-white px-1.5">PgUp / PgDn</kbd> {text('اليوم السابق / التالي', 'previous / next day')}
                                </span>
                                <span className="flex flex-wrap gap-1.5">
                                    <button type="button" disabled={undoCount === 0} title="Ctrl+Z" className={btnSecondary + ' disabled:opacity-40'} onClick={undo}>{text('تراجع', 'Undo')}{undoCount > 0 ? ' (' + undoCount + ')' : ''}</button>
                                    <button type="button" className={btnSecondary} onClick={() => setCollapsedDays(dates)}>{text('طيّ الأيام', 'Collapse days')}</button>
                                    <button type="button" className={btnSecondary} onClick={() => setCollapsedDays([])}>{text('فتح الأيام', 'Open days')}</button>
                                    <button type="button" className={btnSecondary} onClick={() => setRows((current) => current.map((row) => ({ ...row, open: false })))}>{text('طيّ التفاصيل', 'Collapse details')}</button>
                                    <button type="button" className={btnSecondary} onClick={() => setRows((current) => current.map((row) => ({ ...row, open: true })))}>{text('توسيع التفاصيل', 'Expand details')}</button>
                                </span>
                            </div>

                            {filteredRows.length === 0 ? (
                                <div className="p-10 text-center text-sm text-[var(--ac-text-muted)]">
                                    <CalendarDays className="mx-auto mb-2" size={28} />
                                    {text('اختر يوماً أو أكثر من التقويم، حدد كم صفاً من كل نوع، واضغط «أنشئ الصفوف».', 'Pick one or more days from the calendar, set how many rows of each type, and press “Create rows”.')}
                                </div>
                            ) : (
                                <div className="overflow-x-auto" onKeyDown={navigateTable}>
                                    <table className="w-full text-start">
                                        <thead>
                                            <tr className="border-b border-[var(--ac-line)] text-[11px] font-bold text-[var(--ac-text-muted)]">
                                                <th className="px-1">
                                                    <input
                                                        type="checkbox"
                                                        className="size-4 cursor-pointer accent-[var(--ac-accent)]"
                                                        aria-label={text('تحديد كل الصفوف', 'Tick all rows')}
                                                        checked={filteredRows.length > 0 && filteredRows.every((row) => pickedSet.has(row.id))}
                                                        onChange={(event) => pickMany(filteredRows.map((row) => row.id), event.target.checked)}
                                                    />
                                                </th><th />
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

                                                const folded = collapsedDays.includes(date);

                                                return (
                                                    <Fragment key={date}>
                                                        <tr
                                                            className="bg-[var(--ac-accent-soft,#e3eeff)]"
                                                            style={dropMark?.where === 'day' && dropMark.id === date ? { boxShadow: 'inset 0 0 0 2px var(--ac-accent)' } : undefined}
                                                            onDragOver={(event) => {
                                                                if (dragId === null) {
                                                                    return;
                                                                }

                                                                event.preventDefault();
                                                                setDropMark({ id: date, where: 'day' });
                                                            }}
                                                            onDrop={(event) => {
                                                                if (dragId === null) {
                                                                    return;
                                                                }

                                                                event.preventDefault();
                                                                moveRow(dragId, { day: date });
                                                                setCollapsedDays((current) => current.filter((day) => day !== date));
                                                                setDragId(null);
                                                                setDropMark(null);
                                                            }}
                                                        >
                                                            <td colSpan={11} className="px-4 py-2">
                                                                <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
                                                                    <span className="flex flex-wrap items-center">
                                                                        <button
                                                                            type="button"
                                                                            aria-expanded={! folded}
                                                                            aria-label={folded ? text('فتح هذا اليوم', 'Open this day') : text('طيّ هذا اليوم', 'Collapse this day')}
                                                                            className="me-1 grid size-7 place-items-center rounded-md text-[var(--ac-accent)] hover:bg-[var(--ac-surface)]"
                                                                            onClick={() => setCollapsedDays((current) => (current.includes(date) ? current.filter((day) => day !== date) : [...current, date]))}
                                                                        >
                                                                            <ChevronDown size={16} className={folded ? (ar ? 'rotate-90' : '-rotate-90') : ''} />
                                                                        </button>
                                                                        <input
                                                                            type="checkbox"
                                                                            className="me-2 size-4 cursor-pointer accent-[var(--ac-accent)]"
                                                                            aria-label={text('تحديد صفوف هذا اليوم', 'Tick this day\'s rows')}
                                                                            checked={group.length > 0 && group.every((row) => pickedSet.has(row.id))}
                                                                            onChange={(event) => pickMany(group.map((row) => row.id), event.target.checked)}
                                                                        />
                                                                        {(ar ? DAYS_AR : DAYS_EN)[weekday(date)]}&nbsp;<bdi dir="ltr">{date.slice(8)}/{date.slice(5, 7)}/{date.slice(0, 4)}</bdi>
                                                                        <span className="ms-2 rounded-full bg-[var(--ac-surface)] px-2 py-0.5 text-[11px] text-[var(--ac-accent)]">{group.filter(isReady).length}/{group.length} {text('جاهز', 'ready')}</span>
                                                                        <span className="ms-2 text-xs font-normal text-[var(--ac-text-muted)]">{group.length} {text('صف', 'rows')} · {summary}</span>
                                                                    </span>
                                                                    <span className="flex items-center gap-1.5">
                                                                        {copyingDay === date ? (
                                                                            <>
                                                                                <CommitDate label={text('انسخ إلى يوم', 'Copy to day')} className={field + ' !h-8 w-[150px]'} value="" max={today} onCommit={(next) => duplicateDay(date, next)} />
                                                                                <button type="button" className={btnSecondary} onClick={() => setCopyingDay(null)}>{text('إلغاء', 'Cancel')}</button>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <Select aria-label={text('نوع الصف', 'Row type')} className={field + ' !h-8 min-w-[120px] font-bold'} value={addType || (filter === 'all' ? (visibleTypes[0] ?? 'sale') : filter)} onChange={(event) => setAddType(event.target.value as RowType)}>
                                                                                    {visibleTypes.map((type) => <option key={type} value={type} data-color={META[type].color}>{text(META[type].ar, META[type].en)}</option>)}
                                                                                </Select>
                                                                                <input type="number" min={1} max={50} dir="ltr" aria-label={text('عدد الصفوف', 'Number of rows')} title={text('عدد الصفوف', 'Number of rows')} className={field + ' !h-8 !w-16 text-center'} value={addCount} onChange={(event) => setAddCount(Math.min(50, Math.max(1, Number(event.target.value) || 1)))} />
                                                                                <button type="button" className={btnSecondary} onClick={() => { const type = (addType || (filter === 'all' ? (visibleTypes[0] ?? 'sale') : filter)) as RowType; for (let i = 0; i < addCount; i += 1) { addRowAt(date, type); } }}><Plus size={13} />{text('صف', 'Row')}</button>
                                                                                <button type="button" className={btnSecondary} onClick={() => setCopyingDay(date)}><Copy size={13} />{text('انسخ ليوم آخر', 'Copy to another day')}</button>
                                                                            </>
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{sumChips(group)}</div>
                                                            </td>
                                                        </tr>
                                                        {! folded && group.map((row, index) => mainRow(row, index, index === group.length - 1))}
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

                    <aside className="min-w-0 space-y-3 xl:sticky xl:top-3">
                        <section className={card}>
                            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><CalendarDays size={16} />{text('الأيام', 'Days')} {filter === 'all' ? text('(كل الأنواع)', '(all types)') : '— ' + typeName(filter)}</h3>
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <button type="button" aria-label={text('الشهر السابق', 'Previous month')} className={btnSecondary} onClick={() => setMonth(Math.max(1, month - 1))}>‹</button>
                                <b className="text-sm"><bdi dir="ltr">{String(month).padStart(2, '0')} / {year}</bdi></b>
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
                                    <Select className={field + ' mt-1'} value={weekend} onChange={(event) => setWeekend(event.target.value as typeof weekend)}>
                                        <option value="5">{text('الجمعة', 'Friday')}</option>
                                        <option value="5,6">{text('الجمعة والسبت', 'Friday & Saturday')}</option>
                                        <option value="">{text('لا يوجد', 'None')}</option>
                                    </Select>
                                </label>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <button type="button" className={btnSecondary} onClick={pickGaps}>{text('حدد أيام الفراغ في الشهر', 'Select gaps this month')}</button>
                                <button type="button" className={btnSecondary} onClick={() => setSelected([...new Set(rows.map((row) => row.date))])}>{text('أزل غير المستخدم', 'Clear unused')}</button>
                                <button type="button" className={btnSecondary} onClick={clearSelection}>{text('إلغاء التحديد', 'Clear selection')}</button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {selected.length
                                    ? [...selected].sort().map((day) => (
                                        <button key={day} type="button" className="rounded-full bg-[var(--ac-accent-soft,#e3eeff)] px-2.5 py-0.5 text-xs font-bold text-[var(--ac-accent)]" onClick={() => toggleDay(day, false)}><bdi dir="ltr">{day.slice(8)}/{day.slice(5, 7)}</bdi> ✕</button>
                                    ))
                                    : <span className="text-xs text-[var(--ac-text-muted)]">{text('لم تحدد أياماً بعد', 'No days selected yet')}</span>}
                            </div>
                        </section>
                    </aside>
                </div>

                {dupRow && dupRow.exist && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDupRowId(null)}>
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="qe-dup-title"
                            className="max-h-[88vh] w-full max-w-[560px] overflow-auto rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-xl"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <h3 id="qe-dup-title" className="mb-2 flex items-center gap-2 text-lg font-bold text-[var(--ac-text)]">
                                <TriangleAlert className="text-amber-600" size={20} />{text('يوجد إدخال سابق لنفس اليوم', 'Already entered for this day')}
                            </h3>
                            <p className="mb-3 text-sm text-[var(--ac-text)]">
                                {dupRow.type === 'misc'
                                    ? text('متفرقات مسجّلة بتاريخ ', 'Walk-in sales recorded on ')
                                    : dupRow.type === 'prod'
                                            ? `${productById.get(dupRow.productId ?? 0)?.name ?? ''} — ${text('إنتاج مسجّل بتاريخ ', 'production recorded on ')}`
                                            : dupRow.type === 'staff' || dupRow.type === 'attendance'
                                                ? `${[...staff, ...attendanceStaff].find((member) => member.id === dupRow.partyId)?.name ?? ''} — ${text(`لديه ${typeName(dupRow.type)} مسجّل بتاريخ `, `already has a ${typeName(dupRow.type)} on `)}`
                                                : `${[...customers, ...suppliers].find((party) => party.id === dupRow.partyId)?.name ?? ''} — ${text(`لديه ${typeName(dupRow.type)} مسجّل بتاريخ `, `already has a ${typeName(dupRow.type)} on `)}`}
                                <bdi dir="ltr">{dupRow.date.slice(8)}/{dupRow.date.slice(5, 7)}/{dupRow.date.slice(0, 4)}</bdi>
                            </p>
                            {(() => {
                                const mine = new Set(dupRow.lines.filter((line) => line.productId).map((line) => productById.get(line.productId as number)?.name));
                                const shared = [...new Set(dupRow.exist.flatMap((entry) => entry.lines.map((line) => line.name)).filter((name) => name && mine.has(name)))];

                                return shared.length > 0
                                    ? <p className="mb-2 rounded-[10px] bg-amber-500/15 px-3 py-1.5 text-sm font-bold text-amber-700">{text('منتجات موجودة فعلاً في إدخال اليوم: ', 'Products already in this day\'s entry: ')}{shared.join('، ')}</p>
                                    : null;
                            })()}
                            <div className="space-y-2">
                                {dupRow.exist.map((entry, index) => (
                                    <div key={`${entry.number ?? 'entry'}-${index}`} className="rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-3">
                                        <div className="flex items-baseline gap-2 text-sm">
                                            <b>{entry.number ?? entry.label ?? '—'}</b>
                                            {entry.number && entry.label && <span className="text-xs text-[var(--ac-text-muted)]">{entry.label}</span>}
                                            {entry.method && <span className="text-xs text-[var(--ac-text-muted)]">{entry.method === 'check' ? `${text('شيك', 'Check')} ${entry.check_number ?? ''}` : entry.method === 'cash' ? text('نقدي', 'Cash') : entry.method === 'bank_transfer' ? text('تحويل', 'Transfer') : entry.method}</span>}
                                            <b className="ms-auto tabular-nums">{money(Number(entry.amount))}</b>
                                        </div>
                                        {entry.lines.length > 0 && (
                                            <table className="mt-2 w-full text-xs">
                                                <thead>
                                                    <tr className="text-[10px] font-bold text-[var(--ac-text-muted)]">
                                                        <th className="py-1 text-start">{text('المنتج', 'Product')}</th>
                                                        <th className="py-1 text-start">{text('الكمية', 'Qty')}</th>
                                                        <th className="py-1 text-start">{text('السعر', 'Price')}</th>
                                                        <th className="py-1 text-start">{text('الإجمالي', 'Total')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {entry.lines.map((line, lineIndex) => (
                                                        <tr key={lineIndex}>
                                                            <td className="py-0.5">{line.name ?? '—'}{line.name && dupRow.lines.some((mine) => mine.productId && productById.get(mine.productId)?.name === line.name) && <span className="ms-1.5 rounded-full bg-amber-500/15 px-1.5 text-[10px] font-bold text-amber-700">{text('موجود في إدخالك', 'in your entry')}</span>}</td>
                                                            <td className="py-0.5 tabular-nums">{money(Number(line.quantity))}</td>
                                                            <td className="py-0.5 tabular-nums">{money(Number(line.unit_price))}</td>
                                                            <td className="py-0.5 tabular-nums">{money(Number(line.total))}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {(() => {
                                const mine = META[dupRow.type].invoice ? totals(dupRow).total : num(dupRow.amt);

                                return mine > 0 && dupRow.exist.some((entry) => Math.abs(Number(entry.amount) - mine) < 0.005)
                                    ? <p className="mt-2 rounded-[10px] bg-amber-500/15 px-3 py-1.5 text-sm font-bold text-amber-700">{text(`المبلغ الذي أدخلته (${money(mine)}) يطابق إدخالاً سابقاً.`, `The amount you typed (${money(mine)}) matches an earlier entry.`)}</p>
                                    : null;
                            })()}
                            <p className="mt-3 text-xs text-[var(--ac-text-muted)]">
                                {META[dupRow.type].invoice
                                    ? text('إن كانت نفس الفاتورة فلا حاجة لإدخال بنودها. وإن كانت مختلفة فتُضمّ تلقائياً لفاتورة نفس الطرف في ذلك اليوم.', 'If it is the same invoice there is no need to enter its lines. If it differs, it merges into that party\'s invoice for the day.')
                                    : text('إن كان نفس القيد فلا حاجة لإدخاله مرة ثانية. وإن كان مختلفاً فيُسجَّل كقيد إضافي.', 'If it is the same entry there is no need to enter it again. If it differs, it is saved as a separate entry.')}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <button type="button" autoFocus className="min-h-11 flex-1 rounded-[12px] bg-red-600 px-4 text-sm font-bold text-white" onClick={() => { remove(dupRow.id); setDupRowId(null); }}>
                                    {text('نفسه — احذف هذا الصف', 'Same — remove this row')}
                                </button>
                                {(dupRow.type !== 'prod' || ! dupRow.exist.some((entry) => Math.abs(Number(entry.amount) - num(dupRow.amt)) < 0.00005)) && <button type="button" className={btnPrimary + ' flex-1 justify-center'} onClick={() => { patch(dupRow.id, { exist: null, dupOk: true }); setDupRowId(null); }}>
                                    {META[dupRow.type].invoice ? text('مختلف — أضِفه (يُضمّ تلقائياً)', 'Different — add it (merges)') : text('مختلف — أبقِه كقيد إضافي', 'Different — keep as separate entry')}
                                </button>}
                            </div>
                            <p className="mt-3 text-[11px] text-[var(--ac-text-muted)]">{text('Esc يغلق النافذة، وتبقى علامة «يوجد إدخال سابق» على الصف لتراجعه لاحقاً.', 'Esc closes this window; the row keeps an “already entered” mark so you can review it later.')}</p>
                        </div>
                    </div>
                )}
            </main>
            {pickedIds.length > 0 && (
                <div
                    role="toolbar"
                    aria-label={text('تعديل جماعي للصفوف المحددة', 'Bulk edit of the ticked rows')}
                    className="fixed inset-x-3 bottom-4 z-[60] mx-auto flex max-w-[980px] flex-wrap items-center gap-2 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-2.5 shadow-2xl"
                >
                    <span className="rounded-full bg-[var(--ac-accent)] px-3 py-1 text-xs font-bold text-white">{pickedIds.length} {text('محدد', 'selected')}</span>

                    <Select className={field + ' !w-44'} value={bulkField} onChange={(event) => { setBulkField(event.target.value); setBulkValue(''); }}>
                        <option value="">{text('عدّل الحقل…', 'Edit field…')}</option>
                        <option value="date">{text('التاريخ', 'Date')}</option>
                        <option value="type">{text('النوع', 'Type')}</option>
                        <option value="party">{text('الطرف', 'Party')}</option>
                        <option value="category">{text('تصنيف النثريات', 'Petty category')}</option>
                        <option value="method">{text('طريقة الدفع', 'Payment method')}</option>
                        <option value="amount">{text('المبلغ / الكمية', 'Amount / quantity')}</option>
                        <option value="discount">{text('خصم الفاتورة', 'Invoice discount')}</option>
                        <option value="notes">{text('الملاحظات', 'Notes')}</option>
                        <option value="copy">{text('نسخ إلى يوم', 'Copy to a day')}</option>
                    </Select>

                    {bulkField === 'date' || bulkField === 'copy' ? (
                        <input type="date" className={field + ' !w-40'} dir="ltr" max={today} min="2000-01-01" value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} />
                    ) : bulkField === 'type' ? (
                        <Select className={field + ' !w-44'} value={bulkValue} onChange={(event) => setBulkValue(event.target.value)}>
                            <option value="">{text('اختر النوع', 'Pick a type')}</option>
                            {visibleTypes.map((type) => <option key={type} value={type} data-color={META[type].color}>{typeName(type)}</option>)}
                        </Select>
                    ) : bulkField === 'party' ? (
                        <Select className={field + ' !w-56'} value={bulkValue} onChange={(event) => setBulkValue(event.target.value)}>
                            <option value="">{text('اختر الطرف', 'Pick a party')}</option>
                            {customers.map((party) => <option key={'c' + party.id} value={'c:' + party.id}>{text('عميل: ', 'Customer: ')}{party.name}</option>)}
                            {suppliers.map((party) => <option key={'s' + party.id} value={'s:' + party.id}>{text('مورد: ', 'Supplier: ')}{party.name}</option>)}
                        </Select>
                    ) : bulkField === 'category' ? (
                        <Select className={field + ' !w-44'} value={bulkValue} onChange={(event) => setBulkValue(event.target.value)}>
                            <option value="">{text('اختر التصنيف', 'Pick a category')}</option>
                            {CATEGORIES.map(([value, arabic, english]) => <option key={value} value={value}>{text(arabic, english)}</option>)}
                        </Select>
                    ) : bulkField === 'method' ? (
                        <Select className={field + ' !w-36'} value={bulkValue} onChange={(event) => setBulkValue(event.target.value)}>
                            <option value="">{text('اختر الطريقة', 'Pick a method')}</option>
                            <option value="cash">{text('نقدي', 'Cash')}</option>
                            <option value="check">{text('شيك', 'Check')}</option>
                            <option value="transfer">{text('تحويل', 'Transfer')}</option>
                        </Select>
                    ) : bulkField ? (
                        <input className={field + ' !w-44' + (bulkField === 'amount' || bulkField === 'discount' ? ' text-left' : '')} dir={bulkField === 'notes' ? undefined : 'ltr'} placeholder={bulkField === 'discount' ? '5% / 20' : bulkField === 'amount' ? '0' : text('اكتب النص', 'Type the text')} value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { applyBulk(); } }} />
                    ) : null}

                    {bulkField && (
                        <button type="button" className={btnPrimary + ' !min-h-9'} disabled={! bulkValue.trim()} onClick={applyBulk}>{bulkField === 'copy' ? text('انسخ', 'Copy') : text('طبّق على المحدد', 'Apply to ticked')}</button>
                    )}

                    <span className="ms-auto flex items-center gap-1.5">
                        <button type="button" className={btnSecondary} onClick={() => setRows((current) => current.map((row) => (pickedSet.has(row.id) ? { ...row, open: true } : row)))}>{text('فتح التفاصيل', 'Open details')}</button>
                        <button type="button" className={btnSecondary} onClick={() => setRows((current) => current.map((row) => (pickedSet.has(row.id) ? { ...row, open: false } : row)))}>{text('طيّ', 'Fold')}</button>
                        <button
                            type="button"
                            className={btnSecondary + ' !border-red-300 !text-red-600'}
                            onClick={() => {
                                if (window.confirm(text('حذف ' + pickedIds.length + ' صف محدد؟ لم تُحفظ بعد، فتختفي من الجدول فقط.', 'Delete ' + pickedIds.length + ' ticked rows? They are not saved yet, so they only leave the table.'))) {
                                    setRows((current) => current.filter((row) => ! pickedSet.has(row.id)));
                                    setPicked([]);
                                }
                            }}
                        >
                            <X size={13} />{text('حذف المحدد', 'Delete ticked')}
                        </button>
                        <button type="button" className={btnSecondary} onClick={() => setPicked([])}>{text('إلغاء التحديد', 'Clear')}</button>
                    </span>
                </div>
            )}
        </AppShell>
    );
}
