import { ImportDialog } from '@/components/data/ImportDialog';
import type { ImportResult } from '@/lib/data-transfer';

/** Configure the shared import flow for the parties API. */
export function PartyImportDialog(props: { open: boolean; onClose: () => void; onImported: (result: ImportResult) => void }) {
    return <ImportDialog {...props} module="parties" />;
}
