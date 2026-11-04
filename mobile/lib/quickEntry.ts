import { api } from './api';
import { todayISO } from './format';

export type QuickEntryRow =
  | {
      type: 'receipt' | 'payment';
      party_id: number;
      reference?: string;
      payment: { amount: number; method: 'cash' | 'transfer' | 'check' };
    }
  | {
      type: 'sale' | 'purchase';
      party_id: number;
      reference?: string;
      lines: { product_id: number; quantity: number; unit_price: number }[];
      payment?: { full: boolean; method: 'cash' | 'transfer' | 'check' };
    };

/** Posts one row and throws an Error carrying the server message when the row is rejected. */
export async function submitQuickEntry(row: QuickEntryRow): Promise<void> {
  const { data } = await api.post('/finance/quick-entry', {
    rows: [{ date: todayISO(), ...row }],
  });
  const result = data?.data?.[0];
  if (result && result.ok === false) {
    throw new Error(result.message ?? 'تعذّر حفظ القيد');
  }
}
