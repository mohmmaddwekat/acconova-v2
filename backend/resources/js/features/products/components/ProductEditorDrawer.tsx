import { useDialog } from '@/components/feedback/useDialog';
import { useLocale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import {
    Package,
    Save,
    Wrench,
    X,
} from 'lucide-react';
import {
    useEffect,
    useState,
    type FormEvent,
} from 'react';

import {
    createProduct,
    updateProduct,
    type ProductPayload,
} from '@/features/products/api';
import type {
    Product,
    ProductType,
} from '@/features/products/types';
import {
    ApiError,
} from '@/lib/http';

type ProductEditorDrawerProps = {
    open: boolean;

    product:
        | Product
        | null;

    onClose: () => void;

    onSaved: (
        product: Product,
    ) => void;
};

type ProductForm = {
    type: ProductType;

    name: string;

    sku: string;

    description: string;

    unit: string;

    unitPrice: string;

    costPrice: string;

    taxRate: string;
};

/**
 * Return the clean default Product editor state.
 */
function emptyForm(): ProductForm {
    return {
        type: 'product',
        name: '',
        sku: '',
        description: '',
        unit: 'unit',
        unitPrice: '0.00',
        costPrice: '',
        taxRate: '0',
    };
}

/**
 * Convert one API Product into editable form state.
 */
function formFromProduct(
    product: Product,
): ProductForm {
    return {
        type:
            product.type,

        name:
            product.name,

        sku:
            product.sku ?? '',

        description:
            product.description ?? '',

        unit:
            product.unit,

        unitPrice:
            product.unit_price,

        costPrice:
            product.cost_price ?? '',

        taxRate:
            product.tax_rate,
    };
}

/**
 * Render the Product/Service creation and editing workspace.
 */
export function ProductEditorDrawer({
    open,
    product,
    onClose,
    onSaved,
}: ProductEditorDrawerProps) {
    useLocale();
    const [form, setForm] =
        useState<ProductForm>(
            emptyForm(),
        );

    const [busy, setBusy] =
        useState(false);

    const [errors, setErrors] = useState<Record<string, string[]>>({});

    const [error, setError] =
        useState<string | null>(
            null,
        );

    const dialogRef = useDialog(open, onClose, busy);
    /** Keep the current editor visible until its mutation has finished. */
    function closeDialog(): void { if (!busy) onClose(); }

    useEffect(() => {
        setForm(
            product
                ? formFromProduct(
                      product,
                  )
                : emptyForm(),
        );

        setError(null);
        setErrors({});
    }, [
        open,
        product,
    ]);

    if (! open) {
        return null;
    }

    /**
     * Submit the current catalog form through the appropriate API operation.
     */
    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (busy) {
            return;
        }

        setBusy(true);
        setError(null);
        setErrors({});

        const payload:
            ProductPayload = {
            type:
                form.type,

            name:
                form.name.trim(),

            sku:
                form.sku.trim() ||
                null,

            description:
                form.description.trim() ||
                null,

            unit:
                form.unit.trim() ||
                'unit',

            unit_price:
                form.unitPrice,

            cost_price:
                form.costPrice.trim() ||
                null,

            tax_rate:
                form.taxRate,
        };

        try {
            const saved =
                product
                    ? await updateProduct(
                          product.id,
                          payload,
                      )
                    : await createProduct(
                          payload,
                      );

            onSaved(
                saved,
            );

            onClose();
        } catch (exception) {
            if (exception instanceof ApiError) setErrors(exception.errors);
            setError(
                exception instanceof
                ApiError
                    ? exception.message
                    : t('ui.acconova_could_not_save_this_catalog_item'),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[120]">
            <button
                type="button"
                aria-label={t('ui.close_catalog_editor')}
                onClick={closeDialog}
                className="absolute inset-0 bg-[var(--ac-text)]/22 backdrop-blur-[3px]"
            />

            <aside ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('ui.catalog_context')} className="absolute inset-y-0 end-0 z-10 flex w-full flex-col border-s border-[var(--ac-line)] bg-white shadow-[-40px_0_100px_rgba(20,35,30,0.16)] sm:max-w-[620px]">
                <header className="flex items-start justify-between border-b border-[var(--ac-line)] px-5 py-5 sm:px-6">
                    <div>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-accent-strong)]">
                            {t('ui.catalog_editor')}
                        </p>

                        <h2 className="mt-1 text-2xl font-semibold tracking-[-0.045em]">
                            {product
                                ? t('ui.edit_catalog_item')
                                : t('ui.add_to_your_catalog')}
                        </h2>
                    </div>

                    <button
                        type="button"
                        onClick={closeDialog}
                        className="flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]"
                    >
                        <X size={17} />
                    </button>
                </header>

                <form
                    onSubmit={(
                        event,
                    ) =>
                        void handleSubmit(
                            event,
                        )
                    }
                    className="flex min-h-0 flex-1 flex-col"
                >
                    <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
                        <div className="grid grid-cols-2 gap-2">
                            <TypeButton
                                active={
                                    form.type ===
                                    'product'
                                }
                                icon={
                                    Package
                                }
                                title={t('ui.product')}
                                description={t('ui.a_physical_or_sellable_item')}
                                onClick={() =>
                                    setForm({
                                        ...form,
                                        type: 'product',
                                    })
                                }
                            />

                            <TypeButton
                                active={
                                    form.type ===
                                    'service'
                                }
                                icon={
                                    Wrench
                                }
                                title={t('ui.service')}
                                description={t('ui.time_work_or_expertise')}
                                onClick={() =>
                                    setForm({
                                        ...form,
                                        type: 'service',
                                    })
                                }
                            />
                        </div>

                        <div className="mt-6 grid gap-5">
                            <Field
                                label={t('ui.name')} error={errors.name?.[0]} errorId="product-name-error"
                                required
                            >
                                <input
                                    required
                                    aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'product-name-error' : undefined} value={form.name}
                                    onChange={(
                                        event,
                                    ) =>
                                        setForm({
                                            ...form,
                                            name:
                                                event
                                                    .target
                                                    .value,
                                        })
                                    }
                                    className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] bg-white px-3.5 text-sm outline-none focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                                />
                            </Field>

                            <div className="grid gap-5 sm:grid-cols-2">
                                <Field
                                    label={t('ui.sku')} error={errors.sku?.[0]} errorId="product-sku-error"
                                    optional
                                >
                                    <input
                                        aria-invalid={Boolean(errors.sku)} aria-describedby={errors.sku ? 'product-sku-error' : undefined} value={form.sku}
                                        onChange={(
                                            event,
                                        ) =>
                                            setForm({
                                                ...form,
                                                sku:
                                                    event
                                                        .target
                                                        .value,
                                            })
                                        }
                                        placeholder={t('ui.sku_001')}
                                        className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] px-3.5 text-sm uppercase outline-none focus:border-[var(--ac-accent)]"
                                    />
                                </Field>

                                <Field
                                    label={t('ui.unit')} error={errors.unit?.[0]} errorId="product-unit-error"
                                    required
                                >
                                    <input
                                        required
                                        aria-invalid={Boolean(errors.unit)} aria-describedby={errors.unit ? 'product-unit-error' : undefined} value={form.unit}
                                        onChange={(
                                            event,
                                        ) =>
                                            setForm({
                                                ...form,
                                                unit:
                                                    event
                                                        .target
                                                        .value,
                                            })
                                        }
                                        placeholder={t('ui.unit_hour_day')}
                                        className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] px-3.5 text-sm outline-none focus:border-[var(--ac-accent)]"
                                    />
                                </Field>
                            </div>

                            <div className="grid gap-5 sm:grid-cols-3">
                                <Field
                                    label={t('ui.selling_price')} error={errors.unit_price?.[0]} errorId="product-unit_price-error"
                                    required
                                >
                                    <input
                                        required
                                        type="number" dir="ltr"
                                        min="0"
                                        step="0.0001"
                                        aria-invalid={Boolean(errors.unit_price)} aria-describedby={errors.unit_price ? 'product-unit_price-error' : undefined} value={form.unitPrice}
                                        onChange={(
                                            event,
                                        ) =>
                                            setForm({
                                                ...form,
                                                unitPrice:
                                                    event
                                                        .target
                                                        .value,
                                            })
                                        }
                                        className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] px-3.5 text-sm outline-none focus:border-[var(--ac-accent)]"
                                    />
                                </Field>

                                <Field
                                    label={t('ui.cost')} error={errors.cost_price?.[0]} errorId="product-cost_price-error"
                                    optional
                                >
                                    <input
                                        type="number" dir="ltr"
                                        min="0"
                                        step="0.0001"
                                        aria-invalid={Boolean(errors.cost_price)} aria-describedby={errors.cost_price ? 'product-cost_price-error' : undefined} value={form.costPrice}
                                        onChange={(
                                            event,
                                        ) =>
                                            setForm({
                                                ...form,
                                                costPrice:
                                                    event
                                                        .target
                                                        .value,
                                            })
                                        }
                                        className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] px-3.5 text-sm outline-none focus:border-[var(--ac-accent)]"
                                    />
                                </Field>

                                <Field
                                    label={t('ui.tax')} error={errors.tax_rate?.[0]} errorId="product-tax_rate-error"
                                    required
                                >
                                    <input
                                        required
                                        type="number" dir="ltr"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        aria-invalid={Boolean(errors.tax_rate)} aria-describedby={errors.tax_rate ? 'product-tax_rate-error' : undefined} value={form.taxRate}
                                        onChange={(
                                            event,
                                        ) =>
                                            setForm({
                                                ...form,
                                                taxRate:
                                                    event
                                                        .target
                                                        .value,
                                            })
                                        }
                                        className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] px-3.5 text-sm outline-none focus:border-[var(--ac-accent)]"
                                    />
                                </Field>
                            </div>

                            <Field
                                label={t('ui.description')} error={errors.description?.[0]} errorId="product-description-error"
                                optional
                            >
                                <textarea
                                    rows={5}
                                    maxLength={
                                        5000
                                    }
                                    aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'product-description-error' : undefined} value={form.description}
                                    onChange={(
                                        event,
                                    ) =>
                                        setForm({
                                            ...form,
                                            description:
                                                event
                                                    .target
                                                    .value,
                                        })
                                    }
                                    className="w-full resize-y rounded-[14px] border border-[var(--ac-line)] px-3.5 py-3 text-sm leading-6 outline-none focus:border-[var(--ac-accent)]"
                                />
                            </Field>
                        </div>

                        {error && (
                            <div className="mt-5 rounded-[15px] bg-[var(--ac-danger)]/5 px-4 py-3 text-sm text-[var(--ac-danger)]">
                                {error}
                            </div>
                        )}
                    </div>

                    <footer className="grid grid-cols-2 gap-2 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 sm:px-6">
                        <button
                            type="button"
                            onClick={closeDialog}
                            className="h-11 rounded-[14px] border border-[var(--ac-line)] bg-white text-sm font-semibold"
                        >
                            {t('ui.cancel')}
                        </button>

                        <button
                            type="submit"
                            disabled={
                                busy
                            }
                            className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-text)] text-sm font-semibold text-white disabled:opacity-50"
                        >
                            <Save
                                size={15}
                            />

                            {busy
                                ? t('ui.saving')
                                : t('ui.save_item')}
                        </button>
                    </footer>
                </form>
            </aside>
        </div>
    );
}

