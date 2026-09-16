export type Warehouse = {
    id: number;

    code: string;

    name: string;

    is_default: boolean;

    stocked_products_count: number;

    stock_movements_count: number;

    deleted_at:
        | string
        | null;

    created_at: string;

    updated_at: string;
};

export type WarehouseStatus =
    | 'active'
    | 'deleted'
    | 'all';

export type StockMovementType =
    | 'opening'
    | 'adjustment'
    | 'transfer_out'
    | 'transfer_in'
    | 'sale'
    | 'purchase'
    | 'customer_return'
    | 'supplier_return';

export type StockMovement = {
    id: number;

    type: StockMovementType;

    quantity: string;

    balance_after: string;

    note:
        | string
        | null;

    transfer_group_uuid:
        | string
        | null;

    product:
        | {
              id: number;

              name: string;

              sku:
                  | string
                  | null;
          }
        | null;

    warehouse:
        | {
              id: number;

              code: string;

              name: string;
          }
        | null;

    created_at: string;
};

export type InventoryOverview = {
    metrics: {
        active_warehouses: number;

        archived_warehouses: number;

        tracked_products: number;

        low_stock_products: number;

        out_of_stock_products: number;

        inventory_value: string;
    };

    recent_movements: StockMovement[];
};

export type WarehousePayload = {
    name: string;
};

export type InventoryWarehouseOption = {
    id: number;

    code: string;

    name: string;

    is_default: boolean;
};

export type InventoryProductBalance = {
    warehouse: {
        id: number;

        code: string;

        name: string;

        is_default: boolean;

        deleted_at:
            | string
            | null;
    };

    on_hand: string;

    reserved: string;

    available: string;
};

export type InventoryProductDetail = {
    id: number;

    name: string;

    sku:
        | string
        | null;

    unit: string;

    cost_price:
        | string
        | null;

    track_inventory: boolean;

    low_stock_threshold:
        | string
        | null;

    on_hand: string;

    reserved: string;

    available: string;

    balances: InventoryProductBalance[];

    warehouses: InventoryWarehouseOption[];

    recent_movements: StockMovement[];
};

export type WarehouseInventoryProduct = {
    id: number;

    name: string;

    sku:
        | string
        | null;

    unit: string;

    track_inventory: boolean;

    low_stock_threshold:
        | string
        | null;

    on_hand: string;

    reserved: string;

    available: string;
};

export type WarehouseInventoryProducts = {
    warehouse: {
        id: number;

        code: string;

        name: string;

        is_default: boolean;

        deleted_at:
            | string
            | null;
    };

    products: WarehouseInventoryProduct[];

    total: number;
};

export type InventorySettingsPayload = {
    track_inventory: boolean;

    low_stock_threshold:
        | string
        | null;
};

export type OpeningStockPayload = {
    warehouse_id: number;

    quantity: string;

    note:
        | string
        | null;
};

export type StockAdjustmentPayload = {
    warehouse_id: number;

    quantity: string;

    note:
        | string
        | null;
};

export type StockTransferPayload = {
    source_warehouse_id: number;

    destination_warehouse_id: number;

    quantity: string;

    note:
        | string
        | null;
};