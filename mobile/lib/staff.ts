import { api } from './api';
import { todayISO, uuidv4 } from './format';

export type EntryKind = 'payment' | 'advance' | 'bonus' | 'allowance' | 'deduction';

export interface StaffRow {
  id: number;
  name: string;
  job_title: string | null;
  basis: string;
  currency: string;
  active: boolean;
  /** Remaining amount owed to the employee: positive means the company owes them. */
  balance: string | null;
}

export const ENTRY_KINDS: Record<EntryKind, { label: string; hint: string }> = {
  payment: { label: 'صرف دفعة', hint: 'دفعة من مستحقات الموظف' },
  advance: { label: 'سلفة', hint: 'مبلغ مقدّم يُخصم لاحقاً من المستحقات' },
  bonus: { label: 'مكافأة', hint: 'مبلغ إضافي يُضاف للمستحقات' },
  allowance: { label: 'بدل', hint: 'بدل يُضاف للمستحقات' },
  deduction: { label: 'خصم', hint: 'مبلغ يُخصم من المستحقات' },
};

export const BASIS_LABEL: Record<string, string> = {
  hour: 'بالساعة',
  day: 'يومي',
  month: 'شهري',
  piece: 'بالقطعة',
};

export async function fetchStaff(search?: string): Promise<StaffRow[]> {
  const { data } = await api.get('/staff-transactions/bulk', {
    params: { per_page: 100, ...(search ? { search } : {}) },
  });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function recordEntry(staffId: number, kind: EntryKind, amount: number, date = todayISO(), notes?: string): Promise<void> {
  await api.post(`/staff/${staffId}/entries`, {
    request_id: uuidv4(),
    kind,
    occurred_on: date,
    amount,
    ...(notes ? { notes } : {}),
  });
}

export async function recordAttendance(
  staffId: number,
  date: string,
  status: 'present' | 'absent',
  overtimeHours = 0,
): Promise<void> {
  await api.post(`/staff/${staffId}/attendance`, {
    occurred_on: date,
    status,
    overtime_hours: overtimeHours,
    overtime_rate: 0,
  });
}

/** Same batch endpoint the website uses to pay or adjust several employees at once. */
export async function bulkEntries(kind: EntryKind, rows: { staff_id: number; amount: number }[], date = todayISO(), notes?: string): Promise<void> {
  await api.post('/staff-transactions/bulk', {
    batch_id: uuidv4(),
    kind,
    occurred_on: date,
    ...(notes ? { notes } : {}),
    rows,
  });
}

export function dayISO(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
