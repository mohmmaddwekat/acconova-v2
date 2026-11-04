export const CURRENCY_SYMBOL = process.env.EXPO_PUBLIC_CURRENCY_SYMBOL || '₪';

export function formatMoney(value?: number | string | null, withSymbol = true): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  const text = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
  return withSymbol ? `${text} ${CURRENCY_SYMBOL}` : text;
}

export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function apiErrorMessage(err: any, fallback: string): string {
  const data = err?.response?.data;
  const firstFieldError = data?.errors ? (Object.values(data.errors)[0] as string[] | undefined)?.[0] : undefined;
  return firstFieldError ?? data?.message ?? fallback;
}
