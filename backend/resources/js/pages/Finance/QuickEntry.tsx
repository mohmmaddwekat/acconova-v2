import { AppShell } from '@/layouts/AppShell';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import {
    ChevronDown,
    ChevronUp,
    Plus,
    Save,
    X,
    Zap,
} from 'lucide-react';
import {
    Fragment,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { apiErrorText } from './shared';
import type { FinanceLookups, LookupProduct } from './types';

type RowType = 'sale' | 'purchase' | 'misc' | 'receipt' | 'payment';
type Method = 'cash' | 'transfer' | 'check';

type Line = {
    key: number;
    productId: number | null;
    name: string;
    qty: string;
    price: string;
    auto: boolean;
};

type Row = {
    id: number;
    type: RowType;
    date: string;
    ref: string;
    partyId: number | null;
    party: string;
    lines: Line[];
    discount: string;
    pay: string;
    full: boolean;
    method: Method;
    checkNo: string;
    checkDue: string;
    open: boolean;
    error: string;
};

type OpenDoc = { n: string; d: string; bal: number };

type Plan = {
    total: number;
    sub: number;
    disc: number;
    tax: number;
    pay: number;
    remInv: number;
    excess: number;
    allocations: { n: string; d: string; amount: number; full: boolean }[];
    advance: number;
    snapshot: OpenDoc[];
    before: number;
    after: number;
};

type SaveResult = {
    index: number;
    ok: boolean;
    message?: string;
    document_number?: string;
    allocated?: string;
    advance?: string;
};

const TYPE_META: Record<RowType, { ar: string; en: string; side: 'sale' | 'purchase'; invoice: boolean }> = {
    sale: { ar: 'فاتورة بيع', en: 'Sales invoice', side: 'sale', invoice: true },
    purchase: { ar: 'فاتورة شراء', en: 'Purchase invoice', side: 'purchase', invoice: true },
    misc: { ar: 'متفرقات', en: 'Walk-in sale', side: 'sale', invoice: true },
    receipt: { ar: 'قبض', en: 'Receipt', side: 'sale', invoice: false },
    payment: { ar: 'دفع', en: 'Payment', side: 'purchase', invoice: false },
};

const TYPE_ORDER: RowType[] = ['sale', 'purchase', 'misc', 'receipt', 'payment'];

const num = (value: string | number): number => {
    const parsed = Number(String(value).replace(/[^\d.-]/g, ''));

    return Number.isFinite(parsed) ? parsed : 0;
};

const fmt = (value: number): string =>
    (Math.round(value * 100) / 100).toLocaleString('en');

const normalize = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[ً-ٰٟ]/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .trim();

function parseDate(value: string, year: number): { iso: string; display: string } | null {
    const match = value.trim().replace(/[.-]/g, '/').match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);

    if (! match) {
        return null;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const fullYear = match[3]
        ? (match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]))
        : year;
    const date = new Date(fullYear, month - 1, day);

    if (
        date.getFullYear() !== fullYear
        || date.getMonth() !== month - 1
        || date.getDate() !== day
        || fullYear < 2000
    ) {
        return null;
    }

    const pad = (n: number): string => String(n).padStart(2, '0');

    return {
        iso: `${fullYear}-${pad(month)}-${pad(day)}`,
        display: `${pad(day)}/${pad(month)}/${fullYear}`,
    };
}

function nextNumber(value: string): string {
    const match = value.match(/^(.*?)(\d+)$/);

    return match
        ? match[1] + String(Number(match[2]) + 1).padStart(match[2].length, '0')
        : '';
}

function parseDiscount(value: string): { percent: boolean; amount: number } {
    return {
        percent: /%/.test(value),
        amount: num(value),
    };
}

let sequence = 0;
const newLine = (): Line => ({ key: ++sequence, productId: null, name: '', qty: '', price: '', auto: false });
const newRow = (type: RowType, seed?: Partial<Row>): Row => ({
    id: ++sequence,
    type,
    date: '',
    ref: '',
    partyId: null,
    party: '',
    lines: TYPE_META[type].invoice ? [newLine()] : [],
    discount: '',
    pay: '',
    full: false,
    method: 'cash',
    checkNo: '',
    checkDue: '',
    open: false,
    error: '',
    ...seed,
});

