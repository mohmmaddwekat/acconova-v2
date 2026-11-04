import { useEffect, useState } from 'react';
import { api } from './api';

export interface PartyOption {
  id: number;
  name: string;
  roles: string[];
}

export interface ProductOption {
  id: number;
  name: string;
  unit_price: number | string;
  cost_price?: number | string | null;
  tax_rate?: number | string | null;
  unit?: string | null;
}

interface ApiParty {
  id: number;
  name: string | null;
  company_name: string | null;
  roles?: string[];
}

/** Customer- and supplier-side parties; a party may hold both roles. */
export function partiesFor(parties: PartyOption[], role: 'customer' | 'supplier'): PartyOption[] {
  return parties.filter((p) => p.roles.includes(role));
}

function useLookup<TRaw, T>(path: string, params: Record<string, unknown>, map: (raw: TRaw) => T) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const key = JSON.stringify(params);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    api
      .get(path, { params })
      .then((res) => {
        if (!alive) return;
        const data = res.data?.data ?? [];
        setItems(Array.isArray(data) ? data.map(map) : []);
      })
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);

  return { items, loading, error };
}

const mapParty = (p: ApiParty): PartyOption => ({
  id: p.id,
  name: p.company_name || p.name || `#${p.id}`,
  roles: p.roles ?? [],
});

const mapProduct = (p: ProductOption): ProductOption => p;

export function useParties() {
  return useLookup<ApiParty, PartyOption>('/parties', { per_page: 100 }, mapParty);
}

export function useProducts() {
  return useLookup<ProductOption, ProductOption>('/products', { per_page: 100 }, mapProduct);
}
