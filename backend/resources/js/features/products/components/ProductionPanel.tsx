import { fetchWarehouses } from '@/features/inventory/api';
import type { Warehouse } from '@/features/inventory/types';
import { fetchProducts } from '@/features/products/api';
import type { Product } from '@/features/products/types';
import { ApiError, apiRequest } from '@/lib/http';
import { t, useLocale } from '@/lib/i18n';
import type { AppPageProps } from '@/types/app';
import { usePage } from '@inertiajs/react';
import { useEffect, useState, type FormEvent } from 'react';

type Batch = { id: number; quantity: string; warehouse: string; created_at: string; note: string | null; materials: { id: number; name: string; quantity: string; unit: string }[] };
type History = { data: Batch[]; meta: { last_page: number } };
type MaterialLine = { product: Product; quantity: string };
const inputClass = 'mt-1 w-full rounded-xl border border-[var(--ac-line)] bg-white px-3 py-2 text-sm';
const buttonClass = 'rounded-xl border border-[var(--ac-line)] px-3 py-2 text-xs disabled:opacity-50';

/** Record actual material consumption for one finished product and review batch history. */
export function ProductionPanel({ product }: { product: Product }) {
    useLocale();
    const { workspace } = usePage<AppPageProps>().props;
    const role = workspace.activeOrganization?.role;
    const canProduce = (workspace.activeOrganization?.permissions ? workspace.activeOrganization.permissions.includes('inventory.manage') : ['owner', 'admin', 'manager'].includes(role ?? '')) && !product.deleted_at;
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [warehouseId, setWarehouseId] = useState('');
    const [search, setSearch] = useState('');
    const [options, setOptions] = useState<Product[]>([]);
    const [lines, setLines] = useState<MaterialLine[]>([]);
    const [quantity, setQuantity] = useState('1');
    const [note, setNote] = useState('');
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [history, setHistory] = useState<History | null>(null);
    const [error, setError] = useState('');
    const [loadError, setLoadError] = useState('');
    const [materialError, setMaterialError] = useState('');
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const endpoint = `/api/products/${product.id}/production`;

    useEffect(() => {
        let active = true;
        setLoading(true);
        setLoadError('');
        Promise.all([apiRequest<History>(`${endpoint}?page=${page}`), fetchWarehouses()])
            .then(([response, locations]) => { if (active) { setHistory(response); setWarehouses(locations); setWarehouseId((current) => current || String(locations.find((item) => item.is_default)?.id ?? locations[0]?.id ?? '')); } })
            .catch((failure: unknown) => { if (active) { setLoadError(failure instanceof ApiError ? failure.message : t('catalog.operations.failed')); } })
            .finally(() => { if (active) { setLoading(false); } });
        return () => { active = false; };
    }, [endpoint, page, revision]);

    useEffect(() => {
        if (!canProduce) { return; }
        let active = true;
        setSearching(true);
        setMaterialError('');
        const timer = setTimeout(() => {
            fetchProducts({ type: 'raw_material', status: 'active', search, perPage: 25 })
                .then((response) => { if (active) { setOptions(response.data); } })
                .catch((failure: unknown) => { if (active) { setMaterialError(failure instanceof ApiError ? failure.message : t('catalog.operations.failed')); } })
                .finally(() => { if (active) { setSearching(false); } });
        }, 250);
        return () => { active = false; clearTimeout(timer); };
    }, [canProduce, search, revision]);

    async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        if (saving || !lines.length) { return; }
        setSaving(true); setError(''); setSaved(false);
        try {
            await apiRequest(endpoint, { method: 'POST', body: JSON.stringify({ warehouse_id: Number(warehouseId), quantity, note: note || null, materials: lines.map((line) => ({ product_id: line.product.id, quantity: line.quantity })) }) });
            setSaved(true); setLines([]); setQuantity('1'); setNote(''); setPage(1); setRevision((value) => value + 1);
        } catch (failure) {
            setError(failure instanceof ApiError ? [failure.message, ...Object.values(failure.errors).flat()].join(' ') : t('catalog.operations.failed'));
        } finally { setSaving(false); }
    }

    return <section className="mt-7 border-t border-[var(--ac-line)] pt-6">
        <h3 className="font-semibold">{t('production.title')}</h3>
        <p className="mt-2 text-xs leading-6 text-[var(--ac-text-soft)]">{t('production.help')}</p>
        {loadError && <div role="alert" className="mt-3 text-sm">{loadError}<button type="button" className={buttonClass} onClick={() => setRevision((value) => value + 1)}>{t('catalog.operations.retry')}</button></div>}
        {canProduce && <form onSubmit={submit} className="mt-4 rounded-2xl bg-[var(--ac-surface-soft)] p-4">
            <fieldset disabled={saving || loading || Boolean(loadError)} className="space-y-4">
                <legend className="mb-3 text-sm font-semibold">{t('production.record')}</legend>
                <p className="text-xs leading-5">{t('production.setup')}</p>
                <label className="block text-xs">{t('production.warehouse')}<select required value={warehouseId} className={inputClass} onChange={(event) => setWarehouseId(event.target.value)}><option value="">{t('production.chooseWarehouse')}</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
                <label className="block text-xs">{t('production.output')} ({product.unit})<input required type="number" min="0.0001" max="99999999999999" step="0.0001" dir="ltr" className={inputClass} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
                <label className="block text-xs">{t('production.search')}<input type="search" maxLength={255} value={search} className={inputClass} onChange={(event) => { setSearch(event.target.value); setOptions([]); }} /></label>
                <div className="max-h-36 overflow-y-auto rounded-xl border border-[var(--ac-line)] bg-white">
                    {searching ? <p className="p-3 text-xs">{t('catalog.operations.loading')}</p> : materialError ? <div role="alert" className="p-3 text-xs">{materialError}<button type="button" className={buttonClass} onClick={() => setRevision((value) => value + 1)}>{t('catalog.operations.retry')}</button></div> : options.length ? options.map((raw) => <button type="button" key={raw.id} disabled={!raw.track_inventory || lines.some((line) => line.product.id === raw.id) || lines.length >= 50} className="block w-full px-3 py-2 text-start text-xs disabled:opacity-40" onClick={() => setLines((current) => [...current, { product: raw, quantity: '1' }])}>{raw.name} ({raw.unit}) {!raw.track_inventory && `— ${t('production.untracked')}`}</button>) : <p className="p-3 text-xs">{t('production.noMaterials')}</p>}
                </div>
                {lines.map((line) => <div key={line.product.id} className="flex items-end gap-2"><label className="min-w-0 flex-1 text-xs">{line.product.name} — {t('production.consumed')} ({line.product.unit})<input required type="number" dir="ltr" min="0.0001" max="99999999999999" step="0.0001" className={inputClass} value={line.quantity} onChange={(event) => setLines((current) => current.map((entry) => entry.product.id === line.product.id ? { ...entry, quantity: event.target.value } : entry))} /></label><button type="button" className={buttonClass} aria-label={`${t('production.remove')} ${line.product.name}`} onClick={() => setLines((current) => current.filter((entry) => entry.product.id !== line.product.id))}>{t('production.remove')}</button></div>)}
                <label className="block text-xs">{t('catalog.operations.notes')}<textarea maxLength={1000} className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} /></label>
                <button disabled={!lines.length || !warehouseId || saving} className="w-full rounded-xl bg-[var(--ac-accent-strong)] px-4 py-3 text-sm text-white disabled:opacity-50">{t(saving ? 'catalog.operations.saving' : 'production.record')}</button>
            </fieldset>
            {error && <p role="alert" className="mt-3 text-xs text-[var(--ac-danger)]">{error}</p>}
            {saved && <p role="status" className="mt-3 text-xs">{t('production.saved')}</p>}
        </form>}
        <h4 className="mt-5 text-sm font-semibold">{t('production.history')}</h4>
        {loading ? <p className="mt-3 text-xs">{t('catalog.operations.loading')}</p> : !loadError && (history?.data.length ? <ul className="mt-3 space-y-3">{history.data.map((batch) => <li key={batch.id} className="rounded-xl border border-[var(--ac-line)] p-3 text-sm"><strong>#{batch.id} · {batch.quantity} {product.unit}</strong><p className="mt-1 text-xs">{batch.warehouse} · <time dateTime={batch.created_at}>{new Date(batch.created_at).toLocaleString()}</time></p><ul className="mt-2 text-xs">{batch.materials.map((material) => <li key={material.id}>{material.name}: <bdi>{material.quantity}</bdi> {material.unit}</li>)}</ul>{batch.note && <p className="mt-2 whitespace-pre-wrap break-words text-xs">{batch.note}</p>}</li>)}</ul> : <p className="mt-3 text-xs">{t('production.empty')}</p>)}
        {history && history.meta.last_page > 1 && <div className="mt-3 flex justify-between"><button type="button" className={buttonClass} disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>{t('catalog.operations.previous')}</button><span>{page} / {history.meta.last_page}</span><button type="button" className={buttonClass} disabled={loading || page >= history.meta.last_page} onClick={() => setPage((value) => value + 1)}>{t('catalog.operations.next')}</button></div>}
    </section>;
}
