import {
    fetchWarehouses,
} from '@/features/inventory/api';
import type {
    Warehouse,
} from '@/features/inventory/types';
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
    t,
    useLocale,
} from '@/lib/i18n';
import type {
    AppPageProps,
} from '@/types/app';
import {
    usePage,
} from '@inertiajs/react';
import {
    Beaker,
    Check,
    FlaskConical,
    History,
    Pencil,
    Plus,
    Save,
    Search,
    Trash2,
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

    sku:
        | string
        | null;

    unit: string;

    track_inventory: boolean;
};

type RecipeOption = {
    id: number;

    quantity_per_unit: string;

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

    notes:
        | string
        | null;

    created_at: string;

    components: RecipeComponent[];
};

type RecipeResponse = {
    data: {
        active:
            | Recipe
            | null;

        versions: {
            id: number;

            version: number;

            is_active: boolean;

            notes:
                | string
                | null;

            created_at: string;
        }[];
    };
};

type Batch = {
    id: number;

    quantity: string;

    warehouse: string;

    created_at: string;

    note:
        | string
        | null;

    recipe_version:
        | number
        | null;

    materials: {
        id: number;

        name: string;

        quantity: string;

        unit: string;
    }[];
};

type HistoryResponse = {
    data: Batch[];

    meta: {
        last_page: number;
    };
};

type EditableOption = {
    rawMaterial: Product;

    quantityPerUnit: string;

    isDefault: boolean;
};

type EditableComponent = {
    localId: string;

    name: string;

    options: EditableOption[];
};

const inputClass =
    'mt-1 w-full rounded-xl border border-[var(--ac-line)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--ac-accent)]';

const buttonClass =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--ac-line)] bg-white px-3 py-2 text-xs font-semibold transition hover:bg-[var(--ac-accent-soft)] disabled:opacity-40';

/**
 * Render versioned production recipes, automatic material calculations, and
 * immutable production history for one finished Product.
 */
