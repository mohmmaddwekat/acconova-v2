import { DataActions } from '@/components/data/DataActions';
import { buildPartyQuery, type PartyFilters } from '@/features/parties/api';

/** Export the complete filtered dataset through shared safe download handling. */
export function PartyDataActions({ filters, ...props }: { filters: PartyFilters; canImport: boolean; onImport: () => void }) {
    return <DataActions {...props} exportUrl={(format) => `/api/parties/export/${format}?${buildPartyQuery(filters, false)}`} />;
}
