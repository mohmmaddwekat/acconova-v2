import { Colors, StatusText, Tint } from '../constants/theme';
import { api } from './api';
import { todayISO } from './format';

export type DocumentKind = 'sale_invoice' | 'purchase_invoice';

export interface DocumentRow {
  id: number;
  number: string;
  kind: DocumentKind;
  status: string;
  party: { id: number; name: string | null; company_name?: string | null } | null;
  issue_date: string;
  due_date: string | null;
  currency: string;
  total: string;
  paid_total: string;
  balance_due: string;
}

export interface DocumentSummary {
  count: number;
  total: string;
  paid: string;
  outstanding: string;
  overdue: number;
  overdue_amount: string;
}

export function partyLabel(party: DocumentRow['party']): string {
  return party?.company_name || party?.name || '—';
}

export function isOverdue(doc: Pick<DocumentRow, 'due_date' | 'balance_due' | 'status'>): boolean {
  return (
    !!doc.due_date &&
    doc.due_date < todayISO() &&
    Number(doc.balance_due) > 0 &&
    !['draft', 'voided', 'superseded'].includes(doc.status)
  );
}

export function statusBadge(doc: Pick<DocumentRow, 'due_date' | 'balance_due' | 'status'>): { label: string; fg: string; bg: string } {
  if (isOverdue(doc)) return { label: 'متأخرة', fg: StatusText.danger, bg: Tint.dangerBg };
  switch (doc.status) {
    case 'paid':
      return { label: 'مدفوعة', fg: StatusText.success, bg: Tint.successBg };
    case 'partially_paid':
      return { label: 'مدفوعة جزئياً', fg: StatusText.warning, bg: Tint.warningBg };
    case 'overpaid':
      return { label: 'دفع زائد', fg: Colors.accentStrong, bg: Tint.infoBg };
    case 'draft':
      return { label: 'مسودة', fg: Colors.textMuted, bg: Colors.bgSoft };
    case 'voided':
    case 'superseded':
      return { label: 'ملغاة', fg: Colors.textMuted, bg: Colors.bgSoft };
    default:
      return { label: 'مفتوحة', fg: StatusText.warning, bg: Tint.warningBg };
  }
}

export function monthStartISO(): string {
  return todayISO().slice(0, 8) + '01';
}

export function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ARABIC_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export function monthName(index: number): string {
  return ARABIC_MONTHS[((index % 12) + 12) % 12];
}

export interface MonthRange {
  label: string;
  from: string;
  to: string;
}

/** The month `offset` months before the current one (0 = this month) as an inclusive date range. */
export function monthRange(offset: number): MonthRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { label: monthName(start.getMonth()), from: iso(start), to: iso(end) };
}

export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

export function fetchSummary(kind: DocumentKind, params: Record<string, unknown> = {}): Promise<DocumentSummary> {
  return api
    .get('/finance/documents', { params: { kind, per_page: 10, ...params } })
    .then((r) => r.data?.summary as DocumentSummary);
}

/** Sales and purchase totals for the last `count` months, oldest first. */
export async function fetchMonthlyTotals(count = 6): Promise<{ label: string; revenue: number; expenses: number }[]> {
  const months = Array.from({ length: count }, (_, i) => monthRange(count - 1 - i));
  return Promise.all(
    months.map(async (m) => {
      const [s, p] = await Promise.all([
        fetchSummary('sale_invoice', { date_from: m.from, date_to: m.to }),
        fetchSummary('purchase_invoice', { date_from: m.from, date_to: m.to }),
      ]);
      return { label: m.label, revenue: Number(s.total), expenses: Number(p.total) };
    }),
  );
}
