import {
    fetchProducts,
} from '@/features/products/api';
import type {
    Product,
} from '@/features/products/types';
import {
    ApiError,
    apiRequest,
} from '@/lib/http';
import {
    calculateBatchUsageRate,
    compatibleMeasurementUnits,
    convertMeasurementQuantity,
    normalizeMeasurementQuantity,
} from '@/lib/measurement-units';
import {
    t,
    useLocale,
} from '@/lib/i18n';
import type {
    AppPageProps,
} from '@/types/app';
import {
    Link,
    usePage,
} from '@inertiajs/react';
import {
    ArrowUpRight,
    Beaker,
    Calculator,
    Check,
    Factory,
    History,
    Pencil,
    Plus,
    Save,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
    type FormEvent,
} from 'react';

type RecipeRawMaterial = {
    id: number;
    name: string;
    sku: string | null;
    unit: string;
    track_inventory: boolean;
};

type RecipeOption = {
    id: number;
    quantity_per_unit: string;
    usage_unit?: string | null;
    usage_quantity_per_unit?: string | null;
    is_default: boolean;
    raw_material: RecipeRawMaterial;
};

type RecipeComponent = {
    id: number;
    name: string;
    position: number;
    options: RecipeOption[];
};

type Recipe = {
    id: number;
    version: number;
    is_active: boolean;
    notes: string | null;
    created_at: string;
    components: RecipeComponent[];
};

type RecipeVersion = {
    id: number;
    version: number;
    is_active: boolean;
    notes: string | null;
    created_at: string;
};

type RecipeResponse = {
    data: {
        active: Recipe | null;
        versions: RecipeVersion[];
    };
};

type SelectableRawMaterial = {
    id: number;
    name: string;
    sku: string | null;
    unit: string;
    track_inventory: boolean;
};

type EntryMode =
    | 'batch'
    | 'per_unit';

type EditableOption = {
    rawMaterial: SelectableRawMaterial;
    isDefault: boolean;
    usageUnit: string;
    entryMode: EntryMode;
    perUnitQuantity: string;
    batchMaterialQuantity: string;
    batchOutputQuantity: string;
};

type EditableComponent = {
    localId: string;
    name: string;
    options: EditableOption[];
};

const inputClass =
    'mt-1 w-full rounded-xl border border-[var(--ac-line)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--ac-accent)]';

const buttonClass =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--ac-line)] bg-white px-3 py-2 text-xs font-semibold transition hover:bg-[var(--ac-accent-soft)] disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Create a stable client-only Recipe component ID.
 */
function createLocalId(): string {
    if (
        typeof crypto !==
            'undefined'
        && typeof crypto.randomUUID ===
            'function'
    ) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
}

/**
 * Convert a Product search result into the smaller Recipe material shape.
 */
function toRawMaterial(
    product: Product,
): SelectableRawMaterial {
    return {
        id:
            product.id,
        name:
            product.name,
        sku:
            product.sku,
        unit:
            product.unit,
        track_inventory:
            product.track_inventory,
    };
}

/**
 * Return the human-entered per-unit rate for one editable option.
 */
function optionUsageRate(
    option: EditableOption,
): string {
    return option.entryMode ===
        'batch'
        ? calculateBatchUsageRate(
              option.batchMaterialQuantity,
              option.batchOutputQuantity,
          )
        : normalizeMeasurementQuantity(
              option.perUnitQuantity,
              8,
          );
}

/**
 * Render Recipe configuration only.
 *
 * Actual physical material consumption belongs to the central Production Run
 * workflow. Recipe quantities are normalized into the Raw Material stock unit
 * by the backend while users may work in compatible units such as g or kg.
 */
