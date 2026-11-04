import { api } from './api';

export type PriceSource = 'party_override' | 'party_history' | 'catalog';

export interface ReferencePrice {
  source: PriceSource;
  unit_price: string;
  document_number: string | null;
  issue_date: string | null;
}

/**
 * The price the web app would suggest for this party and product: a saved
 * party price first, then the last invoice price for the party, then the
 * catalogue price (cost price for purchases).
 */
export async function fetchReferencePrice(
  kind: 'sale_invoice' | 'purchase_invoice',
  partyId: number,
  productId: number,
): Promise<ReferencePrice | null> {
  try {
    const { data } = await api.get('/finance/reference-price', {
      params: { kind, party_id: partyId, product_id: productId },
    });
    return data as ReferencePrice;
  } catch {
    return null;
  }
}

export async function savePartyPrice(partyId: number, productId: number, unitPrice: number): Promise<void> {
  await api.post(`/parties/${partyId}/prices`, { product_id: productId, unit_price: unitPrice });
}

export function priceSourceLabel(ref: ReferencePrice): string {
  switch (ref.source) {
    case 'party_override':
      return 'سعر مخصص محفوظ لهذا الطرف';
    case 'party_history':
      return `آخر سعر لهذا الطرف${ref.document_number ? ` · ${ref.document_number}` : ''}${ref.issue_date ? ` · ${ref.issue_date}` : ''}`;
    default:
      return 'سعر الكتالوج';
  }
}
