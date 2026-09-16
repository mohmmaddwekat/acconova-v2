import {
    useDialog,
} from '@/components/feedback/useDialog';
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
import {
    t,
    useLocale,
} from '@/lib/i18n';
import {
    Hash,
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
    createPortal,
} from 'react-dom';

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
        type:
            'product',

        name:
            '',

        description:
            '',

        unit:
            'unit',

        unitPrice:
            '0.00',

        costPrice:
            '',

        taxRate:
            '0',
    };
}

/**
 * Convert an API Product into editable business fields.
 *
 * SKU is intentionally excluded because AccoNova owns system identifiers.
 */
function formFromProduct(
    product: Product,
): ProductForm {
    return {
        type:
            product.type,

        name:
            product.name,

        description:
            product.description ??
            '',

        unit:
            product.unit,

        unitPrice:
            product.unit_price,

        costPrice:
            product.cost_price ??
            '',

        taxRate:
            product.tax_rate,
    };
}

/**
 * Render the shared Product create/edit workspace directly against the
 * browser viewport.
 *
 * Both Add and Edit use this component. Portal rendering guarantees that the
 * application shell can never clip or offset the editor.
 */
export function ProductEditorDrawer({
    open,
    product,
    onClose,
    onSaved,
}: ProductEditorDrawerProps) {
    useLocale();

    const [
        form,
        setForm,
    ] =
        useState<ProductForm>(
            emptyForm(),
        );

    const [
        busy,
        setBusy,
    ] =
        useState(
            false,
        );

    const [
        errors,
        setErrors,
    ] =
        useState<
            Record<
                string,
                string[]
            >
        >({});

    const [
        error,
        setError,
    ] =
        useState<
            string | null
        >(
            null,
        );

    const dialogRef =
        useDialog(
            open,
            onClose,
            busy,
        );

    /**
     * Keep the editor visible while a mutation is being committed.
     */
    function closeDialog(): void {
        if (
            ! busy
        ) {
            onClose();
        }
    }

    useEffect(() => {
        if (
            ! open
        ) {
            return;
        }

        setForm(
            product
                ? formFromProduct(
                      product,
                  )
                : emptyForm(),
        );

        setError(
            null,
        );

        setErrors(
            {},
        );
    }, [
        open,
        product,
    ]);

    /**
     * Persist the current catalog item.
     *
     * New Products receive their SKU from the workspace sequence. Existing
     * Products retain their stable generated identifier.
     */
    async function handleSubmit(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            busy
        ) {
            return;
        }

        setBusy(
            true,
        );

        setError(
            null,
        );

        setErrors(
            {},
        );

        const payload:
            ProductPayload = {
            type:
                form.type,

            name:
                form.name.trim(),

            sku:
                product?.sku ??
                null,

            description:
                form.description.trim()
                    || null,

            unit:
                form.unit.trim()
                    || 'unit',

            unit_price:
                form.unitPrice,

            cost_price:
                form.costPrice.trim()
                    || null,

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
        } catch (
            exception
        ) {
            if (
                exception instanceof
                ApiError
            ) {
                setErrors(
                    exception.errors,
                );
            }

            setError(
                exception instanceof
                ApiError
                    ? exception.message
                    : t(
                          'ui.acconova_could_not_save_this_catalog_item',
                      ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    if (
        ! open ||
        typeof document ===
            'undefined'
    ) {
        return null;
    }

    const surface = (
        <div className="fixed inset-0 z-[220]">
            <button
                type="button"
                aria-label={t(
                    'ui.close_catalog_editor',
                )}
                onClick={
                    closeDialog
                }
                className="absolute inset-0 bg-[var(--ac-text)]/22 backdrop-blur-[3px]"
            />

            <aside
                ref={
                    dialogRef
                }
                role="dialog"
                aria-modal="true"
                aria-label={t(
                    'ui.catalog_context',
                )}
                className="absolute inset-y-0 end-0 z-10 flex h-[100dvh] w-full flex-col overflow-hidden border-s border-[var(--ac-line)] bg-white shadow-[-40px_0_100px_rgba(20,35,30,0.16)] sm:max-w-[620px]"
            >
                <header className="shrink-0 border-b border-[var(--ac-line)] bg-white px-5 py-5 sm:px-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-accent-strong)]">
                                {t(
                                    'ui.catalog_editor',
                                )}
                            </p>

                            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.045em]">
                                {product
                                    ? t(
                                          'ui.edit_catalog_item',
                                      )
                                    : t(
                                          'ui.add_to_your_catalog',
                                      )}
                            </h2>
                        </div>

                        <button
                            type="button"
                            aria-label={t(
                                'ui.close_catalog_editor',
                            )}
                            onClick={
                                closeDialog
                            }
                            className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-surface-strong)] hover:text-[var(--ac-text)]"
                        >
                            <X
                                size={
                                    17
                                }
                            />
                        </button>
                    </div>
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
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
                        <div className="grid grid-cols-2 gap-2">
                            <TypeButton
                                active={
                                    form.type ===
                                    'product'
                                }
                                icon={
                                    Package
                                }
                                title={t(
                                    'ui.product',
                                )}
                                description={t(
                                    'ui.a_physical_or_sellable_item',
                                )}
                                onClick={() =>
                                    setForm(
                                        (
                                            current,
                                        ) => ({
                                            ...current,

                                            type:
                                                'product',
                                        }),
                                    )
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
                                title={t(
                                    'ui.service',
                                )}
                                description={t(
                                    'ui.time_work_or_expertise',
                                )}
                                onClick={() =>
                                    setForm(
                                        (
                                            current,
                                        ) => ({
                                            ...current,

                                            type:
                                                'service',
                                        }),
                                    )
                                }
                            />
                        </div>

                        <div className="mt-6 grid gap-5">
                            <Field
                                label={t(
                                    'ui.name',
                                )}
                                error={
                                    errors
                                        .name?.[0]
                                }
                                errorId="product-name-error"
                                required
                            >
                                <input
                                    required
                                    value={
                                        form.name
                                    }
                                    aria-invalid={Boolean(
                                        errors.name,
                                    )}
                                    aria-describedby={
                                        errors.name
                                            ? 'product-name-error'
                                            : undefined
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setForm(
                                            (
                                                current,
                                            ) => ({
                                                ...current,

                                                name:
                                                    event
                                                        .target
                                                        .value,
                                            }),
                                        )
                                    }
                                    className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] bg-white px-3.5 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                                />
                            </Field>

                            <div className="grid gap-5 sm:grid-cols-2">
                                <div className="rounded-[17px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3.5">
                                    <div className="flex items-start gap-3">
                                        <div className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-white text-[var(--ac-accent-strong)] shadow-[var(--ac-shadow-soft)]">
                                            <Hash
                                                size={
                                                    15
                                                }
                                            />
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-xs font-semibold">
                                                    {t(
                                                        'ui.sku',
                                                    )}
                                                </p>

                                                <span className="rounded-full bg-[var(--ac-accent-soft)] px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-accent-strong)]">
                                                    {t(
                                                        'lifecycle.generatedAutomatically',
                                                    )}
                                                </span>
                                            </div>

                                            <p
                                                dir="ltr"
                                                className="mt-2 text-sm font-semibold"
                                            >
                                                {product
                                                    ?.sku ??
                                                    t(
                                                        'lifecycle.assignedAfterSave',
                                                    )}
                                            </p>

                                            <p className="mt-1.5 text-[10px] leading-4 text-[var(--ac-text-muted)]">
                                                {t(
                                                    'lifecycle.skuSequenceHelp',
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <Field
                                    label={t(
                                        'ui.unit',
                                    )}
                                    error={
                                        errors
                                            .unit?.[0]
                                    }
                                    errorId="product-unit-error"
                                    required
                                >
                                    <input
                                        required
                                        value={
                                            form.unit
                                        }
                                        aria-invalid={Boolean(
                                            errors.unit,
                                        )}
                                        aria-describedby={
                                            errors.unit
                                                ? 'product-unit-error'
                                                : undefined
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            setForm(
                                                (
                                                    current,
                                                ) => ({
                                                    ...current,

                                                    unit:
                                                        event
                                                            .target
                                                            .value,
                                                }),
                                            )
                                        }
                                        placeholder={t(
                                            'ui.unit_hour_day',
                                        )}
                                        className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] px-3.5 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                                    />
                                </Field>
                            </div>

                            <div className="grid gap-5 sm:grid-cols-3">
                                <Field
                                    label={t(
                                        'ui.selling_price',
                                    )}
                                    error={
                                        errors
                                            .unit_price?.[0]
                                    }
                                    errorId="product-unit-price-error"
                                    required
                                >
                                    <input
                                        required
                                        type="number"
                                        dir="ltr"
                                        min="0"
                                        step="0.0001"
                                        value={
                                            form.unitPrice
                                        }
                                        aria-invalid={Boolean(
                                            errors.unit_price,
                                        )}
                                        aria-describedby={
                                            errors.unit_price
                                                ? 'product-unit-price-error'
                                                : undefined
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            setForm(
                                                (
                                                    current,
                                                ) => ({
                                                    ...current,

                                                    unitPrice:
                                                        event
                                                            .target
                                                            .value,
                                                }),
                                            )
                                        }
                                        className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] px-3.5 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                                    />
                                </Field>

                                <Field
                                    label={t(
                                        'ui.cost',
                                    )}
                                    error={
                                        errors
                                            .cost_price?.[0]
                                    }
                                    errorId="product-cost-price-error"
                                    optional
                                >
                                    <input
                                        type="number"
                                        dir="ltr"
                                        min="0"
                                        step="0.0001"
                                        value={
                                            form.costPrice
                                        }
                                        aria-invalid={Boolean(
                                            errors.cost_price,
                                        )}
                                        aria-describedby={
                                            errors.cost_price
                                                ? 'product-cost-price-error'
                                                : undefined
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            setForm(
                                                (
                                                    current,
                                                ) => ({
                                                    ...current,

                                                    costPrice:
                                                        event
                                                            .target
                                                            .value,
                                                }),
                                            )
                                        }
                                        className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] px-3.5 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                                    />
                                </Field>

                                <Field
                                    label={t(
                                        'ui.tax',
                                    )}
                                    error={
                                        errors
                                            .tax_rate?.[0]
                                    }
                                    errorId="product-tax-rate-error"
                                    required
                                >
                                    <input
                                        required
                                        type="number"
                                        dir="ltr"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={
                                            form.taxRate
                                        }
                                        aria-invalid={Boolean(
                                            errors.tax_rate,
                                        )}
                                        aria-describedby={
                                            errors.tax_rate
                                                ? 'product-tax-rate-error'
                                                : undefined
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            setForm(
                                                (
                                                    current,
                                                ) => ({
                                                    ...current,

                                                    taxRate:
                                                        event
                                                            .target
                                                            .value,
                                                }),
                                            )
                                        }
                                        className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] px-3.5 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                                    />
                                </Field>
                            </div>

                            <Field
                                label={t(
                                    'ui.description',
                                )}
                                error={
                                    errors
                                        .description?.[0]
                                }
                                errorId="product-description-error"
                                optional
                            >
                                <textarea
                                    rows={
                                        5
                                    }
                                    maxLength={
                                        5000
                                    }
                                    value={
                                        form.description
                                    }
                                    aria-invalid={Boolean(
                                        errors.description,
                                    )}
                                    aria-describedby={
                                        errors.description
                                            ? 'product-description-error'
                                            : undefined
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setForm(
                                            (
                                                current,
                                            ) => ({
                                                ...current,

                                                description:
                                                    event
                                                        .target
                                                        .value,
                                            }),
                                        )
                                    }
                                    className="w-full resize-y rounded-[14px] border border-[var(--ac-line)] px-3.5 py-3 text-sm leading-6 outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                                />
                            </Field>
                        </div>

                        {error && (
                            <div
                                role="alert"
                                className="mt-5 rounded-[15px] border border-[var(--ac-danger)]/15 bg-[var(--ac-danger)]/5 px-4 py-3 text-sm text-[var(--ac-danger)]"
                            >
                                {
                                    error
                                }
                            </div>
                        )}
                    </div>

                    <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 sm:px-6">
                        <button
                            type="button"
                            disabled={
                                busy
                            }
                            onClick={
                                closeDialog
                            }
                            className="h-11 rounded-[14px] border border-[var(--ac-line)] bg-white text-sm font-semibold transition hover:border-[var(--ac-line-strong)] disabled:opacity-50"
                        >
                            {t(
                                'ui.cancel',
                            )}
                        </button>

                        <button
                            type="submit"
                            disabled={
                                busy
                            }
                            className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-text)] text-sm font-semibold text-white transition hover:-translate-y-px disabled:translate-y-0 disabled:opacity-50 motion-reduce:transform-none"
                        >
                            <Save
                                size={
                                    15
                                }
                            />

                            {busy
                                ? t(
                                      'ui.saving',
                                  )
                                : t(
                                      'ui.save_item',
                                  )}
                        </button>
                    </footer>
                </form>
            </aside>
        </div>
    );

    return createPortal(
        surface,
        document.body,
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
                    : 'border-[var(--ac-line)] bg-white hover:border-[var(--ac-line-strong)]',
            ].join(
                ' ',
            )}
        >
            <Icon
                size={
                    17
                }
            />

            <p className="mt-3 text-sm font-semibold">
                {
                    title
                }
            </p>

            <p className="mt-1 text-[10px] leading-4 text-[var(--ac-text-muted)]">
                {
                    description
                }
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

    children:
        React.ReactNode;
};

/**
 * Render a Product field with explicit requirement state.
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
                    {
                        label
                    }
                </span>

                <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-text-muted)]">
                    {required
                        ? t(
                              'ui.required',
                          )
                        : optional
                          ? t(
                                'ui.optional',
                            )
                          : ''}
                </span>
            </div>

            {
                children
            }

            {error && (
                <p
                    id={
                        errorId
                    }
                    role="alert"
                    className="mt-1.5 text-xs text-[var(--ac-danger)]"
                >
                    {
                        error
                    }
                </p>
            )}
        </label>
    );
}
