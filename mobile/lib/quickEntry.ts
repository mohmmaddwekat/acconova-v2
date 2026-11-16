import { api } from './api';
import { todayISO } from './format';

export interface QuickEntryPayment {
  full?: boolean;
  amount?: number;
  method: 'cash' | 'transfer' | 'check';
  check_number?: string;
  check_due_date?: string;
}

export type QuickEntryRow =
  | {
      type: 'receipt' | 'payment';
      party_id: number;
      /** Record date (ISO); defaults to today. The server rejects future dates. */
      date?: string;
      reference?: string;
      payment: QuickEntryPayment & { amount: number };
    }
  | {
      type: 'sale' | 'purchase';
      party_id: number;
      date?: string;
      reference?: string;
      lines: { product_id: number; quantity: number; unit_price: number }[];
      payment?: QuickEntryPayment;
    };

/** Posts one row and throws an Error carrying the server message when the row is rejected. */
export async function submitQuickEntry(row: QuickEntryRow): Promise<void> {
  const { data } = await api.post('/finance/quick-entry', {
    rows: [{ ...row, date: row.date ?? todayISO() }],
  });
  const result = data?.data?.[0];
  if (result && result.ok === false) {
    throw new Error(result.message ?? 'تعذّر حفظ القيد');
  }
}
