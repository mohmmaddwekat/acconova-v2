import { ImportDialog } from '@/components/data/ImportDialog';
import type { ImportResult } from '@/lib/data-transfer';

/** Configure the shared import flow for the products API. */
export function ProductImportDialog(props: { open: boolean; onClose: () => void; onImported: (result: ImportResult) => void }) {
    return <ImportDialog {...props} module="products" />;
}
