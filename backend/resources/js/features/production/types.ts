export type ProductionRunStatus =
    | 'draft'
    | 'posted'
    | 'partially_reversed'
    | 'reversed';

export type ProductionMaterial = {
    id: number;

    actual_quantity: string;

    note:
        | string
        | null;

    raw_material: {
        id: number;

        name: string;

        sku:
            | string
            | null;

        unit: string;
    };

    warehouse: {
        id: number;

        name: string;

        code: string;
    };
};

export type RecipeSnapshotComponent = {
    component_id: number;

    component_name: string;

    option_id: number;

    raw_material_id: number;

    raw_material_name: string;

    raw_material_sku:
        | string
        | null;

    unit: string;

    quantity_per_unit: string;

    required_quantity: string;

    is_substitute: boolean;
};

export type RecipeSnapshot = {
    recipe_id: number;

    recipe_version: number;

    finished_product_id: number;

    finished_product_name: string;

    finished_product_unit: string;

    output_quantity: string;

    components: RecipeSnapshotComponent[];
};

export type ProductionOutput = {
    id: number;

    line_number: number;

    quantity: string;

    selections:
        Record<
            string,
            number
        >;

    recipe_snapshot:
        | RecipeSnapshot
        | null;

    posted_movement_id:
        | number
        | null;

    reversed_at:
        | string
        | null;

    reversal_reason:
        | string
        | null;

    can_reverse: boolean;

    product: {
        id: number;

        name: string;

        sku:
            | string
            | null;

        unit: string;
    };

    warehouse: {
        id: number;

        name: string;

        code: string;
    };

    recipe:
        | {
              id: number;

              version: number;
          }
        | null;

    materials: ProductionMaterial[];
};

export type ProductionRun = {
    id: number;

    run_number: string;

    occurred_on: string;

    status: ProductionRunStatus;

    revision: number;

    note:
        | string
        | null;

    created_at: string;

    posted_at:
        | string
        | null;

    reversed_at:
        | string
        | null;

    reversal_reason:
        | string
        | null;

    is_mutable: boolean;

    can_post: boolean;

    can_reverse: boolean;

    outputs: ProductionOutput[];
};

export type ProductionRunIndexResponse = {
    data: ProductionRun[];

    meta: {
        current_page: number;

        last_page: number;

        per_page: number;

        total: number;
    };
};

export type ProductionRecipeOption = {
    id: number;

    quantity_per_unit: string;

    is_default: boolean;

    raw_material: {
        id: number;

        name: string;

        sku:
            | string
            | null;

        unit: string;

        track_inventory: boolean;
    };
};

export type ProductionRecipeComponent = {
    id: number;

    name: string;

    position: number;

    options: ProductionRecipeOption[];
};

export type ProductionRecipe = {
    id: number;

    version: number;

    is_active: boolean;

    notes:
        | string
        | null;

    created_at: string;

    components: ProductionRecipeComponent[];
};

export type ProductionRecipeResponse = {
    data: {
        active:
            | ProductionRecipe
            | null;
    };
};

export type ProductionRunPayload = {
    occurred_on: string;

    note:
        | string
        | null;

    outputs: {
        product_id: number;

        warehouse_id: number;

        quantity: string;

        recipe_id:
            | number
            | null;

        selections:
            Record<
                string,
                number
            >;

        materials: {
            raw_material_id: number;

            warehouse_id: number;

            actual_quantity: string;

            note:
                | string
                | null;
        }[];
    }[];
};

export type ProductionPreview = {
    run_id: number;

    run_number: string;

    revision: number;

    all_sufficient: boolean;

    output_count: number;

    outputs: {
        id: number;

        product: {
            id: number;

            name: string;

            unit: string;
        };

        quantity: string;

        warehouse: {
            id: number;

            name: string;
        };

        recipe_version:
            | number
            | null;

        comparison: {
            raw_material_id: number;

            name: string;

            unit: string;

            suggested: string;

            actual: string;

            deviation: string;

            deviation_percent:
                | number
                | null;
        }[];
    }[];

    materials: {
        raw_material: {
            id: number;

            name: string;

            sku:
                | string
                | null;

            unit: string;
        };

        warehouse: {
            id: number;

            name: string;

            code: string;
        };

        actual_required: string;

        on_hand: string;

        reserved: string;

        available: string;

        shortage: string;

        sufficient: boolean;
    }[];
};