export function ProductionPanel({
    product,
}: {
    product: Product;
}) {
    useLocale();

    const {
        workspace,
    } =
        usePage<AppPageProps>().props;

    const role =
        workspace
            .activeOrganization
            ?.role;

    const canProduce =
        (
            workspace
                .activeOrganization
                ?.permissions
                ? workspace
                    .activeOrganization
                    .permissions
                    .includes(
                        'inventory.manage',
                    )
                : [
                    'owner',
                    'admin',
                    'manager',
                ].includes(
                    role ??
                    '',
                )
        )
        && ! product.deleted_at;

    const endpoint =
        `/api/products/${product.id}/production`;

    const recipeEndpoint =
        `/api/products/${product.id}/production-recipe`;

    const [
        warehouses,
        setWarehouses,
    ] =
        useState<Warehouse[]>(
            [],
        );

    const [
        warehouseId,
        setWarehouseId,
    ] =
        useState(
            '',
        );

    const [
        recipe,
        setRecipe,
    ] =
        useState<
            Recipe | null
        >(
            null,
        );

    const [
        versions,
        setVersions,
    ] =
        useState<
            RecipeResponse[
                'data'
            ][
                'versions'
            ]
        >(
            [],
        );

    const [
        quantity,
        setQuantity,
    ] =
        useState(
            '1',
        );

    const [
        selections,
        setSelections,
    ] =
        useState<
            Record<
                number,
                number
            >
        >({});

    const [
        note,
        setNote,
    ] =
        useState(
            '',
        );

    const [
        editingRecipe,
        setEditingRecipe,
    ] =
        useState(
            false,
        );

    const [
        editableComponents,
        setEditableComponents,
    ] =
        useState<
            EditableComponent[]
        >(
            [],
        );

    const [
        recipeNotes,
        setRecipeNotes,
    ] =
        useState(
            '',
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
        useState<Product[]>(
            [],
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
        page,
        setPage,
    ] =
        useState(
            1,
        );

    const [
        history,
        setHistory,
    ] =
        useState<
            HistoryResponse | null
        >(
            null,
        );

    const [
        loading,
        setLoading,
    ] =
        useState(
            true,
        );

    const [
        searching,
        setSearching,
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
        savingRecipe,
        setSavingRecipe,
    ] =
        useState(
            false,
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
        revision,
        setRevision,
    ] =
        useState(
            0,
        );

    /**
     * Initialize default material option selections from the active recipe.
     */
    function applyRecipeSelections(
        activeRecipe:
            Recipe | null,
    ): void {
        if (
            ! activeRecipe
        ) {
            setSelections(
                {},
            );

            return;
        }

        const next:
            Record<
                number,
                number
            > = {};

        activeRecipe
            .components
            .forEach(
                (
                    component,
                ) => {
                    const option =
                        component
                            .options
                            .find(
                                (
                                    candidate,
                                ) =>
                                    candidate
                                        .is_default,
                            )
                        ??
                        component
                            .options[
                                0
                            ];

                    if (option) {
                        next[
                            component.id
                        ] =
                            option.id;
                    }
                },
            );

        setSelections(
            next,
        );
    }

    useEffect(() => {
        let active =
            true;

        setLoading(
            true,
        );

        setError(
            '',
        );

        Promise.all([
            apiRequest<HistoryResponse>(
                `${endpoint}?page=${page}`,
            ),

            apiRequest<RecipeResponse>(
                recipeEndpoint,
            ),

            fetchWarehouses(),
        ])
            .then(
                ([
                    historyResponse,
                    recipeResponse,
                    locations,
                ]) => {
                    if (
                        ! active
                    ) {
                        return;
                    }

                    setHistory(
                        historyResponse,
                    );

                    setRecipe(
                        recipeResponse
                            .data
                            .active,
                    );

                    setVersions(
                        recipeResponse
                            .data
                            .versions,
                    );

                    applyRecipeSelections(
                        recipeResponse
                            .data
                            .active,
                    );

                    setWarehouses(
                        locations,
                    );

                    setWarehouseId(
                        (
                            current,
                        ) =>
                            current
                            || String(
                                locations.find(
                                    (
                                        item,
                                    ) =>
                                        item.is_default,
                                )?.id
                                ??
                                locations[
                                    0
                                ]?.id
                                ??
                                '',
                            ),
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
    }, [
        endpoint,
        page,
        recipeEndpoint,
        revision,
    ]);

    useEffect(() => {
        if (
            ! editingRecipe
            || targetComponentId ===
                null
        ) {
            return;
        }

        let active =
            true;

        setSearching(
            true,
        );

        const timer =
            window.setTimeout(
                () => {
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
    }, [
        editingRecipe,
        materialSearch,
        targetComponentId,
    ]);

    /**
     * Begin recipe editing by cloning the current active version into local
     * draft state. Saving later creates another immutable server version.
     */
    function beginRecipeEditing(): void {
        setEditableComponents(
            recipe
                ? recipe
                    .components
                    .map(
                        (
                            component,
                        ) => ({
                            localId:
                                crypto.randomUUID(),

                            name:
                                component.name,

                            options:
                                component
                                    .options
                                    .map(
                                        (
                                            option,
                                        ) => ({
                                            rawMaterial: {
                                                ...option.raw_material,

                                                type:
                                                    'raw_material',

                                                description:
                                                    null,

                                                unit_price:
                                                    '0.0000',

                                                cost_price:
                                                    null,

                                                tax_rate:
                                                    '0.00',

                                                inventory_eligible:
                                                    true,

                                                low_stock_threshold:
                                                    null,

                                                usable_for_new_business:
                                                    true,

                                                deleted_at:
                                                    null,

                                                created_at:
                                                    '',

                                                updated_at:
                                                    '',
                                            },

                                            quantityPerUnit:
                                                option
                                                    .quantity_per_unit,

                                            isDefault:
                                                option
                                                    .is_default,
                                        }),
                                    ),
                        }),
                    )
                : [
                    {
                        localId:
                            crypto.randomUUID(),

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

        setEditingRecipe(
            true,
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
     * Add one empty logical recipe component.
     */
    function addComponent(): void {
        setEditableComponents(
            (
                current,
            ) => [
                ...current,

                {
                    localId:
                        crypto.randomUUID(),

                    name:
                        '',

                    options:
                        [],
                },
            ],
        );
    }

    /**
     * Remove one local recipe component before version activation.
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
                        component
                            .localId !==
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
     * Add one Raw Material alternative to a recipe component.
     */
    function addMaterialOption(
        localId: string,
        rawMaterial: Product,
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
                            component
                                .localId !==
                            localId
                            || component
                                .options
                                .some(
                                    (
                                        option,
                                    ) =>
                                        option
                                            .rawMaterial
                                            .id ===
                                        rawMaterial.id,
                                )
                        ) {
                            return component;
                        }

                        return {
                            ...component,

                            options: [
                                ...component.options,

                                {
                                    rawMaterial,

                                    quantityPerUnit:
                                        '1',

                                    isDefault:
                                        component
                                            .options
                                            .length ===
                                        0,
                                },
                            ],
                        };
                    },
                ),
        );
    }

    /**
     * Make one material alternative the sole default for its component.
     */
    function makeDefault(
        localId: string,
        rawMaterialId: number,
    ): void {
        setEditableComponents(
            (
                current,
            ) =>
                current.map(
                    (
                        component,
                    ) =>
                        component
                            .localId !==
                        localId
                            ? component
                            : {
                                ...component,

                                options:
                                    component
                                        .options
                                        .map(
                                            (
                                                option,
                                            ) => ({
                                                ...option,

                                                isDefault:
                                                    option
                                                        .rawMaterial
                                                        .id ===
                                                    rawMaterialId,
                                            }),
                                        ),
                            },
                ),
        );
    }

    /**
     * Save the entire formula as a new immutable recipe version.
     */
    async function saveRecipe(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            savingRecipe
        ) {
            return;
        }

        setSavingRecipe(
            true,
        );

        setError(
            '',
        );

        try {
            await apiRequest(
                recipeEndpoint,
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
                                            component
                                                .name
                                                .trim(),

                                        options:
                                            component
                                                .options
                                                .map(
                                                    (
                                                        option,
                                                    ) => ({
                                                        raw_material_id:
                                                            option
                                                                .rawMaterial
                                                                .id,

                                                        quantity_per_unit:
                                                            option
                                                                .quantityPerUnit,

                                                        is_default:
                                                            option
                                                                .isDefault,
                                                    }),
                                                ),
                                    }),
                                ),
                        }),
                },
            );

            setEditingRecipe(
                false,
            );

            setTargetComponentId(
                null,
            );

            setRevision(
                (
                    value,
                ) =>
                    value
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

                        ...Object
                            .values(
                                failure.errors,
                            )
                            .flat(),
                    ].join(
                        ' ',
                    )
                    : t(
                        'catalog.operations.failed',
                    ),
            );
        } finally {
            setSavingRecipe(
                false,
            );
        }
    }

    /**
     * Record one batch using the active immutable recipe version.
     */
    async function submitProduction(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            saving
            || ! recipe
        ) {
            return;
        }

        setSaving(
            true,
        );

        setSaved(
            false,
        );

        setError(
            '',
        );

        try {
            await apiRequest(
                endpoint,
                {
                    method:
                        'POST',

                    body:
                        JSON.stringify({
                            warehouse_id:
                                Number(
                                    warehouseId,
                                ),

                            quantity,

                            recipe_id:
                                recipe.id,

                            selections,

                            note:
                                note.trim()
                                || null,
                        }),
                },
            );

            setSaved(
                true,
            );

            setQuantity(
                '1',
            );

            setNote(
                '',
            );

            setPage(
                1,
            );

            setRevision(
                (
                    value,
                ) =>
                    value
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

                        ...Object
                            .values(
                                failure.errors,
                            )
                            .flat(),
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

    const calculatedRequirements =
        useMemo(
            () =>
                recipe
                    ? recipe
                        .components
                        .map(
                            (
                                component,
                            ) => {
                                const selectedId =
                                    selections[
                                        component.id
                                    ];

                                const option =
                                    component
                                        .options
                                        .find(
                                            (
                                                candidate,
                                            ) =>
                                                candidate.id ===
                                                selectedId,
                                        )
                                    ??
                                    component
                                        .options[
                                            0
                                        ];

                                return {
                                    component,

                                    option,

                                    required:
                                        option
                                            ? consumptionTotal(
                                                quantity,
                                                option
                                                    .quantity_per_unit,
                                            )
                                            : '—',
                                };
                            },
                        )
                    : [],
            [
                quantity,
                recipe,
                selections,
            ],
        );

    return (
        <section className="mt-7 border-t border-[var(--ac-line)] pt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="font-semibold">
                        {t(
                            'production.recipe.title',
                        )}
                    </h3>

                    <p className="mt-2 max-w-2xl text-xs leading-6 text-[var(--ac-text-soft)]">
                        {t(
                            'production.recipe.help',
                        )}
                    </p>
                </div>

                {canProduce && (
                    <button
                        type="button"
                        className={
                            buttonClass
                        }
                        onClick={
                            beginRecipeEditing
                        }
                    >
                        <Pencil
                            size={
                                14
                            }
                        />

                        {t(
                            recipe
                                ? 'production.recipe.edit'
                                : 'production.recipe.create',
                        )}
                    </button>
                )}
            </div>

            <p className="mt-3 rounded-xl bg-[var(--ac-accent-soft)] p-3 text-xs leading-5">
                {t(
                    'production.precision.help',
                )}
            </p>

            {recipe ? (
                <div className="mt-4 rounded-2xl border border-[var(--ac-line)] bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <strong className="text-sm">
                            {t(
                                'production.recipe.version',
                                {
                                    version:
                                        recipe.version,
                                },
                            )}
                        </strong>

                        <span className="rounded-full bg-[var(--ac-accent-soft)] px-3 py-1 text-[10px] font-semibold">
                            <Check
                                size={
                                    12
                                }
                                className="me-1 inline"
                            />

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

                                    <div className="mt-2 space-y-1">
                                        {component.options.map(
                                            (
                                                option,
                                            ) => (
                                                <div
                                                    key={
                                                        option.id
                                                    }
                                                    className="flex flex-wrap items-center justify-between gap-2 text-xs"
                                                >
                                                    <span>
                                                        {
                                                            option
                                                                .raw_material
                                                                .name
                                                        }

                                                        {! option
                                                            .is_default && (
                                                            <span className="ms-2 text-[var(--ac-text-muted)]">
                                                                {t(
                                                                    'production.recipe.alternative',
                                                                )}
                                                            </span>
                                                        )}
                                                    </span>

                                                    <bdi dir="ltr">
                                                        {
                                                            option.quantity_per_unit
                                                        }{' '}
                                                        {
                                                            option
                                                                .raw_material
                                                                .unit
                                                        }{' '}
                                                        /{' '}
                                                        {
                                                            product.unit
                                                        }
                                                    </bdi>
                                                </div>
                                            ),
                                        )}
                                    </div>
                                </div>
                            ),
                        )}
                    </div>

                    <p className="mt-4 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                        {t(
                            'production.recipe.history',
                        )}
                    </p>
                </div>
            ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-[var(--ac-line)] p-5">
                    <strong className="text-sm">
                        {t(
                            'production.recipe.none',
                        )}
                    </strong>

                    <p className="mt-2 text-xs leading-5 text-[var(--ac-text-muted)]">
                        {t(
                            'production.recipe.noneHelp',
                        )}
                    </p>
                </div>
            )}

            {editingRecipe && (
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
                    <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm">
                            {t(
                                recipe
                                    ? 'production.recipe.edit'
                                    : 'production.recipe.create',
                            )}
                        </strong>

                        <button
                            type="button"
                            className={
                                buttonClass
                            }
                            onClick={
                                addComponent
                            }
                        >
                            <Plus
                                size={
                                    14
                                }
                            />

                            {t(
                                'production.recipe.addComponent',
                            )}
                        </button>
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
                                    <div className="flex items-start gap-3">
                                        <label className="min-w-0 flex-1 text-xs">
                                            {t(
                                                'production.recipe.componentName',
                                            )}

                                            <input
                                                required
                                                maxLength={
                                                    120
                                                }
                                                value={
                                                    component.name
                                                }
                                                placeholder={t(
                                                    'production.recipe.componentExample',
                                                )}
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
                                            className={
                                                buttonClass
                                            }
                                            onClick={() =>
                                                removeComponent(
                                                    component.localId,
                                                )
                                            }
                                        >
                                            <Trash2
                                                size={
                                                    13
                                                }
                                            />
                                        </button>
                                    </div>

                                    <p className="mt-4 text-xs font-semibold">
                                        {t(
                                            'production.recipe.materialOptions',
                                        )}
                                    </p>

                                    <div className="mt-2 space-y-2">
                                        {component.options.map(
                                            (
                                                option,
                                            ) => (
                                                <div
                                                    key={
                                                        option
                                                            .rawMaterial
                                                            .id
                                                    }
                                                    className="rounded-xl border border-[var(--ac-line)] p-3"
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                        <strong className="text-xs">
                                                            {
                                                                option
                                                                    .rawMaterial
                                                                    .name
                                                            }
                                                        </strong>

                                                        <div className="flex gap-2">
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
                                                                        option
                                                                            .rawMaterial
                                                                            .id,
                                                                    )
                                                                }
                                                            >
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

                                                                                            options:
                                                                                                entry.options.filter(
                                                                                                    (
                                                                                                        candidate,
                                                                                                    ) =>
                                                                                                        candidate
                                                                                                            .rawMaterial
                                                                                                            .id !==
                                                                                                        option
                                                                                                            .rawMaterial
                                                                                                            .id,
                                                                                                ),
                                                                                        }
                                                                                        : entry,
                                                                            ),
                                                                    )
                                                                }
                                                            >
                                                                {t(
                                                                    'production.recipe.remove',
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <label className="mt-3 block text-xs">
                                                        {t(
                                                            'production.recipe.quantityPerUnit',
                                                        )}{' '}
                                                        ({
                                                            option
                                                                .rawMaterial
                                                                .unit
                                                        }{' '}
                                                        /{' '}
                                                        {
                                                            product.unit
                                                        })

                                                        <input
                                                            required
                                                            type="number"
                                                            min="0.0001"
                                                            max="99999999999999"
                                                            step="0.0001"
                                                            dir="ltr"
                                                            value={
                                                                option.quantityPerUnit
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

                                                                                        options:
                                                                                            entry.options.map(
                                                                                                (
                                                                                                    candidate,
                                                                                                ) =>
                                                                                                    candidate
                                                                                                        .rawMaterial
                                                                                                        .id ===
                                                                                                    option
                                                                                                        .rawMaterial
                                                                                                        .id
                                                                                                        ? {
                                                                                                            ...candidate,

                                                                                                            quantityPerUnit:
                                                                                                                event.target.value,
                                                                                                        }
                                                                                                        : candidate,
                                                                                            ),
                                                                                    }
                                                                                    : entry,
                                                                        ),
                                                                )
                                                            }
                                                        />
                                                    </label>
                                                </div>
                                            ),
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        className={`${buttonClass} mt-3`}
                                        onClick={() => {
                                            setTargetComponentId(
                                                component.localId,
                                            );

                                            setMaterialSearch(
                                                '',
                                            );
                                        }}
                                    >
                                        <Plus
                                            size={
                                                13
                                            }
                                        />

                                        {t(
                                            'production.recipe.addAlternative',
                                        )}
                                    </button>

                                    {targetComponentId ===
                                        component.localId && (
                                        <div className="mt-3 rounded-xl border border-[var(--ac-line)] p-3">
                                            <label className="relative block text-xs">
                                                {t(
                                                    'production.recipe.searchMaterial',
                                                )}

                                                <Search
                                                    size={
                                                        13
                                                    }
                                                    className="absolute bottom-3 start-3"
                                                />

                                                <input
                                                    type="search"
                                                    value={
                                                        materialSearch
                                                    }
                                                    className={`${inputClass} ps-8`}
                                                    onChange={(
                                                        event,
                                                    ) =>
                                                        setMaterialSearch(
                                                            event.target.value,
                                                        )
                                                    }
                                                />
                                            </label>

                                            <div className="mt-2 max-h-52 overflow-y-auto">
                                                {searching ? (
                                                    <p className="p-3 text-xs">
                                                        {t(
                                                            'catalog.operations.loading',
                                                        )}
                                                    </p>
                                                ) : materialOptions.length ? (
                                                    materialOptions.map(
                                                        (
                                                            raw,
                                                        ) => (
                                                            <button
                                                                key={
                                                                    raw.id
                                                                }
                                                                type="button"
                                                                disabled={
                                                                    component.options.some(
                                                                        (
                                                                            existing,
                                                                        ) =>
                                                                            existing
                                                                                .rawMaterial
                                                                                .id ===
                                                                            raw.id,
                                                                    )
                                                                }
                                                                className="flex w-full items-center justify-between gap-3 border-b border-[var(--ac-line)] px-2 py-3 text-start text-xs disabled:opacity-35"
                                                                onClick={() =>
                                                                    addMaterialOption(
                                                                        component.localId,
                                                                        raw,
                                                                    )
                                                                }
                                                            >
                                                                <span>
                                                                    {
                                                                        raw.name
                                                                    }
                                                                </span>

                                                                <span>
                                                                    {
                                                                        raw.unit
                                                                    }
                                                                </span>
                                                            </button>
                                                        ),
                                                    )
                                                ) : (
                                                    <p className="p-3 text-xs">
                                                        {t(
                                                            'production.recipe.noMaterials',
                                                        )}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ),
                        )}
                    </div>

                    <label className="mt-4 block text-xs">
                        {t(
                            'production.recipe.notes',
                        )}

                        <textarea
                            maxLength={
                                2000
                            }
                            value={
                                recipeNotes
                            }
                            className={
                                inputClass
                            }
                            onChange={(
                                event,
                            ) =>
                                setRecipeNotes(
                                    event.target.value,
                                )
                            }
                        />
                    </label>

                    <div className="mt-4 flex justify-end gap-2">
                        <button
                            type="button"
                            className={
                                buttonClass
                            }
                            onClick={() =>
                                setEditingRecipe(
                                    false,
                                )
                            }
                        >
                            {t(
                                'common.cancel',
                            )}
                        </button>

                        <button
                            disabled={
                                savingRecipe
                                || ! editableComponents.length
                                || editableComponents.some(
                                    (
                                        component,
                                    ) =>
                                        ! component
                                            .name
                                            .trim()
                                        || ! component
                                            .options
                                            .length,
                                )
                            }
                            className="inline-flex items-center gap-2 rounded-xl bg-[var(--ac-text)] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                            <Save
                                size={
                                    14
                                }
                            />

                            {t(
                                savingRecipe
                                    ? 'production.recipe.saving'
                                    : 'production.recipe.save',
                            )}
                        </button>
                    </div>
                </form>
            )}

            {canProduce && (
                <form
                    onSubmit={(
                        event,
                    ) =>
                        void submitProduction(
                            event,
                        )
                    }
                    className="mt-5 rounded-2xl bg-[var(--ac-surface-soft)] p-4"
                >
                    <div className="flex items-center gap-2">
                        <FlaskConical
                            size={
                                16
                            }
                        />

                        <h4 className="text-sm font-semibold">
                            {t(
                                'production.batch.title',
                            )}
                        </h4>
                    </div>

                    <p className="mt-2 text-xs leading-5 text-[var(--ac-text-muted)]">
                        {t(
                            'production.batch.help',
                        )}
                    </p>

                    {! recipe ? (
                        <p className="mt-4 rounded-xl border border-dashed border-[var(--ac-line)] p-4 text-xs">
                            {t(
                                'production.batch.recipeRequired',
                            )}
                        </p>
                    ) : (
                        <fieldset
                            disabled={
                                saving
                                || loading
                            }
                            className="mt-4 space-y-4"
                        >
                            <label className="block text-xs">
                                {t(
                                    'production.batch.warehouse',
                                )}

                                <select
                                    required
                                    value={
                                        warehouseId
                                    }
                                    className={
                                        inputClass
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setWarehouseId(
                                            event.target.value,
                                        )
                                    }
                                >
                                    <option value="">
                                        {t(
                                            'production.batch.chooseWarehouse',
                                        )}
                                    </option>

                                    {warehouses.map(
                                        (
                                            warehouse,
                                        ) => (
                                            <option
                                                key={
                                                    warehouse.id
                                                }
                                                value={
                                                    warehouse.id
                                                }
                                            >
                                                {
                                                    warehouse.name
                                                }
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>

                            <label className="block text-xs">
                                {t(
                                    'production.batch.output',
                                )}{' '}
                                ({
                                    product.unit
                                })

                                <input
                                    required
                                    type="number"
                                    min="0.0001"
                                    max="99999999999999"
                                    step="0.0001"
                                    dir="ltr"
                                    value={
                                        quantity
                                    }
                                    className={
                                        inputClass
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setQuantity(
                                            event.target.value,
                                        )
                                    }
                                />
                            </label>

                            <div>
                                <div className="flex items-center gap-2">
                                    <Beaker
                                        size={
                                            14
                                        }
                                    />

                                    <strong className="text-xs">
                                        {t(
                                            'production.batch.requirements',
                                        )}
                                    </strong>
                                </div>

                                <div className="mt-2 space-y-2">
                                    {calculatedRequirements.map(
                                        ({
                                            component,
                                            option,
                                            required,
                                        }) => (
                                            <div
                                                key={
                                                    component.id
                                                }
                                                className="rounded-xl border border-[var(--ac-line)] bg-white p-3"
                                            >
                                                <p className="text-xs font-semibold">
                                                    {
                                                        component.name
                                                    }
                                                </p>

                                                {component.options.length >
                                                    1 && (
                                                    <label className="mt-2 block text-[10px]">
                                                        {t(
                                                            'production.batch.useAlternative',
                                                        )}

                                                        <select
                                                            value={
                                                                selections[
                                                                    component.id
                                                                ]
                                                                ?? ''
                                                            }
                                                            className={
                                                                inputClass
                                                            }
                                                            onChange={(
                                                                event,
                                                            ) =>
                                                                setSelections(
                                                                    (
                                                                        current,
                                                                    ) => ({
                                                                        ...current,

                                                                        [
                                                                            component.id
                                                                        ]:
                                                                            Number(
                                                                                event.target.value,
                                                                            ),
                                                                    }),
                                                                )
                                                            }
                                                        >
                                                            {component.options.map(
                                                                (
                                                                    candidate,
                                                                ) => (
                                                                    <option
                                                                        key={
                                                                            candidate.id
                                                                        }
                                                                        value={
                                                                            candidate.id
                                                                        }
                                                                    >
                                                                        {
                                                                            candidate
                                                                                .raw_material
                                                                                .name
                                                                        }
                                                                        {' — '}
                                                                        {
                                                                            candidate.quantity_per_unit
                                                                        }{' '}
                                                                        {
                                                                            candidate
                                                                                .raw_material
                                                                                .unit
                                                                        }
                                                                    </option>
                                                                ),
                                                            )}
                                                        </select>
                                                    </label>
                                                )}

                                                {option && (
                                                    <div className="mt-3 flex items-end justify-between gap-3 rounded-xl bg-[var(--ac-accent-soft)] p-3">
                                                        <div>
                                                            <p className="text-xs">
                                                                {
                                                                    option
                                                                        .raw_material
                                                                        .name
                                                                }
                                                            </p>

                                                            <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                                <bdi dir="ltr">
                                                                    {
                                                                        option.quantity_per_unit
                                                                    }
                                                                </bdi>{' '}
                                                                {
                                                                    option
                                                                        .raw_material
                                                                        .unit
                                                                }{' '}
                                                                {t(
                                                                    'production.batch.perUnit',
                                                                )}
                                                            </p>
                                                        </div>

                                                        <div className="text-end">
                                                            <p className="text-[9px] text-[var(--ac-text-muted)]">
                                                                {t(
                                                                    'production.batch.required',
                                                                )}
                                                            </p>

                                                            <strong className="mt-1 block text-lg">
                                                                <bdi dir="ltr">
                                                                    {
                                                                        required
                                                                    }
                                                                </bdi>{' '}
                                                                <small>
                                                                    {
                                                                        option
                                                                            .raw_material
                                                                            .unit
                                                                    }
                                                                </small>
                                                            </strong>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ),
                                    )}
                                </div>
                            </div>

                            <label className="block text-xs">
                                {t(
                                    'catalog.operations.notes',
                                )}

                                <textarea
                                    maxLength={
                                        1000
                                    }
                                    value={
                                        note
                                    }
                                    className={
                                        inputClass
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setNote(
                                            event.target.value,
                                        )
                                    }
                                />
                            </label>

                            <button
                                disabled={
                                    ! warehouseId
                                    || saving
                                }
                                className="w-full rounded-xl bg-[var(--ac-accent-strong)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
                            >
                                {t(
                                    saving
                                        ? 'production.batch.saving'
                                        : 'production.batch.confirm',
                                )}
                            </button>
                        </fieldset>
                    )}

                    {saved && (
                        <p
                            role="status"
                            className="mt-3 text-xs"
                        >
                            {t(
                                'production.batch.saved',
                            )}
                        </p>
                    )}
                </form>
            )}

            {error && (
                <div
                    role="alert"
                    className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-800"
                >
                    {
                        error
                    }

                    <button
                        type="button"
                        className={`${buttonClass} ms-2`}
                        onClick={() =>
                            setRevision(
                                (
                                    value,
                                ) =>
                                    value
                                    + 1,
                            )
                        }
                    >
                        {t(
                            'catalog.operations.retry',
                        )}
                    </button>
                </div>
            )}

            <div className="mt-6 flex items-center gap-2">
                <History
                    size={
                        15
                    }
                />

                <h4 className="text-sm font-semibold">
                    {t(
                        'production.history.title',
                    )}
                </h4>
            </div>

            {loading ? (
                <p className="mt-3 text-xs">
                    {t(
                        'catalog.operations.loading',
                    )}
                </p>
            ) : history?.data.length ? (
                <ul className="mt-3 space-y-3">
                    {history.data.map(
                        (
                            batch,
                        ) => (
                            <li
                                key={
                                    batch.id
                                }
                                className="rounded-xl border border-[var(--ac-line)] p-3 text-sm"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <strong>
                                        #
                                        {
                                            batch.id
                                        }
                                        {' · '}
                                        <bdi dir="ltr">
                                            {
                                                batch.quantity
                                            }
                                        </bdi>{' '}
                                        {
                                            product.unit
                                        }
                                    </strong>

                                    {batch.recipe_version !==
                                        null && (
                                        <span className="rounded-full bg-[var(--ac-accent-soft)] px-2 py-1 text-[9px] font-semibold">
                                            {t(
                                                'production.history.recipeVersion',
                                                {
                                                    version:
                                                        batch.recipe_version,
                                                },
                                            )}
                                        </span>
                                    )}
                                </div>

                                <p className="mt-1 text-xs">
                                    {
                                        batch.warehouse
                                    }
                                    {' · '}

                                    <time
                                        dateTime={
                                            batch.created_at
                                        }
                                    >
                                        {new Date(
                                            batch.created_at,
                                        ).toLocaleString()}
                                    </time>
                                </p>

                                <ul className="mt-2 space-y-1 text-xs">
                                    {batch.materials.map(
                                        (
                                            material,
                                        ) => (
                                            <li
                                                key={
                                                    material.id
                                                }
                                            >
                                                {
                                                    material.name
                                                }
                                                :{' '}

                                                <bdi dir="ltr">
                                                    {
                                                        material.quantity
                                                    }
                                                </bdi>{' '}

                                                {
                                                    material.unit
                                                }
                                            </li>
                                        ),
                                    )}
                                </ul>

                                {batch.note && (
                                    <p className="mt-2 whitespace-pre-wrap break-words text-xs">
                                        {
                                            batch.note
                                        }
                                    </p>
                                )}
                            </li>
                        ),
                    )}
                </ul>
            ) : (
                <p className="mt-3 text-xs">
                    {t(
                        'production.history.empty',
                    )}
                </p>
            )}

            {history &&
                history.meta.last_page >
                    1 && (
                <div className="mt-3 flex items-center justify-between">
                    <button
                        type="button"
                        className={
                            buttonClass
                        }
                        disabled={
                            loading
                            || page <=
                                1
                        }
                        onClick={() =>
                            setPage(
                                (
                                    value,
                                ) =>
                                    value
                                    - 1,
                            )
                        }
                    >
                        {t(
                            'catalog.operations.previous',
                        )}
                    </button>

                    <span className="text-xs">
                        {
                            page
                        }{' '}
                        /{' '}
                        {
                            history.meta.last_page
                        }
                    </span>

                    <button
                        type="button"
                        className={
                            buttonClass
                        }
                        disabled={
                            loading
                            || page >=
                                history
                                    .meta
                                    .last_page
                        }
                        onClick={() =>
                            setPage(
                                (
                                    value,
                                ) =>
                                    value
                                    + 1,
                            )
                        }
                    >
                        {t(
                            'catalog.operations.next',
                        )}
                    </button>
                </div>
            )}

            {versions.length >
                1 && (
                <p className="mt-4 text-[10px] text-[var(--ac-text-muted)]">
                    {t(
                        'production.recipe.history',
                    )}{' '}
                    ({versions.length})
                </p>
            )}
        </section>
    );
}

/**
 * Calculate one frontend production requirement with the same four-decimal
 * half-up policy as ProductionConsumption on the server.
 */
function consumptionTotal(
    output: string,
    rate: string,
): string {
    const left =
        scaledQuantity(
            output,
        );

    const right =
        scaledQuantity(
            rate,
        );

    if (
        left === null
        || right === null
        || left <= 0n
        || right <= 0n
    ) {
        return '—';
    }

    const product =
        left
        * right;

    const quotient =
        product
        / 10000n;

    const remainder =
        product
        % 10000n;

    const rounded =
        quotient
        + (
            remainder >=
                5000n
                ? 1n
                : 0n
        );

    return `${rounded / 10000n}.${String(
        rounded % 10000n,
    ).padStart(
        4,
        '0',
    )}`;
}

/**
 * Convert a positive decimal quantity into four-decimal fixed-point units.
 */
function scaledQuantity(
    value: string,
): bigint | null {
    if (
        ! /^\d{1,14}(?:\.\d{1,4})?$/.test(
            value,
        )
    ) {
        return null;
    }

    const [
        whole,
        fraction = '',
    ] =
        value.split(
            '.',
        );

    return BigInt(
        whole,
    )
        * 10000n
        + BigInt(
            fraction.padEnd(
                4,
                '0',
            ),
        );
}
