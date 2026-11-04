import { useEffect, useState } from 'react';
import { api } from './api';

export interface PartyOption {
  id: number;
  name: string;
  type?: string;
  balance?: number;
}

export interface ProductOption {
  id: number;
  name: string;
  unit_price: number | string;
  tax_rate?: number | string | null;
  unit?: string | null;
}

function useLookup<T>(path: string, params: Record<string, unknown>) {
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
        const data = res.data?.data ?? res.data ?? [];
        setItems(Array.isArray(data) ? data : []);
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

export function useParties() {
  return useLookup<PartyOption>('/parties', { per_page: 100 });
}

export function useProducts() {
  return useLookup<ProductOption>('/products', { per_page: 100 });
}
