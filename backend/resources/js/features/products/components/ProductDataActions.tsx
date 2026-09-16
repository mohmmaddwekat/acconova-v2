import { DataActions } from '@/components/data/DataActions';
import { buildProductQuery, type ProductFilters } from '@/features/products/api';

/** Export the complete filtered dataset through shared safe download handling. */
export function ProductDataActions({ filters, ...props }: { filters: ProductFilters; canImport: boolean; onImport: () => void }) {
    return <DataActions {...props} exportUrl={(format) => `/api/products/export/${format}?${buildProductQuery(filters, false)}`} />;
}