type TypeButtonProps = {
    active: boolean;

    icon: typeof Package;

    title: string;

    description: string;

    onClick: () => void;
};

/**
 * Render one Product/Service type choice.
 */
function TypeButton({
    active,
    icon: Icon,
    title,
    description,
    onClick,
}: TypeButtonProps) {
    useLocale();
    return (
        <button
            type="button"
            onClick={
                onClick
            }
            className={[
                'rounded-[18px] border p-4 text-start transition',
                active
                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]'
                    : 'border-[var(--ac-line)] bg-white',
            ].join(' ')}
        >
            <Icon
                size={17}
            />

            <p className="mt-3 text-sm font-semibold">
                {title}
            </p>

            <p className="mt-1 text-[10px] leading-4 text-[var(--ac-text-muted)]">
                {description}
            </p>
        </button>
    );
}

type FieldProps = {
    error?: string;
    errorId?: string;
    label: string;

    required?: boolean;

    optional?: boolean;

    children: React.ReactNode;
};

/**
 * Render a Product form field with explicit required/optional communication.
 */
function Field({
    error,
    errorId,
    label,
    required = false,
    optional = false,
    children,
}: FieldProps) {
    useLocale();
    return (
        <label className="block">
            <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold">
                    {label}
                </span>

                <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-text-muted)]">
                    {required
                        ? t('ui.required')
                        : optional
                          ? t('ui.optional')
                          : ''}
                </span>
            </div>

            {children}
            {error && <p id={errorId} role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
        </label>
    );
}