export function ProductionPanel({
    product,
}: {
    product: Product;
}) {
    const locale =
        useLocale();

    const {
        workspace,
    } =
        usePage<AppPageProps>().props;

    const role =
        workspace
            .activeOrganization
            ?.role;

    const permissions =
        workspace
            .activeOrganization
            ?.permissions;

    const canManageRecipe =
        (
            permissions
                ? permissions.includes(
                      'inventory.manage',
                  )
                : [
                      'owner',
                      'admin',
                      'manager',
                  ].includes(
                      role ?? '',
                  )
        )
        && ! product.deleted_at;

    const endpoint =
        `/api/products/${product.id}/production-recipe`;

    const [
        recipe,
        setRecipe,
    ] =
        useState<Recipe | null>(
            null,
        );

    const [
        versions,
        setVersions,
    ] =
        useState<
            RecipeVersion[]
        >([]);

    const [
        loading,
        setLoading,
    ] =
        useState(
            true,
        );

    const [
        error,
        setError,
    ] =
        useState(
            '',
        );

    const [
        saved,
        setSaved,
    ] =
        useState(
            false,
        );

    const [
        editing,
        setEditing,
    ] =
        useState(
            false,
        );

    const [
        saving,
        setSaving,
    ] =
        useState(
            false,
        );

    const [
        revision,
        setRevision,
    ] =
        useState(
            0,
        );

    const [
        editableComponents,
        setEditableComponents,
    ] =
        useState<
            EditableComponent[]
        >([]);

    const [
        recipeNotes,
        setRecipeNotes,
    ] =
        useState(
            '',
        );

    const [
        targetComponentId,
        setTargetComponentId,
    ] =
        useState<
            string | null
        >(
            null,
        );

    const [
        materialSearch,
        setMaterialSearch,
    ] =
        useState(
            '',
        );

    const [
        materialOptions,
        setMaterialOptions,
    ] =
        useState<
            Product[]
        >([]);

    const [
        searching,
        setSearching,
    ] =
        useState(
            false,
        );

    const copy =
        locale ===
        'ar'
            ? {
                  productionCenter:
                      'فتح مركز الإنتاج',
                  productionHelp:
                      'الإنتاج الفعلي والمواد المستهلكة والترحيل تتم من مركز الإنتاج.',
                  recipeHelp:
                      'الوصفة معيار متوقع فقط. تستطيع إدخال المادة بالجرام أو الكيلو، بينما AccoNova يحفظها تلقائيًا بوحدة المخزون.',
                  batch:
                      'حسب دفعة',
                  perUnit:
                      'لكل وحدة',
                  materialQuantity:
                      'كمية المادة',
                  produces:
                      'تعطي تقريبًا',
                  usageUnit:
                      'وحدة الاستخدام',
                  calculated:
                      'الاستهلاك المحسوب لكل وحدة',
                  stockEquivalent:
                      'المكافئ بوحدة المخزون',
                  enterBatch:
                      'أدخل كمية المادة وعدد الوحدات الناتجة ليتم الحساب تلقائيًا.',
                  cancel:
                      'إلغاء',
                  incomplete:
                      'أكمل اسم المكوّن واختر مادة خام وأدخل كمية صحيحة. في وضع حسب دفعة يجب إدخال كمية المادة وعدد الوحدات الناتجة.',
                  versions:
                      'إصدارات الوصفة',
                  active:
                      'نشطة',
                  stockUnit:
                      'وحدة المخزون',
                  usageExample:
                      'مثال: 150 g تنتج 350 قطعة، فيحسب النظام الاستهلاك بالجرام ثم يحوله تلقائيًا إلى kg للمخزون.',
              }
            : {
                  productionCenter:
                      'Open Production Center',
                  productionHelp:
                      'Actual production, consumed materials and Posting are handled in the Production Center.',
                  recipeHelp:
                      'The Recipe is an expected standard only. Enter material in g or kg and AccoNova normalizes it into the stock unit automatically.',
                  batch:
                      'From a batch',
                  perUnit:
                      'Per unit',
                  materialQuantity:
                      'Material quantity',
                  produces:
                      'Produces approximately',
                  usageUnit:
                      'Usage unit',
                  calculated:
                      'Calculated usage per unit',
                  stockEquivalent:
                      'Stock-unit equivalent',
                  enterBatch:
                      'Enter the material quantity and produced units to calculate automatically.',
                  cancel:
                      'Cancel',
                  incomplete:
                      'Complete each component, select a Raw Material, and enter a valid quantity. Batch mode requires material quantity and produced units.',
                  versions:
                      'Recipe versions',
                  active:
                      'Active',
                  stockUnit:
                      'Stock unit',
                  usageExample:
                      'Example: 150 g produces 350 pieces. AccoNova calculates the gram rate and automatically normalizes it into kg for stock.',
              };

    /**
     * Load active Recipe and immutable Recipe versions.
     */
    useEffect(
        () => {
            let active =
                true;

            setLoading(
                true,
            );

            setError(
                '',
            );

            apiRequest<RecipeResponse>(
                endpoint,
            )
                .then(
                    (
                        response,
                    ) => {
                        if (
                            ! active
                        ) {
                            return;
                        }

                        setRecipe(
                            response
                                .data
                                .active,
                        );

                        setVersions(
                            response
                                .data
                                .versions,
                        );
                    },
                )
                .catch(
                    (
                        failure:
                            unknown,
                    ) => {
                        if (
                            active
                        ) {
                            setError(
                                failure instanceof
                                    ApiError
                                    ? failure.message
                                    : t(
                                          'catalog.operations.failed',
                                      ),
                            );
                        }
                    },
                )
                .finally(
                    () => {
                        if (
                            active
                        ) {
                            setLoading(
                                false,
                            );
                        }
                    },
                );

            return () => {
                active =
                    false;
            };
        },
        [
            endpoint,
            revision,
        ],
    );

    /**
     * Search active Raw Materials while one component is selecting an option.
     */
    useEffect(
        () => {
            if (
                ! editing
                || targetComponentId ===
                    null
            ) {
                return;
            }

            let active =
                true;

            const timer =
                window.setTimeout(
                    () => {
                        setSearching(
                            true,
                        );

                        fetchProducts({
                            type:
                                'raw_material',
                            status:
                                'active',
                            search:
                                materialSearch,
                            perPage:
                                25,
                        })
                            .then(
                                (
                                    response,
                                ) => {
                                    if (
                                        active
                                    ) {
                                        setMaterialOptions(
                                            response.data,
                                        );
                                    }
                                },
                            )
                            .catch(
                                (
                                    failure:
                                        unknown,
                                ) => {
                                    if (
                                        active
                                    ) {
                                        setError(
                                            failure instanceof
                                                ApiError
                                                ? failure.message
                                                : t(
                                                      'catalog.operations.failed',
                                                  ),
                                        );
                                    }
                                },
                            )
                            .finally(
                                () => {
                                    if (
                                        active
                                    ) {
                                        setSearching(
                                            false,
                                        );
                                    }
                                },
                            );
                    },
                    250,
                );

            return () => {
                active =
                    false;

                window.clearTimeout(
                    timer,
                );
            };
        },
        [
            editing,
            materialSearch,
            targetComponentId,
        ],
    );

    /**
     * Begin editing by cloning the immutable active Recipe.
     */
    function beginEditing(): void {
        setError(
            '',
        );

        setSaved(
            false,
        );

        setEditableComponents(
            recipe
                ? recipe.components.map(
                      (
                          component,
                      ) => ({
                          localId:
                              createLocalId(),
                          name:
                              component.name,
                          options:
                              component.options.map(
                                  (
                                      option,
                                  ) => ({
                                      rawMaterial: {
                                          ...option.raw_material,
                                      },
                                      isDefault:
                                          option.is_default,
                                      usageUnit:
                                          option.usage_unit
                                          ?? option.raw_material.unit,
                                      entryMode:
                                          'per_unit',
                                      perUnitQuantity:
                                          option.usage_quantity_per_unit
                                          ?? option.quantity_per_unit,
                                      batchMaterialQuantity:
                                          '',
                                      batchOutputQuantity:
                                          '',
                                  }),
                              ),
                      }),
                  )
                : [
                      {
                          localId:
                              createLocalId(),
                          name:
                              '',
                          options:
                              [],
                      },
                  ],
        );

        setRecipeNotes(
            recipe?.notes
            ?? '',
        );

        setTargetComponentId(
            null,
        );

        setEditing(
            true,
        );
    }

    /**
     * Cancel local Recipe editing.
     */
    function cancelEditing(): void {
        setEditing(
            false,
        );

        setTargetComponentId(
            null,
        );

        setMaterialSearch(
            '',
        );

        setMaterialOptions(
            [],
        );

        setError(
            '',
        );
    }

    /**
     * Add one logical Recipe component.
     */
    function addComponent(): void {
        setEditableComponents(
            (
                current,
            ) => [
                ...current,
                {
                    localId:
                        createLocalId(),
                    name:
                        '',
                    options:
                        [],
                },
            ],
        );
    }

    /**
     * Remove one local Recipe component.
     */
    function removeComponent(
        localId: string,
    ): void {
        setEditableComponents(
            (
                current,
            ) =>
                current.filter(
                    (
                        component,
                    ) =>
                        component.localId !==
                        localId,
                ),
        );

        if (
            targetComponentId ===
            localId
        ) {
            setTargetComponentId(
                null,
            );
        }
    }

    /**
     * Add one Raw Material option to a Recipe component.
     */
    function addMaterial(
        localId: string,
        material: Product,
    ): void {
        const raw =
            toRawMaterial(
                material,
            );

        setEditableComponents(
            (
                current,
            ) =>
                current.map(
                    (
                        component,
                    ) => {
                        if (
                            component.localId !==
                                localId
                            || component.options.some(
                                (
                                    option,
                                ) =>
                                    option.rawMaterial.id ===
                                    raw.id,
                            )
                        ) {
                            return component;
                        }

                        return {
                            ...component,
                            options: [
                                ...component.options,
                                {
                                    rawMaterial:
                                        raw,
                                    isDefault:
                                        component.options.length ===
                                        0,
                                    usageUnit:
                                        raw.unit,
                                    entryMode:
                                        'batch',
                                    perUnitQuantity:
                                        '',
                                    batchMaterialQuantity:
                                        '',
                                    batchOutputQuantity:
                                        '',
                                },
                            ],
                        };
                    },
                ),
        );

        setTargetComponentId(
            null,
        );

        setMaterialSearch(
            '',
        );

        setMaterialOptions(
            [],
        );
    }

    /**
     * Remove one Raw Material option.
     */
    function removeMaterial(
        localId: string,
        materialId: number,
    ): void {
        setEditableComponents(
            (
                current,
            ) =>
                current.map(
                    (
                        component,
                    ) => {
                        if (
                            component.localId !==
                            localId
                        ) {
                            return component;
                        }

                        const options =
                            component.options.filter(
                                (
                                    option,
                                ) =>
                                    option.rawMaterial.id !==
                                    materialId,
                            );

                        if (
                            options.length >
                                0
                            && ! options.some(
                                (
                                    option,
                                ) =>
                                    option.isDefault,
                            )
                        ) {
                            options[
                                0
                            ] = {
                                ...options[
                                    0
                                ],
                                isDefault:
                                    true,
                            };
                        }

                        return {
                            ...component,
                            options,
                        };
                    },
                ),
        );
    }

    /**
     * Set the default Raw Material alternative for one component.
     */
    function makeDefault(
        localId: string,
        materialId: number,
    ): void {
        setEditableComponents(
            (
                current,
            ) =>
                current.map(
                    (
                        component,
                    ) =>
                        component.localId !==
                        localId
                            ? component
                            : {
                                  ...component,
                                  options:
                                      component.options.map(
                                          (
                                              option,
                                          ) => ({
                                              ...option,
                                              isDefault:
                                                  option.rawMaterial.id ===
                                                  materialId,
                                          }),
                                      ),
                              },
                ),
        );
    }

    /**
     * Change between batch-based and direct per-unit entry.
     */
    function changeEntryMode(
        localId: string,
        materialId: number,
        entryMode: EntryMode,
    ): void {
        setEditableComponents(
            (
                current,
            ) =>
                current.map(
                    (
                        component,
                    ) =>
                        component.localId !==
                        localId
                            ? component
                            : {
                                  ...component,
                                  options:
                                      component.options.map(
                                          (
                                              option,
                                          ) =>
                                              option.rawMaterial.id ===
                                              materialId
                                                  ? {
                                                        ...option,
                                                        entryMode,
                                                    }
                                                  : option,
                                      ),
                              },
                ),
        );
    }

    /**
     * Change the human usage unit without changing the represented physical
     * quantity already entered by the user.
     */
    function changeUsageUnit(
        localId: string,
        materialId: number,
        nextUnit: string,
    ): void {
        setEditableComponents(
            (
                current,
            ) =>
                current.map(
                    (
                        component,
                    ) =>
                        component.localId !==
                        localId
                            ? component
                            : {
                                  ...component,
                                  options:
                                      component.options.map(
                                          (
                                              option,
                                          ) => {
                                              if (
                                                  option.rawMaterial.id !==
                                                  materialId
                                              ) {
                                                  return option;
                                              }

                                              const perUnitQuantity =
                                                  option.perUnitQuantity
                                                      ? convertMeasurementQuantity(
                                                            option.perUnitQuantity,
                                                            option.usageUnit,
                                                            nextUnit,
                                                            8,
                                                        )
                                                      : '';

                                              const batchMaterialQuantity =
                                                  option.batchMaterialQuantity
                                                      ? convertMeasurementQuantity(
                                                            option.batchMaterialQuantity,
                                                            option.usageUnit,
                                                            nextUnit,
                                                            8,
                                                        )
                                                      : '';

                                              return {
                                                  ...option,
                                                  usageUnit:
                                                      nextUnit,
                                                  perUnitQuantity,
                                                  batchMaterialQuantity,
                                              };
                                          },
                                      ),
                              },
                ),
        );
    }

    /**
     * Update one editable option field.
     */
    function updateOption(
        localId: string,
        materialId: number,
        values: Partial<EditableOption>,
    ): void {
        setEditableComponents(
            (
                current,
            ) =>
                current.map(
                    (
                        component,
                    ) =>
                        component.localId !==
                        localId
                            ? component
                            : {
                                  ...component,
                                  options:
                                      component.options.map(
                                          (
                                              option,
                                          ) =>
                                              option.rawMaterial.id ===
                                              materialId
                                                  ? {
                                                        ...option,
                                                        ...values,
                                                    }
                                                  : option,
                                      ),
                              },
                ),
        );
    }

    const valid =
        useMemo(
            () =>
                editableComponents.length >
                    0
                && editableComponents.every(
                    (
                        component,
                    ) =>
                        component.name.trim() !==
                            ''
                        && component.options.length >
                            0
                        && component.options.every(
                            (
                                option,
                            ) =>
                                optionUsageRate(
                                    option,
                                ) !==
                                '',
                        ),
                ),
            [
                editableComponents,
            ],
        );

    /**
     * Save the entire formula as a new immutable Recipe version.
     */
    async function saveRecipe(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            saving
            || ! valid
        ) {
            return;
        }

        setSaving(
            true,
        );

        setError(
            '',
        );

        setSaved(
            false,
        );

        try {
            await apiRequest(
                endpoint,
                {
                    method:
                        'POST',
                    body:
                        JSON.stringify({
                            notes:
                                recipeNotes.trim()
                                || null,
                            components:
                                editableComponents.map(
                                    (
                                        component,
                                    ) => ({
                                        name:
                                            component.name.trim(),
                                        options:
                                            component.options.map(
                                                (
                                                    option,
                                                ) => ({
                                                    raw_material_id:
                                                        option.rawMaterial.id,
                                                    quantity_per_unit:
                                                        optionUsageRate(
                                                            option,
                                                        ),
                                                    usage_unit:
                                                        option.usageUnit,
                                                    is_default:
                                                        option.isDefault,
                                                }),
                                            ),
                                    }),
                                ),
                        }),
                },
            );

            setEditing(
                false,
            );

            setSaved(
                true,
            );

            setTargetComponentId(
                null,
            );

            setRevision(
                (
                    current,
                ) =>
                    current
                    + 1,
            );
        } catch (
            failure
        ) {
            setError(
                failure instanceof
                    ApiError
                    ? [
                          failure.message,
                          ...Object.values(
                              failure.errors,
                          ).flat(),
                      ].join(
                          ' ',
                      )
                    : t(
                          'catalog.operations.failed',
                      ),
            );
        } finally {
            setSaving(
                false,
            );
        }
    }

    return (
        <section className="mt-7 border-t border-[var(--ac-line)] pt-6">
            <div className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                            <Factory size={18} />
                        </div>

                        <div>
                            <p className="text-sm font-semibold">
                                {copy.productionCenter}
                            </p>

                            <p className="mt-1 text-xs leading-5 text-[var(--ac-text-muted)]">
                                {copy.productionHelp}
                            </p>
                        </div>
                    </div>

                    {! product.deleted_at && (
                        <Link
                            href="/app/inventory/production"
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-text)] px-4 text-xs font-semibold text-white"
                        >
                            <Factory size={14} />
                            {copy.productionCenter}
                            <ArrowUpRight size={14} />
                        </Link>
                    )}
                </div>
            </div>

            <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <Beaker
                            size={17}
                            className="text-[var(--ac-accent-strong)]"
                        />

                        <h3 className="font-semibold">
                            {t(
                                'production.recipe.title',
                            )}
                        </h3>
                    </div>

                    <p className="mt-2 max-w-2xl text-xs leading-6 text-[var(--ac-text-soft)]">
                        {copy.recipeHelp}
                    </p>
                </div>

                {canManageRecipe
                    && ! editing && (
                        <button
                            type="button"
                            className={
                                buttonClass
                            }
                            onClick={
                                beginEditing
                            }
                        >
                            <Pencil size={14} />

                            {t(
                                recipe
                                    ? 'production.recipe.edit'
                                    : 'production.recipe.create',
                            )}
                        </button>
                    )}
            </div>

            <div className="mt-3 rounded-xl bg-[var(--ac-accent-soft)] p-3">
                <div className="flex gap-2">
                    <Calculator
                        size={15}
                        className="mt-0.5 shrink-0 text-[var(--ac-accent-strong)]"
                    />

                    <p className="text-xs leading-5 text-[var(--ac-text-soft)]">
                        {copy.usageExample}
                    </p>
                </div>
            </div>

            {error && (
                <div className="mt-4 rounded-xl border border-[var(--ac-danger)]/20 bg-[var(--ac-danger)]/5 p-3 text-xs text-[var(--ac-danger)]">
                    {error}
                </div>
            )}

            {saved && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--ac-accent-soft)] p-3 text-xs font-semibold text-[var(--ac-accent-strong)]">
                    <Check size={14} />

                    {t(
                        'production.recipe.saved',
                    )}
                </div>
            )}

            {loading ? (
                <div className="mt-4 rounded-2xl border border-[var(--ac-line)] p-5 text-xs text-[var(--ac-text-muted)]">
                    …
                </div>
            ) : recipe ? (
                <div className="mt-4 rounded-2xl border border-[var(--ac-line)] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm">
                            {t(
                                'production.recipe.version',
                                {
                                    version:
                                        recipe.version,
                                },
                            )}
                        </strong>

                        <span className="rounded-full bg-[var(--ac-accent-soft)] px-3 py-1 text-[10px] font-semibold text-[var(--ac-accent-strong)]">
                            {t(
                                'production.recipe.default',
                            )}
                        </span>
                    </div>

                    <div className="mt-4 space-y-3">
                        {recipe.components.map(
                            (
                                component,
                            ) => (
                                <div
                                    key={
                                        component.id
                                    }
                                    className="rounded-xl bg-[var(--ac-surface-soft)] p-3"
                                >
                                    <strong className="text-xs">
                                        {
                                            component.name
                                        }
                                    </strong>

                                    <div className="mt-2 space-y-2">
                                        {component.options.map(
                                            (
                                                option,
                                            ) => {
                                                const usageUnit =
                                                    option.usage_unit
                                                    ?? option.raw_material.unit;

                                                const usageRate =
                                                    option.usage_quantity_per_unit
                                                    ?? option.quantity_per_unit;

                                                const differentUnit =
                                                    usageUnit.toLowerCase()
                                                    !== option.raw_material.unit.toLowerCase();

                                                return (
                                                    <div
                                                        key={
                                                            option.id
                                                        }
                                                        className="rounded-lg bg-white px-3 py-2"
                                                    >
                                                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                                            <span className="font-medium">
                                                                {
                                                                    option.raw_material.name
                                                                }
                                                            </span>

                                                            <bdi
                                                                dir="ltr"
                                                                className="font-semibold"
                                                            >
                                                                {
                                                                    usageRate
                                                                }{' '}
                                                                {
                                                                    usageUnit
                                                                }{' '}
                                                                /{' '}
                                                                {
                                                                    product.unit
                                                                }
                                                            </bdi>
                                                        </div>

                                                        {differentUnit && (
                                                            <p
                                                                dir="ltr"
                                                                className="mt-1 text-start text-[10px] text-[var(--ac-text-muted)]"
                                                            >
                                                                {copy.stockEquivalent}:{' '}
                                                                {
                                                                    option.quantity_per_unit
                                                                }{' '}
                                                                {
                                                                    option.raw_material.unit
                                                                }{' '}
                                                                /{' '}
                                                                {
                                                                    product.unit
                                                                }
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            },
                                        )}
                                    </div>
                                </div>
                            ),
                        )}
                    </div>
                </div>
            ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-[var(--ac-line)] p-5">
                    <strong className="text-sm">
                        {t(
                            'production.recipe.none',
                        )}
                    </strong>

                    <p className="mt-2 text-xs text-[var(--ac-text-muted)]">
                        {t(
                            'production.recipe.noneHelp',
                        )}
                    </p>
                </div>
            )}

            {versions.length > 0
                && ! editing && (
                    <div className="mt-4 rounded-2xl border border-[var(--ac-line)] bg-white p-4">
                        <div className="flex items-center gap-2">
                            <History size={15} />

                            <p className="text-xs font-semibold">
                                {copy.versions}
                            </p>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                            {versions.map(
                                (
                                    version,
                                ) => (
                                    <span
                                        key={
                                            version.id
                                        }
                                        className="rounded-full bg-[var(--ac-bg-soft)] px-3 py-1.5 text-[10px] font-semibold"
                                    >
                                        v
                                        {
                                            version.version
                                        }

                                        {version.is_active
                                            ? ` · ${copy.active}`
                                            : ''}
                                    </span>
                                ),
                            )}
                        </div>
                    </div>
                )}

            {editing && (
                <form
                    onSubmit={(
                        event,
                    ) =>
                        void saveRecipe(
                            event,
                        )
                    }
                    className="mt-4 rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4"
                >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <strong className="text-sm">
                            {t(
                                recipe
                                    ? 'production.recipe.edit'
                                    : 'production.recipe.create',
                            )}
                        </strong>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                className={
                                    buttonClass
                                }
                                onClick={
                                    addComponent
                                }
                            >
                                <Plus size={14} />

                                {t(
                                    'production.recipe.addComponent',
                                )}
                            </button>

                            <button
                                type="button"
                                className={
                                    buttonClass
                                }
                                onClick={
                                    cancelEditing
                                }
                            >
                                <X size={14} />
                                {copy.cancel}
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 space-y-4">
                        {editableComponents.map(
                            (
                                component,
                            ) => (
                                <div
                                    key={
                                        component.localId
                                    }
                                    className="rounded-2xl border border-[var(--ac-line)] bg-white p-4"
                                >
                                    <div className="flex gap-3">
                                        <label className="min-w-0 flex-1 text-xs font-semibold">
                                            {t(
                                                'production.recipe.componentName',
                                            )}

                                            <input
                                                required
                                                value={
                                                    component.name
                                                }
                                                className={
                                                    inputClass
                                                }
                                                onChange={(
                                                    event,
                                                ) =>
                                                    setEditableComponents(
                                                        (
                                                            current,
                                                        ) =>
                                                            current.map(
                                                                (
                                                                    entry,
                                                                ) =>
                                                                    entry.localId ===
                                                                    component.localId
                                                                        ? {
                                                                              ...entry,
                                                                              name:
                                                                                  event.target.value,
                                                                          }
                                                                        : entry,
                                                            ),
                                                    )
                                                }
                                            />
                                        </label>

                                        <button
                                            type="button"
                                            className="mt-5 flex size-10 items-center justify-center rounded-xl border border-[var(--ac-line)] text-red-600"
                                            onClick={() =>
                                                removeComponent(
                                                    component.localId,
                                                )
                                            }
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>

                                    <div className="mt-4 flex items-center justify-between gap-3">
                                        <p className="text-xs font-semibold">
                                            {t(
                                                'production.recipe.materialOptions',
                                            )}
                                        </p>

                                        <button
                                            type="button"
                                            className={
                                                buttonClass
                                            }
                                            onClick={() => {
                                                setTargetComponentId(
                                                    component.localId,
                                                );

                                                setMaterialSearch(
                                                    '',
                                                );
                                            }}
                                        >
                                            <Plus size={14} />

                                            {t(
                                                'production.recipe.addAlternative',
                                            )}
                                        </button>
                                    </div>

                                    <div className="mt-3 space-y-3">
                                        {component.options.map(
                                            (
                                                option,
                                            ) => {
                                                const rate =
                                                    optionUsageRate(
                                                        option,
                                                    );

                                                const stockRate =
                                                    rate
                                                        ? convertMeasurementQuantity(
                                                              rate,
                                                              option.usageUnit,
                                                              option.rawMaterial.unit,
                                                              8,
                                                          )
                                                        : '';

                                                const choices =
                                                    compatibleMeasurementUnits(
                                                        option.rawMaterial.unit,
                                                    );

                                                return (
                                                    <div
                                                        key={
                                                            option.rawMaterial.id
                                                        }
                                                        className="rounded-2xl border border-[var(--ac-line)] p-3"
                                                    >
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div>
                                                                <strong className="text-xs">
                                                                    {
                                                                        option.rawMaterial.name
                                                                    }
                                                                </strong>

                                                                <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                                                    {copy.stockUnit}:{' '}
                                                                    {
                                                                        option.rawMaterial.unit
                                                                    }
                                                                </p>
                                                            </div>

                                                            <div className="flex flex-wrap gap-2">
                                                                <button
                                                                    type="button"
                                                                    className={[
                                                                        buttonClass,
                                                                        option.isDefault
                                                                            ? 'bg-[var(--ac-accent-soft)]'
                                                                            : '',
                                                                    ].join(
                                                                        ' ',
                                                                    )}
                                                                    onClick={() =>
                                                                        makeDefault(
                                                                            component.localId,
                                                                            option.rawMaterial.id,
                                                                        )
                                                                    }
                                                                >
                                                                    <Check size={13} />

                                                                    {option.isDefault
                                                                        ? t(
                                                                              'production.recipe.default',
                                                                          )
                                                                        : t(
                                                                              'production.recipe.makeDefault',
                                                                          )}
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    className={
                                                                        buttonClass
                                                                    }
                                                                    onClick={() =>
                                                                        removeMaterial(
                                                                            component.localId,
                                                                            option.rawMaterial.id,
                                                                        )
                                                                    }
                                                                >
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[var(--ac-bg-soft)] p-1">
                                                            <button
                                                                type="button"
                                                                className={[
                                                                    'rounded-lg px-3 py-2 text-xs font-semibold',
                                                                    option.entryMode ===
                                                                    'batch'
                                                                        ? 'bg-white shadow-sm'
                                                                        : 'text-[var(--ac-text-muted)]',
                                                                ].join(
                                                                    ' ',
                                                                )}
                                                                onClick={() =>
                                                                    changeEntryMode(
                                                                        component.localId,
                                                                        option.rawMaterial.id,
                                                                        'batch',
                                                                    )
                                                                }
                                                            >
                                                                <Calculator
                                                                    size={13}
                                                                    className="me-1 inline"
                                                                />
                                                                {copy.batch}
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className={[
                                                                    'rounded-lg px-3 py-2 text-xs font-semibold',
                                                                    option.entryMode ===
                                                                    'per_unit'
                                                                        ? 'bg-white shadow-sm'
                                                                        : 'text-[var(--ac-text-muted)]',
                                                                ].join(
                                                                    ' ',
                                                                )}
                                                                onClick={() =>
                                                                    changeEntryMode(
                                                                        component.localId,
                                                                        option.rawMaterial.id,
                                                                        'per_unit',
                                                                    )
                                                                }
                                                            >
                                                                {copy.perUnit}
                                                            </button>
                                                        </div>

                                                        <label className="mt-4 block text-xs font-semibold">
                                                            {copy.usageUnit}

                                                            <select
                                                                value={
                                                                    option.usageUnit
                                                                }
                                                                onChange={(
                                                                    event,
                                                                ) =>
                                                                    changeUsageUnit(
                                                                        component.localId,
                                                                        option.rawMaterial.id,
                                                                        event.target.value,
                                                                    )
                                                                }
                                                                className={
                                                                    inputClass
                                                                }
                                                            >
                                                                {choices.map(
                                                                    (
                                                                        choice,
                                                                    ) => (
                                                                        <option
                                                                            key={
                                                                                choice.value
                                                                            }
                                                                            value={
                                                                                choice.value
                                                                            }
                                                                        >
                                                                            {
                                                                                choice.label
                                                                            }
                                                                        </option>
                                                                    ),
                                                                )}
                                                            </select>
                                                        </label>

                                                        {option.entryMode ===
                                                        'batch' ? (
                                                            <div className="mt-4">
                                                                <div className="grid gap-3 sm:grid-cols-2">
                                                                    <label className="text-xs font-semibold">
                                                                        {copy.materialQuantity}

                                                                        <div className="relative">
                                                                            <input
                                                                                inputMode="decimal"
                                                                                value={
                                                                                    option.batchMaterialQuantity
                                                                                }
                                                                                placeholder="150"
                                                                                className={`${inputClass} pe-16`}
                                                                                onChange={(
                                                                                    event,
                                                                                ) =>
                                                                                    updateOption(
                                                                                        component.localId,
                                                                                        option.rawMaterial.id,
                                                                                        {
                                                                                            batchMaterialQuantity:
                                                                                                event.target.value,
                                                                                        },
                                                                                    )
                                                                                }
                                                                            />

                                                                            <span className="absolute end-3 top-1/2 mt-0.5 -translate-y-1/2 text-[10px] text-[var(--ac-text-muted)]">
                                                                                {
                                                                                    option.usageUnit
                                                                                }
                                                                            </span>
                                                                        </div>
                                                                    </label>

                                                                    <label className="text-xs font-semibold">
                                                                        {copy.produces}

                                                                        <div className="relative">
                                                                            <input
                                                                                inputMode="decimal"
                                                                                value={
                                                                                    option.batchOutputQuantity
                                                                                }
                                                                                placeholder="350"
                                                                                className={`${inputClass} pe-16`}
                                                                                onChange={(
                                                                                    event,
                                                                                ) =>
                                                                                    updateOption(
                                                                                        component.localId,
                                                                                        option.rawMaterial.id,
                                                                                        {
                                                                                            batchOutputQuantity:
                                                                                                event.target.value,
                                                                                        },
                                                                                    )
                                                                                }
                                                                            />

                                                                            <span className="absolute end-3 top-1/2 mt-0.5 -translate-y-1/2 text-[10px] text-[var(--ac-text-muted)]">
                                                                                {
                                                                                    product.unit
                                                                                }
                                                                            </span>
                                                                        </div>
                                                                    </label>
                                                                </div>

                                                                <div className="mt-3 rounded-xl bg-[var(--ac-accent-soft)] p-3">
                                                                    {rate ? (
                                                                        <>
                                                                            <p className="text-[10px] font-semibold text-[var(--ac-text-muted)]">
                                                                                {copy.calculated}
                                                                            </p>

                                                                            <p
                                                                                dir="ltr"
                                                                                className="mt-1 text-start text-sm font-semibold text-[var(--ac-accent-strong)]"
                                                                            >
                                                                                {
                                                                                    rate
                                                                                }{' '}
                                                                                {
                                                                                    option.usageUnit
                                                                                }{' '}
                                                                                /{' '}
                                                                                {
                                                                                    product.unit
                                                                                }
                                                                            </p>

                                                                            {stockRate && (
                                                                                <p
                                                                                    dir="ltr"
                                                                                    className="mt-1 text-start text-[11px] text-[var(--ac-text-soft)]"
                                                                                >
                                                                                    {copy.stockEquivalent}:{' '}
                                                                                    {
                                                                                        stockRate
                                                                                    }{' '}
                                                                                    {
                                                                                        option.rawMaterial.unit
                                                                                    }{' '}
                                                                                    /{' '}
                                                                                    {
                                                                                        product.unit
                                                                                    }
                                                                                </p>
                                                                            )}
                                                                        </>
                                                                    ) : (
                                                                        <p className="text-xs text-[var(--ac-text-muted)]">
                                                                            {copy.enterBatch}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="mt-4">
                                                                <label className="text-xs font-semibold">
                                                                    {copy.calculated}

                                                                    <div className="relative">
                                                                        <input
                                                                            inputMode="decimal"
                                                                            value={
                                                                                option.perUnitQuantity
                                                                            }
                                                                            placeholder="0.42857143"
                                                                            className={`${inputClass} pe-24`}
                                                                            onChange={(
                                                                                event,
                                                                            ) =>
                                                                                updateOption(
                                                                                    component.localId,
                                                                                    option.rawMaterial.id,
                                                                                    {
                                                                                        perUnitQuantity:
                                                                                            event.target.value,
                                                                                    },
                                                                                )
                                                                            }
                                                                        />

                                                                        <span className="absolute end-3 top-1/2 mt-0.5 -translate-y-1/2 text-[10px] text-[var(--ac-text-muted)]">
                                                                            {
                                                                                option.usageUnit
                                                                            }{' '}
                                                                            /{' '}
                                                                            {
                                                                                product.unit
                                                                            }
                                                                        </span>
                                                                    </div>
                                                                </label>

                                                                {stockRate && (
                                                                    <p
                                                                        dir="ltr"
                                                                        className="mt-2 text-start text-[10px] text-[var(--ac-text-muted)]"
                                                                    >
                                                                        {copy.stockEquivalent}:{' '}
                                                                        {
                                                                            stockRate
                                                                        }{' '}
                                                                        {
                                                                            option.rawMaterial.unit
                                                                        }{' '}
                                                                        /{' '}
                                                                        {
                                                                            product.unit
                                                                        }
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            },
                                        )}

                                        {component.options.length ===
                                            0 && (
                                            <div className="rounded-xl border border-dashed border-[var(--ac-line)] p-4 text-xs text-[var(--ac-text-muted)]">
                                                {t(
                                                    'production.recipe.noMaterials',
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {targetComponentId ===
                                        component.localId && (
                                        <div className="mt-3 rounded-xl border border-[var(--ac-line)] bg-[var(--ac-bg-soft)] p-3">
                                            <div className="flex items-center gap-2">
                                                <Search size={14} />

                                                <input
                                                    autoFocus
                                                    value={
                                                        materialSearch
                                                    }
                                                    onChange={(
                                                        event,
                                                    ) =>
                                                        setMaterialSearch(
                                                            event.target.value,
                                                        )
                                                    }
                                                    className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none"
                                                />

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setTargetComponentId(
                                                            null,
                                                        )
                                                    }
                                                >
                                                    <X size={13} />
                                                </button>
                                            </div>

                                            <div className="mt-3 max-h-52 space-y-1 overflow-y-auto">
                                                {searching ? (
                                                    <p className="p-3 text-xs">
                                                        …
                                                    </p>
                                                ) : (
                                                    materialOptions.map(
                                                        (
                                                            material,
                                                        ) => (
                                                            <button
                                                                type="button"
                                                                key={
                                                                    material.id
                                                                }
                                                                className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-start text-xs"
                                                                onClick={() =>
                                                                    addMaterial(
                                                                        component.localId,
                                                                        material,
                                                                    )
                                                                }
                                                            >
                                                                <span>
                                                                    {
                                                                        material.name
                                                                    }
                                                                </span>

                                                                <span className="text-[var(--ac-text-muted)]">
                                                                    {
                                                                        material.unit
                                                                    }
                                                                </span>
                                                            </button>
                                                        ),
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ),
                        )}
                    </div>

                    <label className="mt-4 block text-xs font-semibold">
                        {t(
                            'production.recipe.notes',
                        )}

                        <textarea
                            rows={3}
                            value={
                                recipeNotes
                            }
                            onChange={(
                                event,
                            ) =>
                                setRecipeNotes(
                                    event.target.value,
                                )
                            }
                            className={`${inputClass} resize-none`}
                        />
                    </label>

                    {! valid && (
                        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-[11px] text-amber-700">
                            {copy.incomplete}
                        </p>
                    )}

                    <div className="mt-4 flex justify-end gap-2">
                        <button
                            type="button"
                            className={
                                buttonClass
                            }
                            onClick={
                                cancelEditing
                            }
                        >
                            {copy.cancel}
                        </button>

                        <button
                            type="submit"
                            disabled={
                                saving
                                || ! valid
                            }
                            className="inline-flex items-center gap-2 rounded-xl bg-[var(--ac-text)] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                            <Save size={14} />

                            {saving
                                ? t(
                                      'production.recipe.saving',
                                  )
                                : t(
                                      'production.recipe.save',
                                  )}
                        </button>
                    </div>
                </form>
            )}
        </section>
    );
}