const btnSecondary =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-surface)] px-4 text-sm font-semibold transition hover:bg-[var(--ac-bg-soft)] disabled:cursor-not-allowed disabled:opacity-45';
const btnPrimary =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--ac-text)] px-5 text-sm font-semibold text-white shadow-[var(--ac-shadow-soft)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0';
const cellInput =
    'h-11 w-full min-w-0 bg-transparent px-3 text-sm text-[var(--ac-text)] outline-none placeholder:text-[var(--ac-text-faint)] focus:bg-[var(--ac-surface)] focus:ring-2 focus:ring-inset focus:ring-[var(--ac-accent)] disabled:text-[var(--ac-text-muted)]';
const badRing = ' !ring-2 !ring-inset !ring-red-500 bg-red-500/10';
const field =
    'h-9 w-full rounded-[9px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2.5 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)] focus:ring-2 focus:ring-[var(--ac-accent)]/15';

function badge(tone: 'green' | 'amber' | 'red' | 'blue' | 'gray', label: string) {
    const tones = {
        green: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
        amber: 'border-amber-500/20 bg-amber-500/10 text-amber-500',
        red: 'border-red-500/20 bg-red-500/10 text-red-500',
        blue: 'border-blue-500/20 bg-blue-500/10 text-blue-500',
        gray: 'border-[var(--ac-line)] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]',
    };

    return (
        <span className={'inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ' + tones[tone]}>
            {label}
        </span>
    );
}

export default function QuickEntry() {
    const ar = useLocale() === 'ar';
    const text = (arabic: string, english: string): string => (ar ? arabic : english);
    const container = useRef<HTMLDivElement>(null);
    const pendingFocus = useRef<{ id: number; field: string } | null>(null);
    const year = new Date().getFullYear();

    const [lookups, setLookups] = useState<FinanceLookups | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [filter, setFilter] = useState<'all' | RowType>('all');
    const [dateYear, setDateYear] = useState(year);
    const [openDocs, setOpenDocs] = useState<Record<string, OpenDoc[]>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        apiRequest<FinanceLookups>('/api/finance/lookups')
            .then((response) => {
                setLookups(response);
                const first: RowType = response.permissions.sales_manage ? 'sale' : 'purchase';
                setRows([newRow(first)]);
            })
            .catch((failure) => setError(apiErrorText(failure)));
    }, []);

    const allowed = useMemo(() => {
        const p = lookups?.permissions;

        return {
            sale: !! p?.sales_manage,
            purchase: !! p?.purchases_manage,
            misc: !! p?.sales_manage && !! p?.cash_receive,
            receipt: !! p?.cash_receive,
            payment: !! p?.cash_pay,
        } as Record<RowType, boolean>;
    }, [lookups]);

    const parties = useMemo(() => ({
        sale: (lookups?.parties ?? []).filter((party) => party.roles.includes('customer')),
        purchase: (lookups?.parties ?? []).filter((party) => party.roles.includes('supplier')),
    }), [lookups]);

    const products = lookups?.products ?? [];
    const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
    const taxOf = (productId: number | null): number =>
        productId ? num(productById.get(productId)?.tax_rate ?? 0) : 0;

    /* ---------- calculations ---------- */
    const invoiceTotals = useCallback((row: Row) => {
        const nets = row.lines.map((line) => num(line.qty) * num(line.price));
        const sub = nets.reduce((sum, value) => sum + value, 0);
        const discount = parseDiscount(row.discount);
        const disc = Math.min(discount.percent ? sub * Math.min(discount.amount, 100) / 100 : discount.amount, sub);
        let tax = 0;

        row.lines.forEach((line, index) => {
            const share = sub > 0 ? disc * nets[index] / sub : 0;
            tax += (nets[index] - share) * taxOf(line.productId) / 100;
        });

        return { sub, disc, tax, total: sub - disc + tax, percent: discount.percent && discount.amount > 0, percentValue: discount.amount };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productById]);

    const dateOf = (row: Row) => parseDate(row.date, dateYear);
    const sideOf = (row: Row) => TYPE_META[row.type].side;
    const isInvoice = (row: Row) => TYPE_META[row.type].invoice;
    const payOf = (row: Row): number => {
        if (row.type === 'misc') {
            return invoiceTotals(row).total;
        }

        if (isInvoice(row)) {
            return row.full ? invoiceTotals(row).total : num(row.pay);
        }

        return num(row.pay);
    };

    const completeLine = (line: Line): boolean => !! line.productId && num(line.qty) > 0 && num(line.price) >= 0 && line.price !== '';

    function computeProblems(row: Row): Record<string, string> | null {
        const any = row.date || row.ref || row.party || row.pay || row.lines.some((line) => line.name || line.qty);

        if (! any) {
            return null;
        }

        const found: Record<string, string> = {};

        if (! dateOf(row)) {
            found.date = text('تاريخ غير صالح', 'Invalid date');
        }

        if (row.type !== 'misc' && ! row.partyId) {
            found.party = row.party
                ? text('اختر الاسم من القائمة', 'Pick the name from the list')
                : text('اختر الطرف', 'Select a party');
        }

        if (isInvoice(row)) {
            const complete = row.lines.filter(completeLine);
            const ids = complete.map((line) => line.productId);

            if (! complete.length) {
                found.lines = text('أضف بنداً كاملاً', 'Add a complete line');
            } else if (row.lines.some((line) => (line.name || line.qty) && ! completeLine(line))) {
                found.lines = text('بند غير مكتمل', 'Incomplete line');
            } else if (new Set(ids).size !== ids.length) {
                found.lines = text('منتج مكرر في الفاتورة', 'Product repeated on one invoice');
            }
        } else if (num(row.pay) <= 0) {
            found.pay = text('أدخل المبلغ', 'Enter the amount');
        }

        if (row.type !== 'misc' && payOf(row) > 0 && row.method === 'check' && (! row.checkNo || ! parseDate(row.checkDue, dateYear))) {
            found.check = text('رقم الشيك وتاريخ استحقاقه مطلوبان', 'Check number and due date are required');
        }

        if ((row.type === 'sale' || row.type === 'purchase') && row.partyId && dateOf(row)
            && rows.some((other) => other.id !== row.id && other.type === row.type && other.partyId === row.partyId && dateOf(other)?.iso === dateOf(row)?.iso)) {
            found.sameday = text('فاتورة ثانية لنفس الطرف في نفس اليوم: النظام يسمح بواحدة', 'Second invoice for the same party on the same day is not allowed');
        }

        return found;
    }

    /* Validation is computed once per change instead of several times per keystroke. */
    const problemMap = useMemo(() => {
        const map = new Map<number, Record<string, string> | null>();
        rows.forEach((row) => map.set(row.id, computeProblems(row)));

        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, dateYear, productById]);

    const problems = (row: Row): Record<string, string> | null =>
        problemMap.has(row.id) ? (problemMap.get(row.id) ?? null) : computeProblems(row);

    const isReady = (row: Row): boolean => {
        const found = problems(row);

        return found !== null && Object.keys(found).length === 0;
    };

    /* settlement of every ready row, oldest first, against the party's open invoices */
    const plan = useMemo(() => {
        const copy: Record<string, OpenDoc[]> = {};
        Object.keys(openDocs).forEach((key) => {
            copy[key] = openDocs[key].map((doc) => ({ ...doc }));
        });
        const result: Record<number, Plan> = {};

        rows
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => isReady(row))
            .sort((a, b) => {
                const da = dateOf(a.row)?.iso ?? '';
                const db = dateOf(b.row)?.iso ?? '';

                return da < db ? -1 : da > db ? 1 : a.index - b.index;
            })
            .forEach(({ row }) => {
                const totals = isInvoice(row) ? invoiceTotals(row) : { sub: 0, disc: 0, tax: 0, total: 0 };
                const pay = payOf(row);
                const date = dateOf(row)?.iso ?? '';

                if (row.type === 'misc') {
                    result[row.id] = { ...totals, pay, remInv: 0, excess: 0, allocations: [], advance: 0, snapshot: [], before: 0, after: 0 };

                    return;
                }

                const key = `${sideOf(row)}:${row.partyId}`;
                const list = (copy[key] = copy[key] ?? []);
                const snapshot = list.filter((doc) => doc.bal > 0.005).map((doc) => ({ ...doc }));
                const before = snapshot.reduce((sum, doc) => sum + doc.bal, 0);
                const toInvoice = Math.min(pay, totals.total);
                const excess = Math.max(pay - toInvoice, 0);
                let rest = excess;
                const allocations: Plan['allocations'] = [];

                list
                    .filter((doc) => doc.bal > 0.005 && doc.d <= date)
                    .sort((a, b) => (a.d < b.d ? 1 : -1))
                    .forEach((doc) => {
                        if (rest <= 0.005) {
                            return;
                        }

                        const part = Math.min(rest, doc.bal);
                        allocations.push({ n: doc.n, d: doc.d, amount: part, full: part >= doc.bal - 0.005 });
                        doc.bal -= part;
                        rest -= part;
                    });

                const remInv = Math.max(totals.total - toInvoice, 0);

                if (isInvoice(row) && remInv > 0.005) {
                    list.push({ n: row.ref || text('هذه الفاتورة', 'this invoice'), d: date, bal: remInv });
                }

                result[row.id] = {
                    ...totals,
                    pay,
                    remInv,
                    excess,
                    allocations,
                    advance: Math.max(rest, 0),
                    snapshot,
                    before,
                    after: before + remInv - allocations.reduce((sum, a) => sum + a.amount, 0) - Math.max(rest, 0),
                };
            });

        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, openDocs, dateYear, productById]);

    /* ---------- data helpers ---------- */
    const patch = (id: number, changes: Partial<Row>) =>
        setRows((current) => current.map((row) => (row.id === id ? { ...row, ...changes, error: '' } : row)));

    const patchLine = (rowId: number, key: number, changes: Partial<Line>) =>
        setRows((current) => current.map((row) => (row.id === rowId
            ? { ...row, error: '', lines: row.lines.map((line) => (line.key === key ? { ...line, ...changes } : line)) }
            : row)));

    const ensureOpenDocs = useCallback((partyId: number, side: 'sale' | 'purchase', force = false) => {
        const key = `${side}:${partyId}`;

        if (! force && openDocs[key]) {
            return;
        }

        apiRequest<{ data: { number: string; external_number: string | null; issue_date: string; balance_due: string }[] }>(
            `/api/finance/documents?kind=${side === 'sale' ? 'sale_invoice' : 'purchase_invoice'}&party_id=${partyId}&open_only=1&per_page=100`,
        )
            .then((response) => setOpenDocs((current) => ({
                ...current,
                [key]: response.data.map((doc) => ({ n: doc.number, d: doc.issue_date, bal: num(doc.balance_due) })),
            })))
            .catch(() => setOpenDocs((current) => ({ ...current, [key]: [] })));
    }, [openDocs]);

    function pickParty(row: Row, name: string) {
        const side = sideOf(row);
        const found = parties[side].find((party) => normalize(party.name) === normalize(name));

        patch(row.id, { party: name, partyId: found ? found.id : null });

        if (found) {
            ensureOpenDocs(found.id, side);
        }
    }

    function pickProduct(row: Row, line: Line, name: string) {
        const found = products.find((product) => normalize(product.name) === normalize(name));

        patchLine(row.id, line.key, { name, productId: found ? found.id : null });

        if (! found || (line.price && ! line.auto)) {
            return;
        }

        const catalog = row.type === 'purchase' ? found.cost_price : found.unit_price;
        patchLine(row.id, line.key, { name, productId: found.id, price: String(num(catalog ?? '0')), auto: true });

        if (row.partyId && row.type !== 'misc') {
            apiRequest<{ unit_price: string }>(
                `/api/finance/reference-price?party_id=${row.partyId}&product_id=${found.id}&kind=${row.type === 'sale' ? 'sale_invoice' : 'purchase_invoice'}`,
            )
                .then((reference) => setRows((current) => current.map((candidate) => (candidate.id === row.id
                    ? {
                        ...candidate,
                        lines: candidate.lines.map((existing) => (existing.key === line.key && existing.auto && existing.productId === found.id
                            ? { ...existing, price: String(num(reference.unit_price)) }
                            : existing)),
                    }
                    : candidate)))
                )
                .catch(() => undefined);
        }
    }

    function addRow(type: RowType, focus = true): Row {
        const last = [...rows].reverse().find((row) => row.type === type);
        const lastAny = rows[rows.length - 1];
        const created = newRow(type, {
            date: lastAny?.date ?? '',
            ref: last ? nextNumber(last.ref) : '',
        });

        setRows((current) => [...current, created]);

        if (filter !== 'all' && filter !== type) {
            setFilter('all');
        }

        if (focus) {
            pendingFocus.current = { id: created.id, field: type === 'misc' ? 'date' : 'party' };
        }

        return created;
    }

    useEffect(() => {
        const target = pendingFocus.current;

        if (! target) {
            return;
        }

        pendingFocus.current = null;
        const element = container.current?.querySelector<HTMLInputElement>(`[data-row="${target.id}"][data-f="${target.field}"]`);
        element?.focus();
        element?.select?.();
    });

    const mainFields = (row: Row): string[] => {
        const list = ['date', 'ref'];

        if (row.type !== 'misc') {
            list.push('party');
        }

        if (isInvoice(row)) {
            list.push('discount');
        }

        if (row.type !== 'misc') {
            list.push('pay');
        }

        return list;
    };

    const visible = rows.filter((row) => filter === 'all' || row.type === filter);

    function onKey(event: React.KeyboardEvent<HTMLInputElement>, row: Row, fieldName: string, line?: Line) {
        if (event.key === 'F2') {
            event.preventDefault();
            patch(row.id, { open: ! row.open });

            return;
        }

        if (event.key === 'Escape' && row.open) {
            patch(row.id, { open: false });

            return;
        }

        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();

        if (line) {
            const index = row.lines.findIndex((candidate) => candidate.key === line.key);
            const last = index === row.lines.length - 1;
            const order = ['name', 'qty', 'price'];

            if (fieldName === 'name' && ! line.name && last && row.lines.length > 1) {
                setRows((current) => current.map((candidate) => (candidate.id === row.id
                    ? { ...candidate, lines: candidate.lines.filter((item) => item.key !== line.key) }
                    : candidate)));
                pendingFocus.current = { id: row.id, field: 'discount' };

                return;
            }

            if (fieldName === 'price' && last) {
                if (completeLine(line)) {
                    const created = newLine();
                    setRows((current) => current.map((candidate) => (candidate.id === row.id
                        ? { ...candidate, lines: [...candidate.lines, created] }
                        : candidate)));
                    pendingFocus.current = { id: row.id, field: `line-${created.key}-name` };
                }

                return;
            }

            const next = order[order.indexOf(fieldName) + 1];
            const target = container.current?.querySelector<HTMLInputElement>(
                next
                    ? `[data-row="${row.id}"][data-f="line-${line.key}-${next}"]`
                    : `[data-row="${row.id}"][data-f="line-${row.lines[index + 1]?.key}-name"]`,
            );
            target?.focus();
            target?.select?.();

            return;
        }

        const fields = mainFields(row).filter((name) => ! (name === 'pay' && isInvoice(row) && row.full));
        const position = fields.indexOf(fieldName);

        if (position < fields.length - 1) {
            const target = container.current?.querySelector<HTMLInputElement>(`[data-row="${row.id}"][data-f="${fields[position + 1]}"]`);
            target?.focus();
            target?.select?.();

            return;
        }

        const index = visible.findIndex((candidate) => candidate.id === row.id);
        const following = visible[index + 1];

        if (following) {
            pendingFocus.current = { id: following.id, field: 'date' };
            setRows((current) => [...current]);
        } else {
            const created = addRow(row.type, false);
            pendingFocus.current = { id: created.id, field: 'date' };
        }
    }

    /* ---------- save ---------- */
    async function save() {
        const ready = rows.filter(isReady);

        if (! ready.length) {
            setNotice(text('لا توجد صفوف جاهزة للحفظ.', 'There are no ready rows to save.'));

            return;
        }

        setSaving(true);
        setError('');
        setNotice('');

        try {
            const payload = ready.map((row) => {
                const discount = parseDiscount(row.discount);
                const amount = payOf(row);

                return {
                    type: row.type,
                    date: dateOf(row)?.iso,
                    reference: row.ref || null,
                    party_id: row.type === 'misc' ? null : row.partyId,
                    lines: isInvoice(row)
                        ? row.lines.filter(completeLine).map((line) => ({
                            product_id: line.productId,
                            quantity: num(line.qty),
                            unit_price: num(line.price),
                        }))
                        : undefined,
                    discount_type: discount.percent ? 'percent' : 'fixed',
                    discount_value: discount.amount,
                    payment: row.type === 'misc'
                        ? undefined
                        : {
                            amount: isInvoice(row) && row.full ? undefined : amount,
                            full: isInvoice(row) && row.full ? true : undefined,
                            method: row.method,
                            check_number: row.method === 'check' ? row.checkNo : undefined,
                            check_due_date: row.method === 'check' ? parseDate(row.checkDue, dateYear)?.iso : undefined,
                        },
                };
            });

            const response = await apiRequest<{ data: SaveResult[] }>('/api/finance/quick-entry', {
                method: 'POST',
                body: JSON.stringify({ rows: payload }),
            });

            const failed = new Map<number, string>();
            const savedIds = new Set<number>();
            let allocated = 0;
            let advance = 0;

            response.data.forEach((result) => {
                const row = ready[result.index];

                if (result.ok) {
                    savedIds.add(row.id);
                    allocated += num(result.allocated ?? 0);
                    advance += num(result.advance ?? 0);
                } else {
                    failed.set(row.id, result.message ?? text('تعذر حفظ الصف.', 'The row could not be saved.'));
                }
            });

            setRows((current) => {
                const left = current
                    .filter((row) => ! savedIds.has(row.id))
                    .map((row) => (failed.has(row.id) ? { ...row, error: failed.get(row.id) ?? '', open: true } : row));

                return left.length ? left : [newRow(ready[0].type)];
            });

            setOpenDocs({});
            ready.forEach((row) => {
                if (row.partyId) {
                    ensureOpenDocs(row.partyId, sideOf(row), true);
                }
            });

            setNotice(
                text(
                    `تم حفظ ${savedIds.size} من ${ready.length}`,
                    `Saved ${savedIds.size} of ${ready.length}`,
                )
                + (allocated > 0 ? text(` · سُدّد ${fmt(allocated)} على فواتير`, ` · ${fmt(allocated)} settled on invoices`) : '')
                + (advance > 0 ? text(` · رصيد مقدم ${fmt(advance)}`, ` · ${fmt(advance)} advance`) : '')
                + (failed.size ? text(` · ${failed.size} فشلت وبقيت في الجدول`, ` · ${failed.size} failed and stayed in the table`) : ''),
            );
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setSaving(false);
        }
    }

    /* ---------- render helpers ---------- */
    const summary = useMemo(() => {
        const ready = rows.filter(isReady);
        const invalid = rows.filter((row) => {
            const found = problems(row);

            return found !== null && Object.keys(found).length > 0;
        }).length;

        return { ready, invalid };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, dateYear, productById]);

    const balance = (value: number, row: Row) => {
        if (Math.abs(value) < 0.005) {
            return <b>{text('صفر', 'Zero')}</b>;
        }

        const sale = sideOf(row) === 'sale';

        return (
            <span>
                <b>{fmt(Math.abs(value))}</b>{' '}
                <span className="text-[10px] text-[var(--ac-text-muted)]">
                    {value > 0
                        ? (sale ? text('عليه', 'owes') : text('علينا', 'we owe'))
                        : (sale ? text('له (مقدم)', 'credit') : text('لنا (مقدم)', 'our credit'))}
                </span>
            </span>
        );
    };

    function statusOf(row: Row) {
        const found = problems(row);

        if (! found) {
            return <span className="text-[var(--ac-text-muted)]">—</span>;
        }

        const keys = Object.keys(found);

        if (keys.length) {
            return <span title={Object.values(found).join('، ')}>{badge('red', keys[0] === 'sameday' ? text('نفس اليوم', 'Same day') : text('ينقص: ', 'Missing: ') + found[keys[0]])}</span>;
        }

        const info = plan[row.id];

        if (! info) {
            return null;
        }

        if (row.type === 'misc') {
            return badge('green', text('مدفوعة نقداً', 'Paid cash'));
        }

        if (! isInvoice(row)) {
            return (
                <span className="inline-flex flex-wrap gap-1">
                    {badge('blue', text('سند', 'Voucher'))}
                    {info.allocations.length > 0 && badge('green', text(`يسدّد ${info.allocations.length} فواتير`, `settles ${info.allocations.length}`))}
                    {info.advance > 0.005 && badge('amber', text('رصيد مقدم', 'Advance'))}
                </span>
            );
        }

        return (
            <span className="inline-flex flex-wrap gap-1">
                {info.remInv <= 0.005 ? badge('green', text('مدفوعة', 'Paid')) : info.pay > 0 ? badge('amber', text('جزئية', 'Partial')) : badge('gray', text('غير مدفوعة', 'Unpaid'))}
                {info.allocations.length > 0 && badge('blue', text('+سداد قديم', '+older settled'))}
            </span>
        );
    }

    function renderSettlement(row: Row) {
        const info = plan[row.id];

        if (! info) {
            return (
                <div className="rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 text-[11px] text-[var(--ac-text-muted)]">
                    {text('أكمل بيانات الصف لعرض الملخص والتسوية.', 'Complete the row to see the summary and settlement.')}
                </div>
            );
        }

        const row2 = 'flex items-center justify-between gap-2 py-1 text-xs';

        return (
            <div className="rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3">
                <h4 className="mb-2 text-[11px] font-bold text-[var(--ac-text-muted)]">
                    {row.type === 'misc' ? text('الملخص', 'Summary') : text('الملخص والتسوية', 'Summary and settlement')}
                </h4>
                {isInvoice(row) && (
                    <>
                        <div className={row2}><span>{text('المجموع الفرعي', 'Subtotal')}</span><span>{fmt(info.sub)}</span></div>
                        <div className={row2}><span>{text('الخصم', 'Discount')}</span><span>-{fmt(info.disc)}</span></div>
                        {info.tax > 0 && <div className={row2}><span>{text('الضريبة', 'Tax')}</span><span>{fmt(info.tax)}</span></div>}
                        <div className={row2 + ' border-t border-[var(--ac-line)] text-sm font-bold'}><span>{text('الإجمالي', 'Total')}</span><span>{fmt(info.total)}</span></div>
                    </>
                )}
                {row.type === 'misc' ? (
                    <p className="mt-2 text-[11px] text-[var(--ac-text-muted)]">{text('زبون عابر: تُسجَّل مدفوعة نقداً بنفس اللحظة، بدون رصيد.', 'Walk-in customer: paid in cash immediately, no balance.')}</p>
                ) : (
                    <>
                        <div className={row2}><span>{text('الدفعة', 'Payment')}</span><b>{info.pay > 0 ? fmt(info.pay) : text('لا يوجد', 'None')}</b></div>
                        {isInvoice(row) && info.remInv > 0.005 && <div className={row2}><span>{text('متبقٍ على الفاتورة', 'Remaining')}</span>{badge('amber', fmt(info.remInv))}</div>}
                        {info.excess > 0.005 && (
                            <div className="mt-1.5">
                                <div className={row2}><span>{isInvoice(row) ? text('فائض الدفعة', 'Payment surplus') : text('مبلغ السند', 'Voucher amount')}</span><b>{fmt(info.excess)}</b></div>
                                {info.allocations.map((a) => (
                                    <div key={a.n} className="my-1 rounded-[7px] border-s-[3px] border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] px-2.5 py-1 text-[11px]">
                                        {text('يُسدَّد على ', 'Settles ')}<b>{a.n}</b> ({a.d}) ← <b>{fmt(a.amount)}</b>{' '}
                                        {a.full ? badge('green', text('كاملة', 'full')) : badge('amber', text('جزئية', 'partial'))}
                                    </div>
                                ))}
                                {! info.allocations.length && <p className="text-[11px] text-[var(--ac-text-muted)]">{text('لا فواتير مفتوحة قبل هذا التاريخ.', 'No open invoices dated before this.')}</p>}
                                {info.advance > 0.005 && <div className={row2}><span>{text('يبقى رصيداً مقدماً', 'Stays as advance')}</span>{badge('blue', fmt(info.advance))}</div>}
                            </div>
                        )}
                        <div className="mt-2 flex items-center justify-between gap-2 border-t border-dashed border-[var(--ac-line)] pt-2 text-xs">
                            <span className="text-[var(--ac-text-muted)]">{text('رصيد ', 'Balance ')}{row.party}</span>
                            <span>{balance(info.before, row)} ← {balance(info.after, row)}</span>
                        </div>
                        {info.snapshot.length > 0 && (
                            <div className="mt-2">
                                <p className="text-[10px] text-[var(--ac-text-muted)]">{text('فواتير مفتوحة قبل هذا الصف', 'Open invoices before this row')}</p>
                                {info.snapshot.map((doc) => (
                                    <div key={doc.n} className={'mt-1 flex justify-between rounded-[8px] border px-2 py-1 text-[11px] ' + (info.allocations.some((a) => a.n === doc.n) ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]' : 'border-[var(--ac-line)]')}>
                                        <span><b>{doc.n}</b> <span className="text-[var(--ac-text-muted)]">{doc.d}</span></span>
                                        <b>{fmt(doc.bal)}</b>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    }

    function renderPayment(row: Row) {
        const info = plan[row.id];
        const totals = isInvoice(row) ? invoiceTotals(row) : null;

        if (row.type === 'misc') {
            return (
                <div className="rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3">
                    <label className="mb-1 block text-[10px] font-semibold text-[var(--ac-text-muted)]">{text('الخصم (5% أو مبلغ)', 'Discount (5% or amount)')}</label>
                    <input className={field + ' text-left'} dir="ltr" value={row.discount} onChange={(e) => patch(row.id, { discount: e.target.value })} placeholder="0" />
                </div>
            );
        }

        return (
            <div className="rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3">
                <h4 className="mb-2 text-[11px] font-bold text-[var(--ac-text-muted)]">
                    {isInvoice(row) ? text('الخصم والدفعة (الدفعة اختيارية)', 'Discount and payment (payment optional)') : text('الدفعة', 'Payment')}
                </h4>
                <div className="grid grid-cols-2 gap-2.5">
                    {isInvoice(row) && (
                        <div>
                            <label className="mb-1 block text-[10px] font-semibold text-[var(--ac-text-muted)]">{text('الخصم (5% أو مبلغ)', 'Discount (5% or amount)')}</label>
                            <input className={field + ' text-left'} dir="ltr" value={row.discount} onChange={(e) => patch(row.id, { discount: e.target.value })} placeholder="0" />
                        </div>
                    )}
                    <div>
                        <label className="mb-1 block text-[10px] font-semibold text-[var(--ac-text-muted)]">{text('مبلغ الدفعة', 'Payment amount')}</label>
                        <div className="flex items-center gap-1.5">
                            <input
                                className={field + ' text-left'}
                                dir="ltr"
                                value={isInvoice(row) && row.full && totals ? fmt(totals.total) : row.pay}
                                disabled={isInvoice(row) && row.full}
                                onChange={(e) => patch(row.id, { pay: e.target.value, full: false })}
                                placeholder={isInvoice(row) ? text('بدون دفعة', 'No payment') : '0'}
                            />
                            {isInvoice(row) && (
                                <button type="button" onClick={() => patch(row.id, { full: ! row.full, pay: '' })} className={'shrink-0 rounded-[7px] border px-2 py-1 text-[10px] font-bold ' + (row.full ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--ac-line)] text-[var(--ac-accent)]')}>
                                    {text('كامل', 'Full')}
                                </button>
                            )}
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-[10px] font-semibold text-[var(--ac-text-muted)]">{text('الطريقة', 'Method')}</label>
                        <select className={field} value={row.method} onChange={(e) => patch(row.id, { method: e.target.value as Method })}>
                            <option value="cash">{text('نقدي', 'Cash')}</option>
                            <option value="check">{text('شيك', 'Check')}</option>
                            <option value="transfer">{text('تحويل', 'Transfer')}</option>
                        </select>
                    </div>
                    {row.method === 'check' && (
                        <>
                            <div>
                                <label className="mb-1 block text-[10px] font-semibold text-[var(--ac-text-muted)]">{text('رقم الشيك', 'Check number')}</label>
                                <input className={field + ' text-left'} dir="ltr" value={row.checkNo} onChange={(e) => patch(row.id, { checkNo: e.target.value })} />
                            </div>
                            <div className="col-span-2">
                                <label className="mb-1 block text-[10px] font-semibold text-[var(--ac-text-muted)]">{text('تاريخ استحقاق الشيك', 'Check due date')}</label>
                                <input className={field} dir="ltr" value={row.checkDue} onChange={(e) => patch(row.id, { checkDue: e.target.value })} placeholder="15/3" />
                            </div>
                        </>
                    )}
                </div>
                {info && isInvoice(row) && row.full && <p className="mt-1.5 text-[10px] text-[var(--ac-text-muted)]">{text('يُدفع إجمالي الفاتورة كما يحسبه النظام.', 'The invoice total as calculated by the system is paid.')}</p>}
            </div>
        );
    }

    function renderLines(row: Row) {
        return (
            <div>
                <div className="overflow-hidden rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-surface)]">
                    <table className="w-full table-fixed text-xs">
                        <colgroup><col style={{ width: 28 }} /><col /><col style={{ width: 90 }} /><col style={{ width: 100 }} /><col style={{ width: 96 }} /><col style={{ width: 34 }} /></colgroup>
                        <thead>
                            <tr className="bg-[var(--ac-bg-soft)] text-[10px] text-[var(--ac-text-muted)]">
                                <th />
                                <th className="p-1.5 text-start">{text('المنتج', 'Product')}</th>
                                <th className="p-1.5 text-start">{text('الكمية', 'Qty')}</th>
                                <th className="p-1.5 text-start">{text('السعر', 'Price')}</th>
                                <th className="p-1.5 text-start">{text('الإجمالي', 'Total')}</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {row.lines.map((line, index) => (
                                <tr key={line.key} className="border-t border-[var(--ac-line)]">
                                    <td className="bg-[var(--ac-bg-soft)] text-center text-[10px] text-[var(--ac-text-muted)]">{index + 1}</td>
                                    <td>
                                        <input
                                            className={cellInput + (line.name && ! line.productId ? badRing : '')}
                                            list="qe-products"
                                            data-row={row.id}
                                            data-f={`line-${line.key}-name`}
                                            value={line.name}
                                            placeholder={text('المنتج', 'Product')}
                                            onChange={(e) => pickProduct(row, line, e.target.value)}
                                            onKeyDown={(e) => onKey(e, row, 'name', line)}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            className={cellInput + ' text-left'}
                                            dir="ltr"
                                            inputMode="decimal"
                                            data-row={row.id}
                                            data-f={`line-${line.key}-qty`}
                                            value={line.qty}
                                            placeholder="0"
                                            onChange={(e) => patchLine(row.id, line.key, { qty: e.target.value })}
                                            onKeyDown={(e) => onKey(e, row, 'qty', line)}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            className={cellInput + ' text-left' + (line.auto ? ' italic text-[var(--ac-text-muted)]' : '')}
                                            dir="ltr"
                                            inputMode="decimal"
                                            data-row={row.id}
                                            data-f={`line-${line.key}-price`}
                                            value={line.price}
                                            placeholder="0.00"
                                            onChange={(e) => patchLine(row.id, line.key, { price: e.target.value, auto: false })}
                                            onKeyDown={(e) => onKey(e, row, 'price', line)}
                                        />
                                    </td>
                                    <td className="px-2.5 text-left font-bold" dir="ltr">{num(line.qty) * num(line.price) ? fmt(num(line.qty) * num(line.price)) : ''}</td>
                                    <td className="text-center">
                                        <button type="button" aria-label={text('حذف البند', 'Delete line')} className="text-red-500" onClick={() => setRows((current) => current.map((candidate) => (candidate.id === row.id
                                            ? { ...candidate, lines: candidate.lines.length > 1 ? candidate.lines.filter((item) => item.key !== line.key) : [newLine()] }
                                            : candidate)))}>
                                            <X size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="mt-2 flex items-center gap-3">
                    <button type="button" className={btnSecondary + ' !min-h-8 !px-3 !text-xs'} onClick={() => {
                        const created = newLine();
                        setRows((current) => current.map((candidate) => (candidate.id === row.id ? { ...candidate, lines: [...candidate.lines, created] } : candidate)));
                        pendingFocus.current = { id: row.id, field: `line-${created.key}-name` };
                    }}>
                        <Plus size={13} />{text('بند', 'Line')}
                    </button>
                    <span className="text-[10px] text-[var(--ac-text-muted)]">{text('السعر يُملأ من سعر العميل ثم الكتالوج. Enter على بند فارغ يرجع للخصم.', 'Price comes from the party\'s last price, then the catalog. Enter on an empty line returns to discount.')}</span>
                </div>
            </div>
        );
    }

    const typeCount = (type: 'all' | RowType) => rows.filter((row) => type === 'all' || row.type === type).length;

    const cell = 'border-t border-[var(--ac-line)] p-0 align-middle';

    return (
        <AppShell>
            <Head title={text('إدخال الفواتير والدفعات', 'Quick entry')} />
            <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
                <div className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--ac-text-muted)]">
                            <Link href="/app/finance" className="transition hover:text-[var(--ac-text)]">
                                {text('المالية', 'Finance')}
                            </Link>
                            <span>/</span>
                            <span className="text-[var(--ac-accent-strong)]">{text('إدخال الفواتير والدفعات', 'Quick entry')}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex size-11 items-center justify-center rounded-2xl bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                <Zap size={20} />
                            </div>
                            <div>
                                <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                                    {text('إدخال الفواتير والدفعات', 'Quick entry of invoices and payments')}
                                </h1>
                                <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--ac-text-muted)]">
                                    {text(
                                        'فواتير البيع والشراء والمتفرقات والقبض والدفع في جدول واحد. كل فاتورة بمنتجاتها، والدفعة اختيارية، وفائضها يُسدَّد على الفواتير القديمة.',
                                        'Sales, purchase and walk-in invoices, receipts and payments in one table. Every invoice has products, payment is optional, and any surplus settles older invoices.',
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-xs text-[var(--ac-text-muted)]">
                            {text('السنة الافتراضية', 'Default year')}
                            <select className={field + ' !h-11 !w-24 !rounded-2xl'} value={dateYear} onChange={(e) => setDateYear(Number(e.target.value))}>
                                {Array.from({ length: 8 }, (_, i) => year - i).map((y) => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </label>
                        <button type="button" className={btnPrimary} disabled={saving || ! summary.ready.length} onClick={() => void save()}>
                            <Save size={17} />{saving ? text('جارٍ الحفظ…', 'Saving…') : text(`حفظ الجاهز (${summary.ready.length})`, `Save ready (${summary.ready.length})`)}
                        </button>
                    </div>
                </div>

                <datalist id="qe-products">{products.map((product: LookupProduct) => <option key={product.id} value={product.name} />)}</datalist>
                <datalist id="qe-parties-sale">{parties.sale.map((party) => <option key={party.id} value={party.name} />)}</datalist>
                <datalist id="qe-parties-purchase">{parties.purchase.map((party) => <option key={party.id} value={party.name} />)}</datalist>

                {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                {notice && <div className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500">{notice}</div>}

                <div className="mb-4 flex flex-wrap gap-1 rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-surface)] p-1 sm:w-fit">
                    {(['all', ...TYPE_ORDER] as const).map((type) => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => setFilter(type)}
                            className={'min-h-10 rounded-xl px-4 text-sm font-semibold transition ' + (filter === type ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]' : 'text-[var(--ac-text-muted)] hover:text-[var(--ac-text)]')}
                        >
                            {type === 'all' ? text('الكل', 'All') : text(TYPE_META[type].ar, TYPE_META[type].en)}
                            <span className="ms-1.5 text-xs font-normal opacity-70">{typeCount(type)}</span>
                        </button>
                    ))}
                </div>

                <section className="overflow-hidden rounded-[26px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]" ref={container}>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 bg-[var(--ac-bg-soft)] px-5 py-2.5 text-xs text-[var(--ac-text-muted)]">
                        <span><kbd className="rounded border border-[var(--ac-line)] px-1">Enter</kbd> {text('الحقل التالي، وفي آخر حقل صف جديد بنفس التاريخ والرقم التالي', 'next field; at the last field a new row')}</span>
                        <span><kbd className="rounded border border-[var(--ac-line)] px-1">F2</kbd> {text('فتح الصف', 'open row')}</span>
                        <span>{text('الخصم: 5% أو مبلغ', 'Discount: 5% or amount')}</span>
                        <span>{text('التاريخ: اكتب 5/1 فقط', 'Date: type 5/1')}</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1320px] table-fixed text-sm">
                            <colgroup>
                                <col style={{ width: 40 }} /><col style={{ width: 128 }} /><col style={{ width: 116 }} /><col style={{ width: 104 }} /><col style={{ width: 176 }} /><col style={{ width: 120 }} /><col style={{ width: 96 }} /><col style={{ width: 104 }} /><col style={{ width: 176 }} /><col style={{ width: 84 }} /><col style={{ width: 160 }} /><col style={{ width: 44 }} />
                            </colgroup>
                            <thead className="bg-[var(--ac-bg-soft)] text-[11px] text-[var(--ac-text-muted)]">
                                <tr>
                                    <th />
                                    {['النوع', 'التاريخ', 'الرقم الورقي', 'الطرف', 'البنود', 'الخصم', 'الإجمالي', 'الدفعة', 'المتبقي', 'الحالة'].map((label, i) => (
                                        <th key={label} className="px-3 py-3 text-start font-semibold">{text(label, ['Type', 'Date', 'Paper no.', 'Party', 'Lines', 'Discount', 'Total', 'Payment', 'Remaining', 'Status'][i])}</th>
                                    ))}
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((row) => {
                                    const found = problems(row) ?? {};
                                    const info = plan[row.id];
                                    const invoice = isInvoice(row);
                                    const totals = invoice ? invoiceTotals(row) : null;
                                    const bad = (name: string) => (found[name] ? badRing : '');

                                    return (
                                        <Fragment key={row.id}>
                                            <tr className={'transition hover:bg-[var(--ac-bg-soft)] ' + (row.open ? 'bg-[var(--ac-bg-soft)]' : '')}>
                                                <td className={cell + ' text-center text-[11px] text-[var(--ac-text-muted)]'}>{rows.indexOf(row) + 1}</td>
                                                <td className={cell}>
                                                    <select
                                                        className={cellInput + ' cursor-pointer font-bold ' + (TYPE_META[row.type].side === 'sale' ? 'text-emerald-500' : 'text-amber-500')}
                                                        aria-label={text('النوع', 'Type')}
                                                        value={row.type}
                                                        onChange={(e) => {
                                                            const type = e.target.value as RowType;
                                                            const sameKind = TYPE_META[type].invoice === TYPE_META[row.type].invoice;

                                                            patch(row.id, {
                                                                type,
                                                                partyId: TYPE_META[type].side === TYPE_META[row.type].side ? row.partyId : null,
                                                                party: TYPE_META[type].side === TYPE_META[row.type].side ? row.party : '',
                                                                lines: TYPE_META[type].invoice ? (row.lines.length ? row.lines : [newLine()]) : [],
                                                                pay: ! sameKind && ! TYPE_META[type].invoice && row.lines.length ? String(Math.round(invoiceTotals(row).total * 100) / 100 || '') : row.pay,
                                                                discount: TYPE_META[type].invoice ? row.discount : '',
                                                                full: false,
                                                            });
                                                        }}
                                                    >
                                                        {TYPE_ORDER.filter((type) => allowed[type] || type === row.type).map((type) => (
                                                            <option key={type} value={type}>{text(TYPE_META[type].ar, TYPE_META[type].en)}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className={cell}>
                                                    <input
                                                        className={cellInput + bad('date')}
                                                        data-row={row.id}
                                                        data-f="date"
                                                        dir="ltr"
                                                        value={row.date}
                                                        placeholder="5/1"
                                                        title={found.date}
                                                        onChange={(e) => patch(row.id, { date: e.target.value })}
                                                        onBlur={(e) => {
                                                            const parsed = parseDate(e.target.value, dateYear);

                                                            if (parsed) {
                                                                patch(row.id, { date: parsed.display });
                                                            }
                                                        }}
                                                        onKeyDown={(e) => onKey(e, row, 'date')}
                                                    />
                                                </td>
                                                <td className={cell}>
                                                    <input className={cellInput} data-row={row.id} data-f="ref" dir="ltr" value={row.ref} onChange={(e) => patch(row.id, { ref: e.target.value })} onKeyDown={(e) => onKey(e, row, 'ref')} />
                                                </td>
                                                <td className={cell}>
                                                    {row.type === 'misc' ? (
                                                        <span className="px-2.5 text-[var(--ac-text-muted)]">{text('زبون عابر', 'Walk-in customer')}</span>
                                                    ) : (
                                                        <input
                                                            className={cellInput + bad('party')}
                                                            list={`qe-parties-${sideOf(row)}`}
                                                            data-row={row.id}
                                                            data-f="party"
                                                            value={row.party}
                                                            placeholder={text(sideOf(row) === 'sale' ? 'اسم العميل' : 'اسم المورد', sideOf(row) === 'sale' ? 'Customer' : 'Supplier')}
                                                            title={found.party ?? found.sameday}
                                                            autoComplete="off"
                                                            onChange={(e) => pickParty(row, e.target.value)}
                                                            onKeyDown={(e) => onKey(e, row, 'party')}
                                                        />
                                                    )}
                                                </td>
                                                <td className={cell + ' whitespace-nowrap'}>
                                                    <button type="button" aria-expanded={row.open} onClick={() => patch(row.id, { open: ! row.open })} className={'mx-2 my-1 inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1 text-[11px] font-semibold ' + (row.open ? 'border-[var(--ac-accent)] bg-[var(--ac-accent)] text-white' : (found.lines ? 'border-red-500 text-red-500' : 'border-[var(--ac-line)] text-[var(--ac-accent)]'))}>
                                                        {invoice ? (row.lines.filter((line) => line.productId).length ? text(`${row.lines.filter((line) => line.productId).length} بنود`, `${row.lines.filter((line) => line.productId).length} lines`) : text('أضف بنوداً', 'Add lines')) : text('تفاصيل', 'Details')}
                                                        {row.open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                    </button>
                                                </td>
                                                <td className={cell}>
                                                    {invoice ? <input className={cellInput} dir="ltr" data-row={row.id} data-f="discount" value={row.discount} placeholder="0 / 5%" onChange={(e) => patch(row.id, { discount: e.target.value })} onKeyDown={(e) => onKey(e, row, 'discount')} /> : <span className="px-2.5 text-[var(--ac-text-muted)]">—</span>}
                                                </td>
                                                <td className={cell + ' px-2.5 font-bold'}>{invoice && totals && (totals.sub > 0) ? fmt(totals.total) : <span className="text-[var(--ac-text-muted)]">—</span>}</td>
                                                <td className={cell}>
                                                    {row.type === 'misc' ? (
                                                        <span className="mx-2.5">{badge('green', text('نقداً تلقائياً', 'Auto cash'))}</span>
                                                    ) : (
                                                        <div className="flex items-center gap-1 pe-1">
                                                            <input
                                                                className={cellInput + ' text-left' + bad('pay') + bad('check')}
                                                                dir="ltr"
                                                                inputMode="decimal"
                                                                data-row={row.id}
                                                                data-f="pay"
                                                                value={invoice && row.full && totals ? fmt(totals.total) : row.pay}
                                                                disabled={invoice && row.full}
                                                                placeholder={invoice ? text('بدون دفعة', 'No payment') : text('المبلغ', 'Amount')}
                                                                title={found.pay ?? found.check}
                                                                onChange={(e) => patch(row.id, { pay: e.target.value, full: false })}
                                                                onKeyDown={(e) => onKey(e, row, 'pay')}
                                                            />
                                                            {invoice && (
                                                                <button type="button" title={text('مدفوعة بالكامل', 'Paid in full')} onClick={() => patch(row.id, { full: ! row.full, pay: '' })} className={'shrink-0 rounded-[7px] border px-1.5 py-0.5 text-[10px] font-bold ' + (row.full ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--ac-line)] text-[var(--ac-accent)]')}>
                                                                    {text('كامل', 'Full')}
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className={cell + ' px-2.5'}>{info && invoice ? fmt(info.remInv) : <span className="text-[var(--ac-text-muted)]">—</span>}</td>
                                                <td className={cell + ' px-2.5'}>{statusOf(row)}</td>
                                                <td className={cell + ' text-center'}>
                                                    <button type="button" aria-label={text('حذف الصف', 'Delete row')} className="p-1.5 text-red-500" onClick={() => setRows((current) => (current.length > 1 ? current.filter((item) => item.id !== row.id) : [newRow(row.type)]))}>
                                                        <X size={15} />
                                                    </button>
                                                </td>
                                            </tr>
                                            {row.error && (
                                                <tr>
                                                    <td className="bg-[var(--ac-bg-soft)]" />
                                                    <td colSpan={11} className="border-b border-[var(--ac-line)] bg-red-500/10 px-3 py-2 text-xs text-red-500">{row.error}</td>
                                                </tr>
                                            )}
                                            {row.open && (
                                                <tr>
                                                    <td className="bg-[var(--ac-bg-soft)]" />
                                                    <td colSpan={11} className="border-t border-[var(--ac-line)] bg-[var(--ac-bg-soft)]">
                                                        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                                                            <div>{invoice ? renderLines(row) : <p className="text-xs text-[var(--ac-text-muted)]">{text('السند بلا بنود: أدخل المبلغ والطريقة، وسيُوزَّع على فواتير الطرف تلقائياً.', 'A voucher has no lines: enter the amount and method; it settles the party\'s invoices automatically.')}</p>}</div>
                                                            <div className="space-y-3">
                                                                {renderPayment(row)}
                                                                {renderSettlement(row)}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                                {! visible.length && (
                                    <tr><td colSpan={12} className="p-8 text-center text-xs text-[var(--ac-text-muted)]">{text('لا توجد صفوف من هذا النوع.', 'No rows of this type.')}</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--ac-line)] px-4 py-2.5 text-xs">
                        <span>{text('جاهز', 'Ready')} <b>{summary.ready.length}</b></span>
                        {TYPE_ORDER.map((type) => {
                            const list = summary.ready.filter((row) => row.type === type);

                            return list.length ? (
                                <span key={type}>
                                    {text(TYPE_META[type].ar, TYPE_META[type].en)} <b>{list.length}</b> · {fmt(list.reduce((sum, row) => sum + (isInvoice(row) ? (plan[row.id]?.total ?? 0) : (plan[row.id]?.pay ?? 0)), 0))}
                                </span>
                            ) : null;
                        })}
                        {summary.invalid > 0 && badge('red', text(`${summary.invalid} تحتاج استكمال`, `${summary.invalid} need attention`))}
                    </div>

                    <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--ac-line)] bg-[var(--ac-bg-soft)] px-5 py-3.5">
                        {TYPE_ORDER.filter((type) => allowed[type]).map((type) => (
                            <button key={type} type="button" className={btnSecondary} onClick={() => addRow(type)}>
                                <Plus size={16} />{text(TYPE_META[type].ar, TYPE_META[type].en)}
                            </button>
                        ))}
                        <button type="button" className={btnSecondary + ' ms-auto'} onClick={() => {
                            const any = visible.some((row) => row.open);
                            setRows((current) => current.map((row) => (visible.includes(row) ? { ...row, open: ! any } : row)));
                        }}>
                            {visible.some((row) => row.open) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            {visible.some((row) => row.open) ? text('طي الكل', 'Collapse all') : text('توسيع الكل', 'Expand all')}
                        </button>
                    </footer>
                </section>
            </main>
        </AppShell>
    );
}
