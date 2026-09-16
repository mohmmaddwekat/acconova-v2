export type ProductType =
    | 'product'
    | 'raw_material'
    | 'service';

export type Product = {
    id: number;

    type: ProductType;

    name: string;

    sku:
        | string
        | null;

    description:
        | string
        | null;

    unit: string;

    unit_price: string;

    cost_price:
        | string
        | null;

    tax_rate: string;

    inventory_eligible: boolean;

    track_inventory: boolean;

    low_stock_threshold:
        | string
        | null;

    usable_for_new_business: boolean;

    deleted_at:
        | string
        | null;

    created_at: string;

    updated_at: string;
};

export type ProductIndexResponse = {
    data: Product[];
    meta: {
        current_page: number;

        last_page: number;

        per_page: number;

        total: number;
    };
};
