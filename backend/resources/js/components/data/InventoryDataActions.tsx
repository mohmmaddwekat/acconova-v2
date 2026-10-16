import { DataActions } from '@/components/data/DataActions';
import { ImportDialog } from '@/components/data/ImportDialog';
import { useToast } from '@/components/feedback/ToastProvider';
import { t } from '@/lib/i18n';
import { useState } from 'react';

/** Export and import (with a downloadable template) for warehouses or production runs. */
export function InventoryDataActions({
    module,
    canImport,
    onImported,
}: {
    module: 'warehouses' | 'production-runs';
    canImport: boolean;
    onImported: () => void;
}) {
    const [open, setOpen] = useState(false);
    const { showToast } = useToast();

    return (
        <>
            <DataActions
                canImport={canImport}
                onImport={() => setOpen(true)}
                exportUrl={(format) => `/api/${module}/export/${format}`}
            />
            <ImportDialog
                module={module}
                open={open}
                onClose={() => setOpen(false)}
                onImported={(result) => {
                    showToast(t('import.complete', result));
                    onImported();
                }}
            />
        </>
    );
}