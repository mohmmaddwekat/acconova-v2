import {
    Head,
    Link,
    usePage,
} from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowLeftRight,
    Beaker,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Factory,
    FlaskConical,
    PackagePlus,
    Plus,
    RefreshCcw,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';

import {
    fetchWarehouses,
} from '@/features/inventory/api';
import type {
    Warehouse,
} from '@/features/inventory/types';
import {
    createProductionRun,
    fetchProductionRecipe,
    fetchProductionRun,
    fetchProductionRuns,
    postProductionRun,
    previewProductionRun,
    reverseProductionOutput,
    reverseProductionRun,
    updateProductionRun,
} from '@/features/production/api';
import type {
    ProductionPreview,
    ProductionRecipe,
    ProductionRun,
    ProductionRunPayload,
    ProductionRunStatus,
    RecipeSnapshotComponent,
} from '@/features/production/types';
import {
    fetchProducts,
} from '@/features/products/api';
import type {
    Product,
} from '@/features/products/types';
import {
    ApiError, apiRequest,
} from '@/lib/http';
import {
    useLocale,
} from '@/lib/i18n';
import {
    AppShell,
} from '@/layouts/AppShell';
import type {
    AppPageProps,
} from '@/types/app';

type Copy = {
    title: string;
    subtitle: string;
    inventory: string;
    newRun: string;
    search: string;
    allStatuses: string;
    draft: string;
    posted: string;
    partial: string;
    reversed: string;
    run: string;
    date: string;
    products: string;
    status: string;
    noRuns: string;
    noRunsHelp: string;
    loading: string;
    close: string;
    note: string;
    addProduct: string;
    product: string;
    producedQuantity: string;
    outputWarehouse: string;
    recipe: string;
    noRecipe: string;
    useActiveRecipe: string;
    recipeSuggestion: string;
    actualMaterials: string;
    addMaterial: string;
    rawMaterial: string;
    sourceWarehouse: string;
    suggested: string;
    actual: string;
    difference: string;
    remove: string;
    savePreview: string;
    saving: string;
    preview: string;
    sufficient: string;
    shortage: string;
    available: string;
    required: string;
    post: string;
    posting: string;
    dirtyWarning: string;
    loadFailed: string;
    saveFailed: string;
    postFailed: string;
    reverseReason: string;
    reverseOutput: string;
    reverseRemaining: string;
    reversing: string;
    reversalFailed: string;
    editDraft: string;
    recipeVersion: string;
    manualMaterial: string;
    copySuggestions: string;
    recipeOptional: string;
    actualTruth: string;
    previous: string;
    next: string;
};

/**
 * Return Production UI copy for the active application language.
 */
function getCopy(
    locale: 'ar' | 'en',
): Copy {
    if (locale === 'ar') {
        return {
            title:
                'الإنتاج',

            subtitle:
                'سجّل ما تم إنتاجه فعليًا وما تم استهلاكه فعليًا من المواد الخام.',

            inventory:
                'المخزون',

            newRun:
                'عملية إنتاج جديدة',

            search:
                'ابحث برقم العملية أو الملاحظة…',

            allStatuses:
                'كل الحالات',

            draft:
                'مسودة',

            posted:
                'مرحّلة',

            partial:
                'معكوسة جزئيًا',

            reversed:
                'معكوسة',

            run:
                'العملية',

            date:
                'التاريخ',

            products:
                'المنتجات',

            status:
                'الحالة',

            noRuns:
                'لا توجد عمليات إنتاج بعد.',

            noRunsHelp:
                'ابدأ أول عملية وسجّل المنتجات النهائية والمواد الخام المستهلكة فعليًا.',

            loading:
                'جارٍ التحميل…',

            close:
                'إغلاق',

            note:
                'ملاحظة',

            addProduct:
                'إضافة منتج',

            product:
                'المنتج النهائي',

            producedQuantity:
                'الكمية المنتجة',

            outputWarehouse:
                'مستودع المنتج النهائي',

            recipe:
                'الوصفة',

            noRecipe:
                'بدون وصفة',

            useActiveRecipe:
                'استخدام الوصفة النشطة',

            recipeSuggestion:
                'اقتراح الوصفة',

            actualMaterials:
                'المواد المستخدمة فعليًا',

            addMaterial:
                'إضافة مادة خام',

            rawMaterial:
                'المادة الخام',

            sourceWarehouse:
                'مستودع السحب',

            suggested:
                'المقترح',

            actual:
                'الفعلي',

            difference:
                'الفرق',

            remove:
                'إزالة',

            savePreview:
                'حفظ المسودة ومعاينة المخزون',

            saving:
                'جارٍ الحفظ…',

            preview:
                'معاينة قبل الترحيل',

            sufficient:
                'المخزون كافٍ',

            shortage:
                'نقص',

            available:
                'المتاح',

            required:
                'المطلوب فعليًا',

            post:
                'ترحيل الإنتاج للمخزون',

            posting:
                'جارٍ الترحيل…',

            dirtyWarning:
                'عدّلت المسودة بعد آخر معاينة. احفظها مرة أخرى قبل الترحيل.',

            loadFailed:
                'تعذر تحميل بيانات الإنتاج.',

            saveFailed:
                'تعذر حفظ عملية الإنتاج.',

            postFailed:
                'تعذر ترحيل عملية الإنتاج.',

            reverseReason:
                'سبب العكس',

            reverseOutput:
                'عكس هذا المنتج',

            reverseRemaining:
                'عكس المتبقي من العملية',

            reversing:
                'جارٍ العكس…',

            reversalFailed:
                'تعذر عكس عملية الإنتاج.',

            editDraft:
                'تعديل المسودة',

            recipeVersion:
                'إصدار الوصفة',

            manualMaterial:
                'مادة مدخلة يدويًا',

            copySuggestions:
                'نسخ المقترح إلى الفعلي',

            recipeOptional:
                'الوصفة اختيارية. يمكنك تسجيل الاستهلاك الفعلي بدون وصفة.',

            actualTruth:
                'الكميات الفعلية هي التي ستؤثر على المخزون، وليس اقتراح الوصفة.',

            previous:
                'السابق',

            next:
                'التالي',
        };
    }

    return {
        title:
            'Production',

        subtitle:
            'Record what was actually produced and what Raw Materials were actually consumed.',

        inventory:
            'Inventory',

        newRun:
            'New Production Run',

        search:
            'Search run number or note…',

        allStatuses:
            'All statuses',

        draft:
            'Draft',

        posted:
            'Posted',

        partial:
            'Partially reversed',

        reversed:
            'Reversed',

        run:
            'Run',

        date:
            'Date',

        products:
            'Products',

        status:
            'Status',

        noRuns:
            'No Production Runs yet.',

        noRunsHelp:
            'Create the first run and record finished Products plus actual material consumption.',

        loading:
            'Loading…',

        close:
            'Close',

        note:
            'Note',

        addProduct:
            'Add Product',

        product:
            'Finished Product',

        producedQuantity:
            'Produced quantity',

        outputWarehouse:
            'Output warehouse',

        recipe:
            'Recipe',

        noRecipe:
            'No Recipe',

        useActiveRecipe:
            'Use active Recipe',

        recipeSuggestion:
            'Recipe suggestion',

        actualMaterials:
            'Actual Materials Used',

        addMaterial:
            'Add Raw Material',

        rawMaterial:
            'Raw Material',

        sourceWarehouse:
            'Source warehouse',

        suggested:
            'Suggested',

        actual:
            'Actual',

        difference:
            'Difference',

        remove:
            'Remove',

        savePreview:
            'Save Draft & Preview',

        saving:
            'Saving…',

        preview:
            'Preview before Posting',

        sufficient:
            'Stock is sufficient',

        shortage:
            'Shortage',

        available:
            'Available',

        required:
            'Actual required',

        post:
            'Post Production',

        posting:
            'Posting…',

        dirtyWarning:
            'The Draft changed after the last preview. Save it again before Posting.',

        loadFailed:
            'Production could not be loaded.',

        saveFailed:
            'Production Run could not be saved.',

        postFailed:
            'Production Run could not be Posted.',

        reverseReason:
            'Reversal reason',

        reverseOutput:
            'Reverse this Product',

        reverseRemaining:
            'Reverse remaining run',

        reversing:
            'Reversing…',

        reversalFailed:
            'Production reversal failed.',

        editDraft:
            'Edit Draft',

        recipeVersion:
            'Recipe version',

        manualMaterial:
            'Manually entered material',

        copySuggestions:
            'Copy suggestions to Actual',

        recipeOptional:
            'Recipe is optional. Actual consumption can be recorded without one.',

        actualTruth:
            'Actual quantities move Inventory. Recipe suggestions do not.',

        previous:
            'Previous',

        next:
            'Next',
    };
}

type SuggestionLine = {
    rawMaterialId: number;

    name: string;

    unit: string;

    quantityPerUnit: string;
};

