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
    type TranslationKey,
} from '@/lib/i18n';
import {
    Boxes,
    Calculator,
    Hash,
    Package,
    Save,
    TriangleAlert,
    Wrench,
    X,
    type LucideIcon,
} from 'lucide-react';
import {
    useEffect,
    useState,
    type FormEvent,
    type ReactNode,
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

type UnitPreset = {
    value: string;

    label: TranslationKey;
};

const PRODUCT_UNITS:
    UnitPreset[] = [
        {
            value:
                'unit',

            label:
                'catalog.unit.unit',
        },

        {
            value:
                'piece',

            label:
                'catalog.unit.piece',
        },

        {
            value:
                'box',

            label:
                'catalog.unit.box',
        },

        {
            value:
                'kg',

            label:
                'catalog.unit.kg',
        },

        {
            value:
                'liter',

            label:
                'catalog.unit.liter',
        },

        {
            value:
                'meter',

            label:
                'catalog.unit.meter',
        },
    ];

const SERVICE_UNITS:
    UnitPreset[] = [
        {
            value:
                'hour',

            label:
                'catalog.unit.hour',
        },

        {
            value:
                'visit',

            label:
                'catalog.unit.visit',
        },

        {
            value:
                'trip',

            label:
                'catalog.unit.trip',
        },

        {
            value:
                'km',

            label:
                'catalog.unit.km',
        },

        {
            value:
                'person',

            label:
                'catalog.unit.person',
        },

        {
            value:
                'day',

            label:
                'catalog.unit.day',
        },

        {
            value:
                'project',

            label:
                'catalog.unit.project',
        },

        {
            value:
                'job',

            label:
                'catalog.unit.job',
        },
    ];

/**
 * Return the clean default catalog editor state.
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
 * Convert one API catalog item into editable fields.
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
 * Resolve the most useful API error without exposing internal information.
 */
function errorMessage(
    exception: unknown,
): string {
    if (
        exception instanceof
        ApiError
    ) {
        const firstFieldMessage =
            Object.values(
                exception.errors,
            )
                .flat()
                .find(
                    Boolean,
                );

        return firstFieldMessage
            ?? exception.message;
    }

    return t(
        'ui.acconova_could_not_save_this_catalog_item',
    );
}

/**
 * Render the shared Product/Service create and edit surface.
 *
 * Product quantity represents physical stock when Inventory is enabled.
 * Service quantity represents only commercial billing units and never creates
 * warehouse state.
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
     * Close only while no catalog mutation is running.
     */
    function closeDialog(): void {
        if (
            ! busy
        ) {
            onClose();
        }
    }

    /**
     * Switch between physical Product and Service semantics.
     */
    function chooseType(
        type: ProductType,
    ): void {
        setForm(
            (
                current,
            ) => ({
                ...current,

                type,

                /*
                 * A fresh type switch receives a sensible starting unit only
                 * when the previous generic default is still untouched.
                 */
                unit:
                    current.unit ===
                        'unit'
                    && type ===
                        'service'
                        ? 'hour'
                        : current.unit,
            }),
        );

        setErrors(
            (
                current,
            ) => {
                const next = {
                    ...current,
                };

                delete next.type;

                return next;
            },
        );

        setError(
            null,
        );
    }

    /**
     * Apply one canonical unit while still allowing arbitrary custom units.
     */
    function chooseUnit(
        value: string,
    ): void {
        setForm(
            (
                current,
            ) => ({
                ...current,

                unit:
                    value,
            }),
        );
    }

    /**
     * Persist one Product or Service.
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
                    || (
                        form.type ===
                            'service'
                            ? 'hour'
                            : 'unit'
                    ),

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
                errorMessage(
                    exception,
                ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    if (
        ! open
        || typeof document ===
            'undefined'
    ) {
        return null;
    }

    const service =
        form.type ===
        'service';

    const units =
        service
            ? SERVICE_UNITS
            : PRODUCT_UNITS;

    const convertingProductToService =
        product?.type ===
            'product'
        && service;

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
                className="absolute inset-y-0 end-0 z-10 flex h-[100dvh] w-full flex-col overflow-hidden border-s border-[var(--ac-line)] bg-white shadow-[-40px_0_100px_rgba(20,35,30,0.16)] sm:max-w-[660px]"
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
                            className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]"
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
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <TypeButton
                                active={
                                    form.type === 'product'
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
                                    chooseType(
                                        'product',
                                    )
                                }
                            />

                            <TypeButton
                                active={
                                    service
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
                                    chooseType(
                                        'service',
                                    )
                                }
                            />
                            <TypeButton active={form.type === 'raw_material'} icon={Boxes}
                                title={t('production.rawMaterial')} description={t('production.rawMaterialHelp')}
                                onClick={() => chooseType('raw_material')} />
                        </div>

                        {errors
                            .type?.[0] && (
                            <p
                                role="alert"
                                className="mt-2 text-xs text-[var(--ac-danger)]"
                            >
                                {
                                    errors
                                        .type[0]
                                }
                            </p>
                        )}

                        <CatalogSemanticsCard
                            service={
                                service
                            }
                        />

                        {convertingProductToService && (
                            <div className="mt-3 flex gap-3 rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-amber-900">
                                <TriangleAlert
                                    size={
                                        17
                                    }
                                    className="mt-0.5 shrink-0"
                                />

                                <p className="text-xs leading-5">
                                    {t(
                                        'catalog.productToServiceWarning',
                                    )}
                                </p>
                            </div>
                        )}

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

                                            <bdi
                                                dir="ltr"
                                                className="mt-2 block text-sm font-semibold"
                                            >
                                                {product
                                                    ?.sku
                                                    ?? t(
                                                        'lifecycle.assignedAfterSave',
                                                    )}
                                            </bdi>
                                        </div>
                                    </div>
                                </div>

                                <Field
                                    label={t(
                                        service
                                            ? 'catalog.billingUnit'
                                            : 'catalog.stockSalesUnit',
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
                                        className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] px-3.5 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                                    />
                                </Field>
                            </div>

                            <div>
                                <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-text-muted)]">
                                    {t(
                                        'catalog.unitSuggestions',
                                    )}
                                </p>

                                <div className="flex flex-wrap gap-2">
                                    {units.map(
                                        (
                                            unit,
                                        ) => (
                                            <button
                                                key={
                                                    unit.value
                                                }
                                                type="button"
                                                onClick={() =>
                                                    chooseUnit(
                                                        unit.value,
                                                    )
                                                }
                                                className={[
                                                    'rounded-full border px-3 py-1.5 text-[10px] font-semibold transition',
                                                    form.unit ===
                                                    unit.value
                                                        ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                                                        : 'border-[var(--ac-line)] bg-white text-[var(--ac-text-soft)] hover:border-[var(--ac-line-strong)]',
                                                ].join(
                                                    ' ',
                                                )}
                                            >
                                                {t(
                                                    unit.label,
                                                )}
                                            </button>
                                        ),
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-5 sm:grid-cols-3">
                                <Field
                                    label={t(
                                        service
                                            ? 'catalog.servicePrice'
                                            : 'catalog.productPrice',
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

                            <div className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4">
                                <div className="flex gap-3">
                                    <Calculator
                                        size={
                                            16
                                        }
                                        className="mt-0.5 shrink-0 text-[var(--ac-accent-strong)]"
                                    />

                                    <p className="text-xs leading-5 text-[var(--ac-text-soft)]">
                                        {t(
                                            service
                                                ? 'catalog.quantityExampleService'
                                                : 'catalog.quantityExampleProduct',
                                        )}
                                    </p>
                                </div>
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
                            className="h-11 rounded-[14px] border border-[var(--ac-line)] bg-white text-sm font-semibold disabled:opacity-50"
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
                            className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-text)] text-sm font-semibold text-white disabled:opacity-50"
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

type CatalogSemanticsCardProps = {
    service: boolean;
};

/**
 * Explain whether quantity belongs to physical Inventory or commercial
 * billing.
 */
function CatalogSemanticsCard({
    service,
}: CatalogSemanticsCardProps) {
    const Icon:
        LucideIcon =
        service
            ? Calculator
            : Boxes;

    return (
        <div
            className={[
                'mt-3 rounded-[18px] border p-4',
                service
                    ? 'border-sky-200 bg-sky-50'
                    : 'border-[var(--ac-accent)]/20 bg-[var(--ac-accent-soft)]',
            ].join(
                ' ',
            )}
        >
            <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-white shadow-sm">
                    <Icon
                        size={
                            15
                        }
                    />
                </div>

                <div>
                    <p className="text-xs font-semibold">
                        {t(
                            service
                                ? 'catalog.serviceRuleTitle'
                                : 'catalog.productRuleTitle',
                        )}
                    </p>

                    <p className="mt-1 text-xs leading-5 text-[var(--ac-text-soft)]">
                        {t(
                            service
                                ? 'catalog.serviceRuleHelp'
                                : 'catalog.productRuleHelp',
                        )}
                    </p>

                    {service && (
                        <p className="mt-2 text-[10px] font-semibold leading-4 text-sky-800">
                            {t(
                                'catalog.serviceNoWarehouse',
                            )}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

type TypeButtonProps = {
    active: boolean;

    icon:
        typeof Package;

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

    children: ReactNode;
};

/**
 * Render one catalog field with explicit requirement state.
 */
function Field({
    error,
    errorId,
    label,
    required = false,
    optional = false,
    children,
}: FieldProps) {
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
