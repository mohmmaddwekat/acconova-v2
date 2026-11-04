export interface Movement {
  id: number;
  number: string | null;
  direction: 'incoming' | 'outgoing';
  status: string;
  category: string;
  party: { id: number; name: string } | null;
  amount: string;
  currency: string;
  movement_date: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  applied_to?: { id?: number; number?: string; amount?: string }[];
}

export const METHOD_LABEL: Record<string, string> = {
  cash: 'نقدي',
  bank_transfer: 'تحويل بنكي',
  check: 'شيك',
  card: 'بطاقة',
  electronic_wallet: 'محفظة إلكترونية',
  direct_debit: 'خصم مباشر',
  other: 'أخرى',
};

export const CATEGORY_LABEL: Record<string, string> = {
  customer_receipt: 'قبض من عميل',
  supplier_payment: 'دفع لمورد',
  raw_material: 'مواد خام',
  goods_for_resale: 'بضاعة للبيع',
  packaging: 'تغليف',
  operating_expense: 'مصروف تشغيلي',
  rent: 'إيجار',
  utilities: 'كهرباء وماء وخدمات',
  shipping_customs: 'شحن وجمارك',
  maintenance: 'صيانة',
  marketing: 'تسويق',
  tax_payment: 'ضرائب',
  government_fee: 'رسوم حكومية',
  loan: 'قرض',
  capital: 'رأس مال',
  asset_purchase: 'شراء أصول',
  asset_sale: 'بيع أصول',
  refund: 'استرداد',
  other_income: 'إيراد آخر',
  other_expense: 'مصروف آخر',
  other: 'أخرى',
};

/** A plain sentence for a cash movement: who paid whom, or what it was for. */
export function movementTitle(m: Pick<Movement, 'direction' | 'category' | 'party'>): string {
  const incoming = m.direction === 'incoming';
  if (m.party?.name) return incoming ? `قبض من ${m.party.name}` : `دفع إلى ${m.party.name}`;
  return CATEGORY_LABEL[m.category] ?? (incoming ? 'قبض' : 'دفع');
}

export function relativeDay(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000);
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'أمس';
  if (days < 7) return `منذ ${days} أيام`;
  return iso;
}