type EditorMaterial = {
    key: string;

    rawMaterialId: string;

    warehouseId: string;

    actualQuantity: string;

    note: string;
};

type EditorOutput = {
    key: string;

    productId: string;

    quantity: string;

    warehouseId: string;

    recipeId:
        | number
        | null;

    recipeVersion:
        | number
        | null;

    selections:
        Record<
            string,
            number
        >;

    suggestions: SuggestionLine[];

    materials: EditorMaterial[];
};

/**
 * Generate one stable client-only form key.
 */
function makeKey(): string {
    return `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
}

/**
 * Return today's date in local YYYY-MM-DD form.
 */
function todayInputValue(): string {
    const now =
        new Date();

    const year =
        now.getFullYear();

    const month =
        String(
            now.getMonth() + 1,
        ).padStart(
            2,
            '0',
        );

    const day =
        String(
            now.getDate(),
        ).padStart(
            2,
            '0',
        );

    return `${year}-${month}-${day}`;
}

/**
 * Normalize a UI quantity to four decimal places.
 */
function quantity4(
    value: number,
): string {
    if (
        ! Number.isFinite(
            value,
        )
    ) {
        return '0.0000';
    }

    return Math.max(
        0,
        value,
    ).toFixed(
        4,
    );
}

/**
 * Build aggregate default Recipe suggestions by Raw Material.
 */
function recipeSuggestions(
    recipe: ProductionRecipe,
): {
    lines: SuggestionLine[];

    selections:
        Record<
            string,
            number
        >;
} {
    const grouped =
        new Map<
            number,
            SuggestionLine
        >();

    const selections:
        Record<
            string,
            number
        > = {};

    recipe.components.forEach(
        (
            component,
        ) => {
            const option =
                component.options.find(
                    (
                        item,
                    ) =>
                        item.is_default,
                )
                ?? component.options[0];

            if (! option) {
                return;
            }

            selections[
                String(
                    component.id,
                )
            ] =
                option.id;

            const existing =
                grouped.get(
                    option
                        .raw_material
                        .id,
                );

            const perUnit =
                Number(
                    option
                        .quantity_per_unit,
                );

            if (existing) {
                existing.quantityPerUnit =
                    quantity4(
                        Number(
                            existing
                                .quantityPerUnit,
                        )
                        + perUnit,
                    );

                return;
            }

            grouped.set(
                option
                    .raw_material
                    .id,
                {
                    rawMaterialId:
                        option
                            .raw_material
                            .id,

                    name:
                        option
                            .raw_material
                            .name,

                    unit:
                        option
                            .raw_material
                            .unit,

                    quantityPerUnit:
                        quantity4(
                            perUnit,
                        ),
                },
            );
        },
    );

    return {
        lines:
            Array.from(
                grouped.values(),
            ),

        selections,
    };
}

/**
 * Convert historical Recipe snapshot components back to suggestion lines.
 */
function snapshotSuggestions(
    components:
        RecipeSnapshotComponent[],
): SuggestionLine[] {
    const grouped =
        new Map<
            number,
            SuggestionLine
        >();

    components.forEach(
        (
            component,
        ) => {
            const existing =
                grouped.get(
                    component
                        .raw_material_id,
                );

            if (existing) {
                existing.quantityPerUnit =
                    quantity4(
                        Number(
                            existing
                                .quantityPerUnit,
                        )
                        +
                        Number(
                            component
                                .quantity_per_unit,
                        ),
                    );

                return;
            }

            grouped.set(
                component
                    .raw_material_id,
                {
                    rawMaterialId:
                        component
                            .raw_material_id,

                    name:
                        component
                            .raw_material_name,

                    unit:
                        component.unit,

                    quantityPerUnit:
                        component
                            .quantity_per_unit,
                },
            );
        },
    );

    return Array.from(
        grouped.values(),
    );
}

/**
 * Return one empty Product output editor.
 */
function blankOutput(
    warehouseId = '',
): EditorOutput {
    return {
        key:
            makeKey(),

        productId:
            '',

        quantity:
            '1',

        warehouseId,

        recipeId:
            null,

        recipeVersion:
            null,

        selections:
            {},

        suggestions:
            [],

        materials:
            [],
    };
}

/**
 * Resolve the suggested quantity for one material inside one output.
 */
function suggestedQuantity(
    output: EditorOutput,
    rawMaterialId: number,
): string {
    const line =
        output.suggestions.find(
            (
                item,
            ) =>
                item.rawMaterialId ===
                rawMaterialId,
        );

    if (! line) {
        return '0.0000';
    }

    return quantity4(
        Number(
            output.quantity,
        )
        *
        Number(
            line.quantityPerUnit,
        ),
    );
}

/**
 * Render the central Production operating surface.
 */
export default function ProductionIndex() {
    const locale =
        useLocale();

    const copy =
        getCopy(
            locale,
        );

    const {
        workspace,
    } =
        usePage<AppPageProps>().props;

    const permissions =
        workspace
            .activeOrganization
            ?.permissions;

    const role =
        workspace
            .activeOrganization
            ?.role;

    const canManage =
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
              );

    const [
        runs,
        setRuns,
    ] =
        useState<
            ProductionRun[]
        >([]);

    const [
        products,
        setProducts,
    ] =
        useState<Product[]>(
            [],
        );

    const [
        rawMaterials,
        setRawMaterials,
    ] =
        useState<Product[]>(
            [],
        );

    const [
        warehouses,
        setWarehouses,
    ] =
        useState<Warehouse[]>(
            [],
        );

    const [
        search,
        setSearch,
    ] =
        useState(
            '',
        );

    const [
        status,
        setStatus,
    ] =
        useState<
            | ProductionRunStatus
            | ''
        >(
            '',
        );

    const [
        page,
        setPage,
    ] =
        useState(
            1,
        );

    const [
        lastPage,
        setLastPage,
    ] =
        useState(
            1,
        );

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
        useState<
            string | null
        >(
            null,
        );

    const [
        editorOpen,
        setEditorOpen,
    ] =
        useState(
            false,
        );

    const [
        editingRun,
        setEditingRun,
    ] =
        useState<
            ProductionRun | null
        >(
            null,
        );

    const [
        detailRun,
        setDetailRun,
    ] =
        useState<
            ProductionRun | null
        >(
            null,
        );

    /**
     * Reload list data for the current filters.
     */
    const loadRuns =
        useCallback(
            async (): Promise<void> => {
                setLoading(
                    true,
                );

                setError(
                    null,
                );

                try {
                    const response =
                        await fetchProductionRuns({
                            search,
                            status,
                            page,
                        });

                    setRuns(
                        response.data,
                    );

                    setLastPage(
                        response.meta
                            .last_page,
                    );
                } catch (
                    exception
                ) {
                    setError(
                        exception instanceof
                        ApiError
                            ? exception.message
                            : copy.loadFailed,
                    );
                } finally {
                    setLoading(
                        false,
                    );
                }
            },
            [
                copy.loadFailed,
                page,
                search,
                status,
            ],
        );

    /**
     * Load selectable Products, Raw Materials, and warehouses once per
     * workspace.
     */
    const loadOptions =
        useCallback(
            async (): Promise<void> => {
                try {
                    const [
                        productResponse,
                        rawResponse,
                        warehouseResponse,
                    ] =
                        await Promise.all([
                            fetchProducts({
                                type:
                                    'product',

                                status:
                                    'active',

                                perPage:
                                    100,
                            }),

                            fetchProducts({
                                type:
                                    'raw_material',

                                status:
                                    'active',

                                perPage:
                                    100,
                            }),

                            fetchWarehouses(
                                'active',
                            ),
                        ]);

                    setProducts(
                        productResponse
                            .data
                            .filter(
                                (
                                    item,
                                ) =>
                                    item.track_inventory,
                            ),
                    );

                    setRawMaterials(
                        rawResponse
                            .data
                            .filter(
                                (
                                    item,
                                ) =>
                                    item.track_inventory,
                            ),
                    );

                    setWarehouses(
                        warehouseResponse,
                    );
                } catch {
                    setError(
                        copy.loadFailed,
                    );
                }
            },
            [
                copy.loadFailed,
            ],
        );

    useEffect(
        () => {
            void loadOptions();
        },
        [
            loadOptions,
        ],
    );

    useEffect(
        () => {
            const timer =
                window.setTimeout(
                    () => {
                        void loadRuns();
                    },
                    250,
                );

            return () =>
                window.clearTimeout(
                    timer,
                );
        },
        [
            loadRuns,
        ],
    );

    /**
     * Open a new Production Draft editor.
     */
    function openNewRun(): void {
        setEditingRun(
            null,
        );

        setEditorOpen(
            true,
        );
    }

    /**
     * Open an existing Draft in the same Production editor.
     */
    function openEditRun(
        run: ProductionRun,
    ): void {
        setDetailRun(
            null,
        );

        setEditingRun(
            run,
        );

        setEditorOpen(
            true,
        );
    }

    /**
     * Refresh history after a Production lifecycle mutation.
     */
    function handleChanged(): void {
        void loadRuns();
    }

    return (
        <AppShell>
            <Head
                title={
                    copy.title
                }
            />

            <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
                <div className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--ac-text-muted)]">
                            <Link
                                href="/app/inventory"
                                className="transition hover:text-[var(--ac-text)]"
                            >
                                {
                                    copy.inventory
                                }
                            </Link>

                            <span>
                                /
                            </span>

                            <span className="text-[var(--ac-accent-strong)]">
                                {
                                    copy.title
                                }
                            </span>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex size-11 items-center justify-center rounded-2xl bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                <Factory
                                    size={
                                        20
                                    }
                                />
                            </div>

                            <div>
                                <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                                    {
                                        copy.title
                                    }
                                </h1>

                                <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--ac-text-muted)]">
                                    {
                                        copy.subtitle
                                    }
                                </p>
                            </div>
                        </div>
                    </div>

                    {canManage && (
                        <button
                            type="button"
                            onClick={
                                openNewRun
                            }
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--ac-text)] px-4 text-sm font-semibold text-white shadow-[var(--ac-shadow-soft)] transition hover:-translate-y-0.5"
                        >
                            <Plus
                                size={
                                    17
                                }
                            />

                            {
                                copy.newRun
                            }
                        </button>
                    )}
                </div>

                <div className="mb-5 grid gap-3 rounded-[24px] border border-[var(--ac-line)] bg-white p-3 shadow-[var(--ac-shadow-soft)] md:grid-cols-[1fr_220px]">
                    <label className="relative">
                        <Search
                            size={
                                16
                            }
                            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
                        />

                        <input
                            value={
                                search
                            }
                            onChange={(
                                event,
                            ) => {
                                setSearch(
                                    event
                                        .target
                                        .value,
                                );

                                setPage(
                                    1,
                                );
                            }}
                            placeholder={
                                copy.search
                            }
                            className="h-11 w-full rounded-xl border border-[var(--ac-line)] bg-[var(--ac-bg-soft)] ps-10 pe-3 text-sm outline-none transition focus:border-[var(--ac-accent)]"
                        />
                    </label>

                    <select
                        value={
                            status
                        }
                        onChange={(
                            event,
                        ) => {
                            setStatus(
                                event
                                    .target
                                    .value as
                                    | ProductionRunStatus
                                    | '',
                            );

                            setPage(
                                1,
                            );
                        }}
                        className="h-11 rounded-xl border border-[var(--ac-line)] bg-[var(--ac-bg-soft)] px-3 text-sm outline-none"
                    >
                        <option value="">
                            {
                                copy.allStatuses
                            }
                        </option>

                        <option value="draft">
                            {
                                copy.draft
                            }
                        </option>

                        <option value="posted">
                            {
                                copy.posted
                            }
                        </option>

                        <option value="partially_reversed">
                            {
                                copy.partial
                            }
                        </option>

                        <option value="reversed">
                            {
                                copy.reversed
                            }
                        </option>
                    </select>
                </div>

                {error && (
                    <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {
                            error
                        }
                    </div>
                )}

                <section className="overflow-hidden rounded-[26px] border border-[var(--ac-line)] bg-white shadow-[var(--ac-shadow-soft)]">
                    {loading ? (
                        <div className="flex min-h-64 items-center justify-center text-sm text-[var(--ac-text-muted)]">
                            {
                                copy.loading
                            }
                        </div>
                    ) : runs.length ===
                      0 ? (
                        <div className="flex min-h-72 flex-col items-center justify-center px-5 text-center">
                            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-[var(--ac-bg-soft)]">
                                <Factory
                                    size={
                                        23
                                    }
                                />
                            </div>

                            <h2 className="font-semibold">
                                {
                                    copy.noRuns
                                }
                            </h2>

                            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--ac-text-muted)]">
                                {
                                    copy.noRunsHelp
                                }
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="hidden grid-cols-[170px_140px_1fr_160px] gap-4 border-b border-[var(--ac-line)] bg-[var(--ac-bg-soft)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)] md:grid">
                                <span>
                                    {
                                        copy.run
                                    }
                                </span>

                                <span>
                                    {
                                        copy.date
                                    }
                                </span>

                                <span>
                                    {
                                        copy.products
                                    }
                                </span>

                                <span>
                                    {
                                        copy.status
                                    }
                                </span>
                            </div>

                            {runs.map(
                                (
                                    run,
                                ) => (
                                    <button
                                        type="button"
                                        key={
                                            run.id
                                        }
                                        onClick={() =>
                                            setDetailRun(
                                                run,
                                            )
                                        }
                                        className="grid w-full gap-3 border-b border-[var(--ac-line)] px-5 py-4 text-start transition last:border-b-0 hover:bg-[var(--ac-bg-soft)] md:grid-cols-[170px_140px_1fr_160px] md:items-center md:gap-4"
                                    >
                                        <div>
                                            <p className="text-sm font-semibold">
                                                {
                                                    run.run_number
                                                }
                                            </p>

                                            <p className="mt-1 line-clamp-1 text-xs text-[var(--ac-text-muted)] md:hidden">
                                                {
                                                    run.note
                                                    ?? '—'
                                                }
                                            </p>
                                        </div>

                                        <span className="text-sm text-[var(--ac-text-soft)]">
                                            {
                                                run.occurred_on
                                            }
                                        </span>

                                        <div className="flex flex-wrap gap-1.5">
                                            {run.outputs
                                                .slice(
                                                    0,
                                                    4,
                                                )
                                                .map(
                                                    (
                                                        output,
                                                    ) => (
                                                        <span
                                                            key={
                                                                output.id
                                                            }
                                                            className="rounded-full bg-[var(--ac-bg-soft)] px-2.5 py-1 text-xs"
                                                        >
                                                            {
                                                                output
                                                                    .product
                                                                    .name
                                                            }

                                                            {' × '}

                                                            {
                                                                output.quantity
                                                            }
                                                        </span>
                                                    ),
                                                )}

                                            {run
                                                .outputs
                                                .length >
                                                4 && (
                                                <span className="rounded-full bg-[var(--ac-bg-soft)] px-2.5 py-1 text-xs">
                                                    +
                                                    {run
                                                        .outputs
                                                        .length -
                                                        4}
                                                </span>
                                            )}
                                        </div>

                                        <StatusBadge
                                            status={
                                                run.status
                                            }
                                            copy={
                                                copy
                                            }
                                        />
                                    </button>
                                ),
                            )}
                        </>
                    )}
                </section>

                {lastPage >
                    1 && (
                    <div className="mt-4 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            disabled={
                                page <=
                                1
                            }
                            onClick={() =>
                                setPage(
                                    (
                                        current,
                                    ) =>
                                        Math.max(
                                            1,
                                            current -
                                                1,
                                        ),
                                )
                            }
                            className="inline-flex h-10 items-center gap-1 rounded-xl border border-[var(--ac-line)] bg-white px-3 text-xs font-semibold disabled:opacity-40"
                        >
                            <ChevronLeft
                                size={
                                    15
                                }
                            />

                            {
                                copy.previous
                            }
                        </button>

                        <span className="px-2 text-xs text-[var(--ac-text-muted)]">
                            {page} /{' '}
                            {
                                lastPage
                            }
                        </span>

                        <button
                            type="button"
                            disabled={
                                page >=
                                lastPage
                            }
                            onClick={() =>
                                setPage(
                                    (
                                        current,
                                    ) =>
                                        Math.min(
                                            lastPage,
                                            current +
                                                1,
                                        ),
                                )
                            }
                            className="inline-flex h-10 items-center gap-1 rounded-xl border border-[var(--ac-line)] bg-white px-3 text-xs font-semibold disabled:opacity-40"
                        >
                            {
                                copy.next
                            }

                            <ChevronRight
                                size={
                                    15
                                }
                            />
                        </button>
                    </div>
                )}
            </main>

            <ProductionEditor
                open={
                    editorOpen
                }
                run={
                    editingRun
                }
                products={
                    products
                }
                rawMaterials={
                    rawMaterials
                }
                warehouses={
                    warehouses
                }
                copy={
                    copy
                }
                onClose={() => {
                    setEditorOpen(
                        false,
                    );

                    setEditingRun(
                        null,
                    );
                }}
                onChanged={
                    handleChanged
                }
            />

            <ProductionDetail
                run={
                    detailRun
                }
                copy={
                    copy
                }
                canManage={
                    canManage
                }
                onClose={() =>
                    setDetailRun(
                        null,
                    )
                }
                onEdit={
                    openEditRun
                }
                onChanged={
                    handleChanged
                }
            />
        </AppShell>
    );
}

/**
 * Render one lifecycle status pill.
 */
function StatusBadge({
    status,
    copy,
}: {
    status: ProductionRunStatus;

    copy: Copy;
}) {
    const label =
        status ===
        'draft'
            ? copy.draft
            : status ===
                'posted'
              ? copy.posted
              : status ===
                  'partially_reversed'
                ? copy.partial
                : copy.reversed;

    const style =
        status ===
        'posted'
            ? 'bg-emerald-50 text-emerald-700'
            : status ===
                'draft'
              ? 'bg-amber-50 text-amber-700'
              : status ===
                  'partially_reversed'
                ? 'bg-orange-50 text-orange-700'
                : 'bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]';

    return (
        <span
            className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}
        >
            {label}
        </span>
    );
}

/**
 * Render the Production Draft editor and Preview/Post workflow.
 */
function ProductionEditor({
    open,
    run,
    products,
    rawMaterials,
    warehouses,
    copy,
    onClose,
    onChanged,
}: {
    open: boolean;

    run:
        | ProductionRun
        | null;

    products: Product[];

    rawMaterials: Product[];

    warehouses: Warehouse[];

    copy: Copy;

    onClose: () => void;

    onChanged: () => void;
}) {
    const defaultWarehouseId =
        useMemo(
            () =>
                String(
                    warehouses.find(
                        (
                            warehouse,
                        ) =>
                            warehouse.is_default,
                    )?.id
                    ??
                    warehouses[0]
                        ?.id
                    ??
                    '',
                ),
            [
                warehouses,
            ],
        );

    const [
        occurredOn,
        setOccurredOn,
    ] =
        useState(
            todayInputValue(),
        );

    const [
        note,
        setNote,
    ] =
        useState(
            '',
        );

    const [
        outputs,
        setOutputs,
    ] =
        useState<
            EditorOutput[]
        >([]);

    const [
        savedRun,
        setSavedRun,
    ] =
        useState<
            ProductionRun | null
        >(
            null,
        );

    const [
        preview,
        setPreview,
    ] =
        useState<
            ProductionPreview | null
        >(
            null,
        );

    const [
        dirty,
        setDirty,
    ] =
        useState(
            true,
        );

    const [
        busy,
        setBusy,
    ] =
        useState(
            false,
        );

    const [
        recipeBusy,
        setRecipeBusy,
    ] =
        useState<
            string | null
        >(
            null,
        );

    const [
        error,
        setError,
    ] =
        useState<
            string | null
        >(
            null,
        );

    /**
     * Build editor state from an existing Draft or a fresh Production Run.
     */
    useEffect(
        () => {
            if (! open) {
                return;
            }

            setError(
                null,
            );

            setPreview(
                null,
            );

            if (run) {
                setOccurredOn(
                    run.occurred_on,
                );

                setNote(
                    run.note
                    ?? '',
                );

                setSavedRun(
                    run,
                );

                setDirty(
                    false,
                );

                setOutputs(
                    run.outputs.map(
                        (
                            output,
                        ) => ({
                            key:
                                `output-${output.id}`,

                            productId:
                                String(
                                    output
                                        .product
                                        .id,
                                ),

                            quantity:
                                output.quantity,

                            warehouseId:
                                String(
                                    output
                                        .warehouse
                                        .id,
                                ),

                            recipeId:
                                output.recipe
                                    ?.id
                                ?? null,

                            recipeVersion:
                                output.recipe
                                    ?.version
                                ?? null,

                            selections:
                                output.selections
                                ?? {},

                            suggestions:
                                snapshotSuggestions(
                                    output
                                        .recipe_snapshot
                                        ?.components
                                    ?? [],
                                ),

                            materials:
                                output.materials.map(
                                    (
                                        material,
                                    ) => ({
                                        key:
                                            `material-${material.id}`,

                                        rawMaterialId:
                                            String(
                                                material
                                                    .raw_material
                                                    .id,
                                            ),

                                        warehouseId:
                                            String(
                                                material
                                                    .warehouse
                                                    .id,
                                            ),

                                        actualQuantity:
                                            material
                                                .actual_quantity,

                                        note:
                                            material.note
                                            ?? '',
                                    }),
                                ),
                        }),
                    ),
                );

                void previewProductionRun(
                    run.id,
                )
                    .then(
                        setPreview,
                    )
                    .catch(
                        () =>
                            setPreview(
                                null,
                            ),
                    );

                return;
            }

            setOccurredOn(
                todayInputValue(),
            );

            setNote(
                '',
            );

            setSavedRun(
                null,
            );

            setDirty(
                true,
            );

            setOutputs([
                blankOutput(
                    defaultWarehouseId,
                ),
            ]);
        },
        [
            defaultWarehouseId,
            open,
            run,
        ],
    );

    /**
     * Mark the editor as changed after the last saved Preview.
     */
    function markDirty(): void {
        setDirty(
            true,
        );

        setPreview(
            null,
        );
    }

    /**
     * Replace one Product output in editor state.
     */
    function updateOutput(
        key: string,
        updater: (
            output: EditorOutput,
        ) => EditorOutput,
    ): void {
        markDirty();

        setOutputs(
            (
                current,
            ) =>
                current.map(
                    (
                        output,
                    ) =>
                        output.key ===
                        key
                            ? updater(
                                  output,
                              )
                            : output,
                ),
        );
    }

    /**
     * Load the active Recipe and seed actual material rows from its defaults.
     */
    async function selectProduct(
        outputKey: string,
        productId: string,
    ): Promise<void> {
        if (productId && outputs.some(item => item.key !== outputKey && item.productId === productId)) { return; }
        updateOutput(
            outputKey,
            (
                output,
            ) => ({
                ...output,

                productId,

                recipeId:
                    null,

                recipeVersion:
                    null,

                selections:
                    {},

                suggestions:
                    [],

                materials:
                    [],
            }),
        );

        if (! productId) {
            return;
        }

        setRecipeBusy(
            outputKey,
        );

        try {
            const response =
                await fetchProductionRecipe(
                    Number(
                        productId,
                    ),
                );

            const recipe =
                response.data
                    .active;

            if (! recipe) {
                return;
            }

            const {
                lines,
                selections,
            } =
                recipeSuggestions(
                    recipe,
                );

            setOutputs(
                (
                    current,
                ) =>
                    current.map(
                        (
                            output,
                        ) => {
                            if (
                                output.key !==
                                outputKey
                            ) {
                                return output;
                            }

                            const warehouseId =
                                output
                                    .warehouseId
                                ||
                                defaultWarehouseId;

                            return {
                                ...output,

                                recipeId:
                                    recipe.id,

                                recipeVersion:
                                    recipe.version,

                                selections,

                                suggestions:
                                    lines,

                                materials:
                                    lines.map(
                                        (
                                            line,
                                        ) => ({
                                            key:
                                                makeKey(),

                                            rawMaterialId:
                                                String(
                                                    line.rawMaterialId,
                                                ),

                                            warehouseId,

                                            actualQuantity:
                                                quantity4(
                                                    Number(
                                                        output.quantity,
                                                    )
                                                    *
                                                    Number(
                                                        line.quantityPerUnit,
                                                    ),
                                                ),

                                            note:
                                                '',
                                        }),
                                    ),
                            };
                        },
                    ),
            );
        } catch {
            // Recipe is optional, therefore failing to load one does not
            // prevent manual Actual Consumption entry.
        } finally {
            setRecipeBusy(
                null,
            );
        }
    }

    /**
     * Re-enable the active Recipe for one output after it was disabled.
     */
    async function enableRecipe(
        output: EditorOutput,
    ): Promise<void> {
        if (! output.productId) {
            return;
        }

        await selectProduct(
            output.key,
            output.productId,
        );
    }

    /**
     * Keep actual rows but stop associating this output with a Recipe.
     */
    function disableRecipe(
        outputKey: string,
    ): void {
        updateOutput(
            outputKey,
            (
                output,
            ) => ({
                ...output,

                recipeId:
                    null,

                recipeVersion:
                    null,

                selections:
                    {},

                suggestions:
                    [],
            }),
        );
    }

    /**
     * Copy current Recipe suggestions into Actual Consumption rows.
     */
    function copySuggestions(
        outputKey: string,
    ): void {
        updateOutput(
            outputKey,
            (
                output,
            ) => {
                const materials =
                    [
                        ...output.materials,
                    ];

                output.suggestions.forEach(
                    (
                        suggestion,
                    ) => {
                        const index =
                            materials.findIndex(
                                (
                                    material,
                                ) =>
                                    Number(
                                        material.rawMaterialId,
                                    ) ===
                                    suggestion.rawMaterialId,
                            );

                        const value =
                            suggestedQuantity(
                                output,
                                suggestion.rawMaterialId,
                            );

                        if (
                            index >=
                            0
                        ) {
                            materials[
                                index
                            ] = {
                                ...materials[
                                    index
                                ],

                                actualQuantity:
                                    value,
                            };

                            return;
                        }

                        materials.push({
                            key:
                                makeKey(),

                            rawMaterialId:
                                String(
                                    suggestion.rawMaterialId,
                                ),

                            warehouseId:
                                output
                                    .warehouseId
                                ||
                                defaultWarehouseId,

                            actualQuantity:
                                value,

                            note:
                                '',
                        });
                    },
                );

                return {
                    ...output,

                    materials,
                };
            },
        );
    }

    /**
     * Persist Draft content and immediately load server-side Inventory Preview.
     */
    async function saveDraft(): Promise<void> {
        setError(
            null,
        );

        const valid =
            outputs.length >
                0
            &&
            outputs.every(
                (
                    output,
                ) =>
                    Number(
                        output.productId,
                    ) >
                        0
                    &&
                    Number(
                        output.warehouseId,
                    ) >
                        0
                    &&
                    Number(
                        output.quantity,
                    ) >
                        0
                    &&
                    output.materials
                        .length >
                        0
                    &&
                    output.materials.every(
                        (
                            material,
                        ) =>
                            Number(
                                material.rawMaterialId,
                            ) >
                                0
                            &&
                            Number(
                                material.warehouseId,
                            ) >
                                0
                            &&
                            Number(
                                material.actualQuantity,
                            ) >
                                0,
                    ),
            );

        if (! valid) {
            setError(
                copy.saveFailed,
            );

            return;
        }

        const payload:
            ProductionRunPayload = {
            occurred_on:
                occurredOn,

            note:
                note.trim()
                    ? note.trim()
                    : null,

            outputs:
                outputs.map(
                    (
                        output,
                    ) => ({
                        product_id:
                            Number(
                                output.productId,
                            ),

                        warehouse_id:
                            Number(
                                output.warehouseId,
                            ),

                        quantity:
                            output.quantity,

                        recipe_id:
                            output.recipeId,

                        selections:
                            output.recipeId
                                ? output.selections
                                : {},

                        materials:
                            output.materials.map(
                                (
                                    material,
                                ) => ({
                                    raw_material_id:
                                        Number(
                                            material.rawMaterialId,
                                        ),

                                    warehouse_id:
                                        Number(
                                            material.warehouseId,
                                        ),

                                    actual_quantity:
                                        material.actualQuantity,

                                    note:
                                        material.note.trim()
                                            ? material.note.trim()
                                            : null,
                                }),
                            ),
                    }),
                ),
        };

        setBusy(
            true,
        );

        try {
            const nextRun =
                savedRun
                    ? await updateProductionRun(
                          savedRun.id,
                          savedRun.revision,
                          payload,
                      )
                    : await createProductionRun(
                          payload,
                      );

            setSavedRun(
                nextRun,
            );

            setDirty(
                false,
            );

            const nextPreview =
                await previewProductionRun(
                    nextRun.id,
                );

            setPreview(
                nextPreview,
            );

            onChanged();
        } catch (
            exception
        ) {
            setError(
                exception instanceof
                ApiError
                    ? exception.message
                    : copy.saveFailed,
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    /**
     * Post the last saved and reviewed Production Draft to Inventory.
     */
    async function postRun(): Promise<void> {
        if (
            ! savedRun
            || dirty
            || ! preview
            || ! preview
                .all_sufficient
        ) {
            return;
        }

        setBusy(
            true,
        );

        setError(
            null,
        );

        try {
            await postProductionRun(
                savedRun.id,
                savedRun.revision,
            );

            onChanged();
            onClose();
        } catch (
            exception
        ) {
            setError(
                exception instanceof
                ApiError
                    ? exception.message
                    : copy.postFailed,
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    if (! open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[120] flex justify-end bg-[var(--ac-text)]/25 backdrop-blur-[2px]">
            <section className="flex h-dvh w-full max-w-[980px] flex-col bg-[var(--ac-bg)] shadow-[-30px_0_80px_rgba(20,35,30,0.16)]">
                <header className="flex shrink-0 items-center justify-between border-b border-[var(--ac-line)] bg-white px-4 py-4 sm:px-6">
                    <div>
                        <div className="flex items-center gap-2">
                            <Factory
                                size={
                                    18
                                }
                                className="text-[var(--ac-accent-strong)]"
                            />

                            <h2 className="font-semibold">
                                {savedRun
                                    ?.run_number
                                ??
                                copy.newRun}
                            </h2>
                        </div>

                        <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                            {
                                copy.actualTruth
                            }
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={
                            onClose
                        }
                        className="flex size-10 items-center justify-center rounded-xl bg-[var(--ac-bg-soft)]"
                        aria-label={
                            copy.close
                        }
                    >
                        <X
                            size={
                                18
                            }
                        />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                    {error && (
                        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {
                                error
                            }
                        </div>
                    )}

                    <div className="mb-5 grid gap-4 rounded-[22px] border border-[var(--ac-line)] bg-white p-4 sm:grid-cols-2">
                        <label className="text-xs font-semibold">
                            {
                                copy.date
                            }

                            <input
                                type="date"
                                value={
                                    occurredOn
                                }
                                max={
                                    todayInputValue()
                                }
                                onChange={(
                                    event,
                                ) => {
                                    setOccurredOn(
                                        event
                                            .target
                                            .value,
                                    );

                                    markDirty();
                                }}
                                className="mt-2 h-11 w-full rounded-xl border border-[var(--ac-line)] bg-white px-3 text-sm outline-none"
                            />
                        </label>

                        <label className="text-xs font-semibold">
                            {
                                copy.note
                            }

                            <input
                                value={
                                    note
                                }
                                onChange={(
                                    event,
                                ) => {
                                    setNote(
                                        event
                                            .target
                                            .value,
                                    );

                                    markDirty();
                                }}
                                className="mt-2 h-11 w-full rounded-xl border border-[var(--ac-line)] bg-white px-3 text-sm outline-none"
                            />
                        </label>
                    </div>

                    <div className="space-y-4">
                        {outputs.map(
                            (
                                output,
                                outputIndex,
                            ) => (
                                <article
                                    key={
                                        output.key
                                    }
                                    className="rounded-[24px] border border-[var(--ac-line)] bg-white p-4 shadow-[var(--ac-shadow-soft)] sm:p-5"
                                >
                                    <div className="mb-4 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <div className="flex size-9 items-center justify-center rounded-xl bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                                <PackagePlus
                                                    size={
                                                        17
                                                    }
                                                />
                                            </div>

                                            <span className="text-sm font-semibold">
                                                {
                                                    copy.product
                                                }{' '}
                                                #
                                                {outputIndex +
                                                    1}
                                            </span>
                                        </div>

                                        {outputs.length >
                                            1 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    markDirty();

                                                    setOutputs(
                                                        (
                                                            current,
                                                        ) =>
                                                            current.filter(
                                                                (
                                                                    item,
                                                                ) =>
                                                                    item.key !==
                                                                    output.key,
                                                            ),
                                                    );
                                                }}
                                                className="flex size-9 items-center justify-center rounded-xl text-red-600 transition hover:bg-red-50"
                                            >
                                                <Trash2
                                                    size={
                                                        16
                                                    }
                                                />
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid gap-3 lg:grid-cols-3">
                                        <label className="text-xs font-semibold">
                                            {
                                                copy.product
                                            }

                                            <select
                                                value={
                                                    output.productId
                                                }
                                                onChange={(
                                                    event,
                                                ) => {
                                                    void selectProduct(
                                                        output.key,
                                                        event
                                                            .target
                                                            .value,
                                                    );
                                                }}
                                                className="mt-2 h-11 w-full rounded-xl border border-[var(--ac-line)] bg-white px-3 text-sm"
                                            >
                                                <option value="">
                                                    —
                                                </option>

                                                {products.map(
                                                    (
                                                        product,
                                                    ) => (
                                                        <option
                                                            key={
                                                                product.id
                                                            } disabled={outputs.some(item => item.key !== output.key && item.productId === String(product.id))}
                                                            value={
                                                                product.id
                                                            }
                                                        >
                                                            {
                                                                product.name
                                                            }

                                                            {product.sku
                                                                ? ` · ${product.sku}`
                                                                : ''}
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                        </label>

                                        <label className="text-xs font-semibold">
                                            {
                                                copy.producedQuantity
                                            }

                                            <input
                                                inputMode="decimal"
                                                value={
                                                    output.quantity
                                                }
                                                onChange={(
                                                    event,
                                                ) =>
                                                    updateOutput(
                                                        output.key,
                                                        (
                                                            current,
                                                        ) => ({
                                                            ...current,

                                                            quantity:
                                                                event
                                                                    .target
                                                                    .value,
                                                        }),
                                                    )
                                                }
                                                className="mt-2 h-11 w-full rounded-xl border border-[var(--ac-line)] bg-white px-3 text-sm"
                                            />
                                        </label>

                                        <label className="text-xs font-semibold">
                                            {
                                                copy.outputWarehouse
                                            }

                                            <select
                                                value={
                                                    output.warehouseId
                                                }
                                                onChange={(
                                                    event,
                                                ) =>
                                                    updateOutput(
                                                        output.key,
                                                        (
                                                            current,
                                                        ) => ({
                                                            ...current,

                                                            warehouseId:
                                                                event
                                                                    .target
                                                                    .value,
                                                        }),
                                                    )
                                                }
                                                className="mt-2 h-11 w-full rounded-xl border border-[var(--ac-line)] bg-white px-3 text-sm"
                                            >
                                                <option value="">
                                                    —
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

                                                            {' · '}

                                                            {
                                                                warehouse.code
                                                            }
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                        </label>
                                    </div>

                                    <div className="mt-4 rounded-2xl bg-[var(--ac-bg-soft)] p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-semibold">
                                                    {
                                                        copy.recipe
                                                    }
                                                </p>

                                                <p className="mt-1 text-[11px] text-[var(--ac-text-muted)]">
                                                    {output.recipeId
                                                        ? `${copy.recipeVersion} ${output.recipeVersion}`
                                                        : copy.noRecipe}
                                                </p>
                                            </div>

                                            {recipeBusy ===
                                            output.key ? (
                                                <span className="text-xs text-[var(--ac-text-muted)]">
                                                    {
                                                        copy.loading
                                                    }
                                                </span>
                                            ) : output.recipeId ? (
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            copySuggestions(
                                                                output.key,
                                                            )
                                                        }
                                                        className="rounded-xl border border-[var(--ac-line)] bg-white px-3 py-2 text-xs font-semibold"
                                                    >
                                                        {
                                                            copy.copySuggestions
                                                        }
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            disableRecipe(
                                                                output.key,
                                                            )
                                                        }
                                                        className="rounded-xl border border-[var(--ac-line)] bg-white px-3 py-2 text-xs font-semibold"
                                                    >
                                                        {
                                                            copy.noRecipe
                                                        }
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={
                                                        ! output.productId
                                                    }
                                                    onClick={() =>
                                                        void enableRecipe(
                                                            output,
                                                        )
                                                    }
                                                    className="rounded-xl border border-[var(--ac-line)] bg-white px-3 py-2 text-xs font-semibold disabled:opacity-40"
                                                >
                                                    {
                                                        copy.useActiveRecipe
                                                    }
                                                </button>
                                            )}
                                        </div>

                                        <p className="mt-2 text-[11px] leading-5 text-[var(--ac-text-muted)]">
                                            {
                                                copy.recipeOptional
                                            }
                                        </p>
                                    </div>

                                    <div className="mt-5">
                                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <p className="text-sm font-semibold">
                                                    {
                                                        copy.actualMaterials
                                                    }
                                                </p>

                                                <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                                    {
                                                        copy.actualTruth
                                                    }
                                                </p>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    updateOutput(
                                                        output.key,
                                                        (
                                                            current,
                                                        ) => ({
                                                            ...current,

                                                            materials:
                                                                [
                                                                    ...current.materials,

                                                                    {
                                                                        key:
                                                                            makeKey(),

                                                                        rawMaterialId:
                                                                            '',

                                                                        warehouseId:
                                                                            current.warehouseId
                                                                            ||
                                                                            defaultWarehouseId,

                                                                        actualQuantity:
                                                                            '',

                                                                        note:
                                                                            '',
                                                                    },
                                                                ],
                                                        }),
                                                    )
                                                }
                                                className="inline-flex items-center gap-2 rounded-xl border border-[var(--ac-line)] px-3 py-2 text-xs font-semibold"
                                            >
                                                <Plus
                                                    size={
                                                        14
                                                    }
                                                />

                                                {
                                                    copy.addMaterial
                                                }
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            {output.materials.map(
                                                (
                                                    material,
                                                ) => {
                                                    const raw =
                                                        rawMaterials.find(
                                                            (
                                                                item,
                                                            ) =>
                                                                item.id ===
                                                                Number(
                                                                    material.rawMaterialId,
                                                                ),
                                                        );

                                                    const suggested =
                                                        material.rawMaterialId
                                                            ? suggestedQuantity(
                                                                  output,
                                                                  Number(
                                                                      material.rawMaterialId,
                                                                  ),
                                                              )
                                                            : '0.0000';

                                                    const difference =
                                                        Number(
                                                            material.actualQuantity,
                                                        )
                                                        -
                                                        Number(
                                                            suggested,
                                                        );

                                                    return (
                                                        <div
                                                            key={
                                                                material.key
                                                            }
                                                            className="grid gap-2 rounded-2xl border border-[var(--ac-line)] p-3 xl:grid-cols-[1.45fr_1.2fr_.75fr_.75fr_.75fr_42px]"
                                                        >
                                                            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                                                {
                                                                    copy.rawMaterial
                                                                }

                                                                <select
                                                                    value={
                                                                        material.rawMaterialId
                                                                    }
                                                                    onChange={(
                                                                        event,
                                                                    ) =>
                                                                        updateOutput(
                                                                            output.key,
                                                                            (
                                                                                current,
                                                                            ) => ({
                                                                                ...current,

                                                                                materials:
                                                                                    current.materials.map(
                                                                                        (
                                                                                            item,
                                                                                        ) =>
                                                                                            item.key ===
                                                                                            material.key
                                                                                                ? {
                                                                                                      ...item,

                                                                                                      rawMaterialId:
                                                                                                          event
                                                                                                              .target
                                                                                                              .value,
                                                                                                  }
                                                                                                : item,
                                                                                    ),
                                                                            }),
                                                                        )
                                                                    }
                                                                    className="mt-1 h-10 w-full rounded-xl border border-[var(--ac-line)] bg-white px-2 text-xs normal-case tracking-normal text-[var(--ac-text)]"
                                                                >
                                                                    <option value="">
                                                                        —
                                                                    </option>

                                                                    {rawMaterials.map(
                                                                        (
                                                                            item,
                                                                        ) => (
                                                                            <option
                                                                                key={
                                                                                    item.id
                                                                                }
                                                                                value={
                                                                                    item.id
                                                                                }
                                                                            >
                                                                                {
                                                                                    item.name
                                                                                }

                                                                                {item.sku
                                                                                    ? ` · ${item.sku}`
                                                                                    : ''}
                                                                            </option>
                                                                        ),
                                                                    )}
                                                                </select>
                                                            </label>

                                                            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                                                {
                                                                    copy.sourceWarehouse
                                                                }

                                                                <select
                                                                    value={
                                                                        material.warehouseId
                                                                    }
                                                                    onChange={(
                                                                        event,
                                                                    ) =>
                                                                        updateOutput(
                                                                            output.key,
                                                                            (
                                                                                current,
                                                                            ) => ({
                                                                                ...current,

                                                                                materials:
                                                                                    current.materials.map(
                                                                                        (
                                                                                            item,
                                                                                        ) =>
                                                                                            item.key ===
                                                                                            material.key
                                                                                                ? {
                                                                                                      ...item,

                                                                                                      warehouseId:
                                                                                                          event
                                                                                                              .target
                                                                                                              .value,
                                                                                                  }
                                                                                                : item,
                                                                                    ),
                                                                            }),
                                                                        )
                                                                    }
                                                                    className="mt-1 h-10 w-full rounded-xl border border-[var(--ac-line)] bg-white px-2 text-xs normal-case tracking-normal text-[var(--ac-text)]"
                                                                >
                                                                    <option value="">
                                                                        —
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

                                                            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                                                {
                                                                    copy.suggested
                                                                }

                                                                <div className="mt-1 flex h-10 items-center rounded-xl bg-[var(--ac-bg-soft)] px-2 text-xs font-semibold normal-case tracking-normal text-[var(--ac-text)]">
                                                                    {
                                                                        suggested
                                                                    }{' '}
                                                                    {raw
                                                                        ?.unit
                                                                    ?? ''}
                                                                </div>
                                                            </div>

                                                            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                                                {
                                                                    copy.actual
                                                                }

                                                                <input
                                                                    inputMode="decimal"
                                                                    value={
                                                                        material.actualQuantity
                                                                    }
                                                                    onChange={(
                                                                        event,
                                                                    ) =>
                                                                        updateOutput(
                                                                            output.key,
                                                                            (
                                                                                current,
                                                                            ) => ({
                                                                                ...current,

                                                                                materials:
                                                                                    current.materials.map(
                                                                                        (
                                                                                            item,
                                                                                        ) =>
                                                                                            item.key ===
                                                                                            material.key
                                                                                                ? {
                                                                                                      ...item,

                                                                                                      actualQuantity:
                                                                                                          event
                                                                                                              .target
                                                                                                              .value,
                                                                                                  }
                                                                                                : item,
                                                                                    ),
                                                                            }),
                                                                        )
                                                                    }
                                                                    className="mt-1 h-10 w-full rounded-xl border border-[var(--ac-line)] px-2 text-xs normal-case tracking-normal text-[var(--ac-text)]"
                                                                />
                                                            </label>

                                                            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                                                {
                                                                    copy.difference
                                                                }

                                                                <div className="mt-1 flex h-10 items-center rounded-xl bg-[var(--ac-bg-soft)] px-2 text-xs font-semibold normal-case tracking-normal text-[var(--ac-text)]">
                                                                    {quantity4(
                                                                        Math.abs(
                                                                            difference,
                                                                        ),
                                                                    )}

                                                                    {difference >
                                                                    0
                                                                        ? ' ↑'
                                                                        : difference <
                                                                            0
                                                                          ? ' ↓'
                                                                          : ''}
                                                                </div>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    updateOutput(
                                                                        output.key,
                                                                        (
                                                                            current,
                                                                        ) => ({
                                                                            ...current,

                                                                            materials:
                                                                                current.materials.filter(
                                                                                    (
                                                                                        item,
                                                                                    ) =>
                                                                                        item.key !==
                                                                                        material.key,
                                                                                ),
                                                                        }),
                                                                    )
                                                                }
                                                                className="mt-4 flex size-10 items-center justify-center rounded-xl text-red-600 hover:bg-red-50 xl:mt-[18px]"
                                                            >
                                                                <Trash2
                                                                    size={
                                                                        15
                                                                    }
                                                                />
                                                            </button>
                                                        </div>
                                                    );
                                                },
                                            )}
                                        </div>
                                    </div>
                                </article>
                            ),
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            markDirty();

                            setOutputs(
                                (
                                    current,
                                ) => [
                                    ...current,

                                    blankOutput(
                                        defaultWarehouseId,
                                    ),
                                ],
                            );
                        }}
                        className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-dashed border-[var(--ac-line)] bg-white px-4 py-3 text-sm font-semibold"
                    >
                        <Plus
                            size={
                                16
                            }
                        />

                        {
                            copy.addProduct
                        }
                    </button>

                    {preview && (
                        <PreviewPanel
                            preview={
                                preview
                            }
                            copy={
                                copy
                            }
                        />
                    )}
                </div>

                <footer className="shrink-0 border-t border-[var(--ac-line)] bg-white px-4 py-4 sm:px-6">
                    {dirty &&
                        savedRun && (
                            <p className="mb-3 text-xs font-medium text-amber-700">
                                {
                                    copy.dirtyWarning
                                }
                            </p>
                        )}

                    {savedRun && <button type="button" disabled={busy} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 disabled:opacity-50" onClick={async () => {if(!window.confirm(copy.draft + ' ? ' + (document.documentElement.lang === 'ar' ? 'حذف المسودة؟' : 'Delete draft?')))return;setBusy(true);try{await apiRequest('/api/production-runs/'+savedRun.id,{method:'DELETE',body:JSON.stringify({expected_revision:savedRun.revision})});onChanged();onClose();}catch(failure){setError(failure instanceof Error ? failure.message : String(failure));}finally{setBusy(false);}}}>{document.documentElement.lang === 'ar' ? 'حذف المسودة' : 'Delete draft'}</button>}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={
                                onClose
                            }
                            className="h-11 rounded-xl border border-[var(--ac-line)] px-4 text-sm font-semibold"
                        >
                            {
                                copy.close
                            }
                        </button>

                        <button
                            type="button"
                            disabled={
                                busy
                            }
                            onClick={() =>
                                void saveDraft()
                            }
                            className="h-11 rounded-xl border border-[var(--ac-line)] bg-white px-4 text-sm font-semibold disabled:opacity-50"
                        >
                            {busy
                                ? copy.saving
                                : copy.savePreview}
                        </button>

                        {savedRun &&
                            preview && (
                                <button
                                    type="button"
                                    disabled={
                                        busy
                                        ||
                                        dirty
                                        ||
                                        ! preview.all_sufficient
                                    }
                                    onClick={() =>
                                        void postRun()
                                    }
                                    className="h-11 rounded-xl bg-[var(--ac-text)] px-5 text-sm font-semibold text-white disabled:opacity-40"
                                >
                                    {busy
                                        ? copy.posting
                                        : copy.post}
                                </button>
                            )}
                    </div>
                </footer>
            </section>
        </div>
    );
}

/**
 * Render server-authoritative stock availability and variance Preview.
 */
function PreviewPanel({
    preview,
    copy,
}: {
    preview: ProductionPreview;

    copy: Copy;
}) {
    return (
        <section className="mt-6 rounded-[24px] border border-[var(--ac-line)] bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="font-semibold">
                        {
                            copy.preview
                        }
                    </h3>

                    <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                        {
                            preview.run_number
                        }
                    </p>
                </div>

                <div
                    className={[
                        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold',
                        preview.all_sufficient
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700',
                    ].join(
                        ' ',
                    )}
                >
                    {preview.all_sufficient ? (
                        <CheckCircle2
                            size={
                                14
                            }
                        />
                    ) : (
                        <AlertTriangle
                            size={
                                14
                            }
                        />
                    )}

                    {preview.all_sufficient
                        ? copy.sufficient
                        : copy.shortage}
                </div>
            </div>

            <div className="mt-5 space-y-2">
                {preview.materials.map(
                    (
                        material,
                    ) => (
                        <div
                            key={`${material.warehouse.id}-${material.raw_material.id}`}
                            className="grid gap-2 rounded-2xl bg-[var(--ac-bg-soft)] p-3 text-xs sm:grid-cols-4"
                        >
                            <div>
                                <p className="font-semibold">
                                    {
                                        material
                                            .raw_material
                                            .name
                                    }
                                </p>

                                <p className="mt-1 text-[var(--ac-text-muted)]">
                                    {
                                        material
                                            .warehouse
                                            .name
                                    }
                                </p>
                            </div>

                            <div>
                                <p className="text-[var(--ac-text-muted)]">
                                    {
                                        copy.required
                                    }
                                </p>

                                <p className="mt-1 font-semibold">
                                    {
                                        material.actual_required
                                    }{' '}
                                    {
                                        material
                                            .raw_material
                                            .unit
                                    }
                                </p>
                            </div>

                            <div>
                                <p className="text-[var(--ac-text-muted)]">
                                    {
                                        copy.available
                                    }
                                </p>

                                <p className="mt-1 font-semibold">
                                    {
                                        material.available
                                    }{' '}
                                    {
                                        material
                                            .raw_material
                                            .unit
                                    }
                                </p>
                            </div>

                            <div>
                                <p className="text-[var(--ac-text-muted)]">
                                    {
                                        copy.shortage
                                    }
                                </p>

                                <p
                                    className={[
                                        'mt-1 font-semibold',
                                        material.sufficient
                                            ? 'text-emerald-700'
                                            : 'text-red-700',
                                    ].join(
                                        ' ',
                                    )}
                                >
                                    {
                                        material.shortage
                                    }{' '}
                                    {
                                        material
                                            .raw_material
                                            .unit
                                    }
                                </p>
                            </div>
                        </div>
                    ),
                )}
            </div>

            <div className="mt-5 space-y-4">
                {preview.outputs.map(
                    (
                        output,
                    ) => (
                        <div
                            key={
                                output.id
                            }
                            className="rounded-2xl border border-[var(--ac-line)] p-3"
                        >
                            <div className="mb-3 flex items-center justify-between">
                                <p className="text-sm font-semibold">
                                    {
                                        output
                                            .product
                                            .name
                                    }{' '}
                                    ×{' '}
                                    {
                                        output.quantity
                                    }
                                </p>

                                <span className="text-xs text-[var(--ac-text-muted)]">
                                    {output.recipe_version
                                        ? `${copy.recipeVersion} ${output.recipe_version}`
                                        : copy.noRecipe}
                                </span>
                            </div>

                            {output.comparison.length >
                            0 ? (
                                <div className="space-y-1">
                                    {output.comparison.map(
                                        (
                                            row,
                                        ) => (
                                            <div
                                                key={
                                                    row.raw_material_id
                                                }
                                                className="grid grid-cols-[1fr_auto_auto_auto] gap-3 rounded-xl bg-[var(--ac-bg-soft)] px-3 py-2 text-xs"
                                            >
                                                <span className="font-medium">
                                                    {
                                                        row.name
                                                    }
                                                </span>

                                                <span>
                                                    {
                                                        copy.suggested
                                                    }
                                                    :{' '}
                                                    {
                                                        row.suggested
                                                    }
                                                </span>

                                                <span>
                                                    {
                                                        copy.actual
                                                    }
                                                    :{' '}
                                                    {
                                                        row.actual
                                                    }
                                                </span>

                                                <span className="font-semibold">
                                                    {
                                                        row.deviation
                                                    }

                                                    {row.deviation_percent !==
                                                        null &&
                                                        ` (${row.deviation_percent}%)`}
                                                </span>
                                            </div>
                                        ),
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-[var(--ac-text-muted)]">
                                    {
                                        copy.noRecipe
                                    }
                                </p>
                            )}
                        </div>
                    ),
                )}
            </div>
        </section>
    );
}

/**
 * Render one existing Production Run with reversal controls.
 */
function ProductionDetail({
    run,
    copy,
    canManage,
    onClose,
    onEdit,
    onChanged,
}: {
    run:
        | ProductionRun
        | null;

    copy: Copy;

    canManage: boolean;

    onClose: () => void;

    onEdit: (
        run: ProductionRun,
    ) => void;

    onChanged: () => void;
}) {
    const [
        current,
        setCurrent,
    ] =
        useState<
            ProductionRun | null
        >(
            null,
        );

    const [
        reason,
        setReason,
    ] =
        useState(
            '',
        );

    const [
        busy,
        setBusy,
    ] =
        useState(
            false,
        );

    const [
        error,
        setError,
    ] =
        useState<
            string | null
        >(
            null,
        );

    /**
     * Reload selected Production Run when the detail drawer opens.
     */
    useEffect(
        () => {
            if (! run) {
                setCurrent(
                    null,
                );

                return;
            }

            setCurrent(
                run,
            );

            setReason(
                '',
            );

            setError(
                null,
            );

            void fetchProductionRun(
                run.id,
            )
                .then(
                    setCurrent,
                )
                .catch(
                    () =>
                        setCurrent(
                            run,
                        ),
                );
        },
        [
            run,
        ],
    );

    /**
     * Reverse one Product output and retain the remaining posted outputs.
     */
    async function reverseOne(
        outputId: number,
    ): Promise<void> {
        if (
            ! current
            || reason.trim()
                .length <
                3
        ) {
            return;
        }

        setBusy(
            true,
        );

        setError(
            null,
        );

        try {
            const next =
                await reverseProductionOutput(
                    current.id,
                    outputId,
                    current.revision,
                    reason.trim(),
                );

            setCurrent(
                next,
            );

            setReason(
                '',
            );

            onChanged();
        } catch (
            exception
        ) {
            setError(
                exception instanceof
                ApiError
                    ? exception.message
                    : copy.reversalFailed,
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    /**
     * Reverse all currently active outputs in the selected Production Run.
     */
    async function reverseRemaining(): Promise<void> {
        if (
            ! current
            || reason.trim()
                .length <
                3
        ) {
            return;
        }

        setBusy(
            true,
        );

        setError(
            null,
        );

        try {
            const next =
                await reverseProductionRun(
                    current.id,
                    current.revision,
                    reason.trim(),
                );

            setCurrent(
                next,
            );

            setReason(
                '',
            );

            onChanged();
        } catch (
            exception
        ) {
            setError(
                exception instanceof
                ApiError
                    ? exception.message
                    : copy.reversalFailed,
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    if (! current) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[115] flex justify-end bg-[var(--ac-text)]/25 backdrop-blur-[2px]">
            <section className="flex h-dvh w-full max-w-[760px] flex-col bg-[var(--ac-bg)] shadow-[-30px_0_80px_rgba(20,35,30,0.16)]">
                <header className="flex items-center justify-between border-b border-[var(--ac-line)] bg-white px-5 py-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="font-semibold">
                                {
                                    current.run_number
                                }
                            </h2>

                            <StatusBadge
                                status={
                                    current.status
                                }
                                copy={
                                    copy
                                }
                            />
                        </div>

                        <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                            {
                                current.occurred_on
                            }
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={
                            onClose
                        }
                        className="flex size-10 items-center justify-center rounded-xl bg-[var(--ac-bg-soft)]"
                    >
                        <X
                            size={
                                18
                            }
                        />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-5">
                    {error && (
                        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {
                                error
                            }
                        </div>
                    )}

                    {current.note && (
                        <div className="mb-4 rounded-2xl bg-white p-4 text-sm text-[var(--ac-text-soft)]">
                            {
                                current.note
                            }
                        </div>
                    )}

                    <div className="space-y-4">
                        {current.outputs.map(
                            (
                                output,
                            ) => (
                                <article
                                    key={
                                        output.id
                                    }
                                    className="rounded-[22px] border border-[var(--ac-line)] bg-white p-4"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h3 className="font-semibold">
                                                {
                                                    output
                                                        .product
                                                        .name
                                                }
                                            </h3>

                                            <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                                {
                                                    output.quantity
                                                }{' '}
                                                {
                                                    output
                                                        .product
                                                        .unit
                                                }

                                                {' · '}

                                                {
                                                    output
                                                        .warehouse
                                                        .name
                                                }
                                            </p>
                                        </div>

                                        {output.reversed_at && (
                                            <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                                                {
                                                    copy.reversed
                                                }
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-4 rounded-2xl bg-[var(--ac-bg-soft)] p-3">
                                        <div className="flex items-center gap-2 text-xs font-semibold">
                                            <Beaker
                                                size={
                                                    14
                                                }
                                            />

                                            {
                                                output.recipe
                                                    ? `${copy.recipeVersion} ${output.recipe.version}`
                                                    : copy.noRecipe
                                            }
                                        </div>
                                    </div>

                                    <div className="mt-4 space-y-2">
                                        {output.materials.map(
                                            (
                                                material,
                                            ) => (
                                                <div
                                                    key={
                                                        material.id
                                                    }
                                                    className="grid gap-2 rounded-xl border border-[var(--ac-line)] px-3 py-2 text-xs sm:grid-cols-[1fr_1fr_auto]"
                                                >
                                                    <span className="font-medium">
                                                        {
                                                            material
                                                                .raw_material
                                                                .name
                                                        }
                                                    </span>

                                                    <span className="text-[var(--ac-text-muted)]">
                                                        {
                                                            material
                                                                .warehouse
                                                                .name
                                                        }
                                                    </span>

                                                    <span className="font-semibold">
                                                        {
                                                            material.actual_quantity
                                                        }{' '}
                                                        {
                                                            material
                                                                .raw_material
                                                                .unit
                                                        }
                                                    </span>
                                                </div>
                                            ),
                                        )}
                                    </div>

                                    {canManage &&
                                        output.can_reverse &&
                                        current.status !==
                                            'draft' && (
                                            <button
                                                type="button"
                                                disabled={
                                                    busy
                                                    ||
                                                    reason.trim()
                                                        .length <
                                                        3
                                                }
                                                onClick={() =>
                                                    void reverseOne(
                                                        output.id,
                                                    )
                                                }
                                                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 disabled:opacity-40"
                                            >
                                                <RefreshCcw
                                                    size={
                                                        14
                                                    }
                                                />

                                                {
                                                    copy.reverseOutput
                                                }
                                            </button>
                                        )}
                                </article>
                            ),
                        )}
                    </div>

                    {canManage &&
                        current.can_reverse && (
                            <div className="mt-5 rounded-[22px] border border-orange-200 bg-orange-50/50 p-4">
                                <label className="text-xs font-semibold text-orange-900">
                                    {
                                        copy.reverseReason
                                    }

                                    <textarea
                                        value={
                                            reason
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            setReason(
                                                event
                                                    .target
                                                    .value,
                                            )
                                        }
                                        rows={
                                            3
                                        }
                                        className="mt-2 w-full resize-none rounded-xl border border-orange-200 bg-white p-3 text-sm text-[var(--ac-text)] outline-none"
                                    />
                                </label>

                                <button
                                    type="button"
                                    disabled={
                                        busy
                                        ||
                                        reason.trim()
                                            .length <
                                            3
                                    }
                                    onClick={() =>
                                        void reverseRemaining()
                                    }
                                    className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-orange-700 px-4 text-xs font-semibold text-white disabled:opacity-40"
                                >
                                    <ArrowLeftRight
                                        size={
                                            15
                                        }
                                    />

                                    {busy
                                        ? copy.reversing
                                        : copy.reverseRemaining}
                                </button>
                            </div>
                        )}
                </div>

                <footer className="flex justify-end gap-2 border-t border-[var(--ac-line)] bg-white p-4">
                    {canManage &&
                        current.status ===
                            'draft' && (
                            <button
                                type="button"
                                onClick={() =>
                                    onEdit(
                                        current,
                                    )
                                }
                                className="h-10 rounded-xl bg-[var(--ac-text)] px-4 text-xs font-semibold text-white"
                            >
                                {
                                    copy.editDraft
                                }
                            </button>
                        )}

                    <button
                        type="button"
                        onClick={
                            onClose
                        }
                        className="h-10 rounded-xl border border-[var(--ac-line)] px-4 text-xs font-semibold"
                    >
                        {
                            copy.close
                        }
                    </button>
                </footer>
            </section>
        </div>
    );
}