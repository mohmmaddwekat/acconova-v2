import type {
    InventoryOverview,
    InventoryProductDetail,
    InventorySettingsPayload,
    OpeningStockPayload,
    StockAdjustmentPayload,
    StockTransferPayload,
    Warehouse,
    WarehouseInventoryProducts,
    WarehousePayload,
    WarehouseStatus,
} from '@/features/inventory/types';
import {
    apiRequest,
} from '@/lib/http';

/**
 * Load the current workspace Inventory summary.
 */
export async function fetchInventoryOverview(): Promise<InventoryOverview> {
    const response =
        await apiRequest<{
            data: InventoryOverview;
        }>(
            '/api/inventory/overview',
        );

    return response.data;
}

/**
 * Load warehouse locations by lifecycle state.
 */
export async function fetchWarehouses(
    status:
        WarehouseStatus =
            'active',
): Promise<Warehouse[]> {
    const response =
        await apiRequest<{
            data: Warehouse[];
        }>(
            `/api/warehouses?status=${encodeURIComponent(status)}`,
        );

    return response.data;
}

/**
 * Load physical Products as viewed from one warehouse.
 */
export async function fetchWarehouseInventoryProducts(
    warehouseId: number,
    search = '',
): Promise<WarehouseInventoryProducts> {
    const query =
        new URLSearchParams();

    if (
        search.trim() !==
        ''
    ) {
        query.set(
            'search',
            search.trim(),
        );
    }

    const suffix =
        query.toString();

    const response =
        await apiRequest<{
            data: WarehouseInventoryProducts;
        }>(
            `/api/warehouses/${warehouseId}/inventory-products${
                suffix
                    ? `?${suffix}`
                    : ''
            }`,
        );

    return response.data;
}

/**
 * Load one Product's complete Inventory read model.
 */
export async function fetchInventoryProduct(
    productId: number,
): Promise<InventoryProductDetail> {
    const response =
        await apiRequest<{
            data: InventoryProductDetail;
        }>(
            `/api/inventory/products/${productId}`,
        );

    return response.data;
}

/**
 * Update inventory tracking settings for one Product.
 */
export async function updateInventorySettings(
    productId: number,
    payload: InventorySettingsPayload,
): Promise<InventoryProductDetail> {
    const response =
        await apiRequest<{
            data: InventoryProductDetail;
        }>(
            `/api/inventory/products/${productId}/settings`,
            {
                method:
                    'PATCH',

                body:
                    JSON.stringify(
                        payload,
                    ),
            },
        );

    return response.data;
}

/**
 * Record opening stock for one Product.
 */
export async function recordOpeningStock(
    productId: number,
    payload: OpeningStockPayload,
): Promise<InventoryProductDetail> {
    const response =
        await apiRequest<{
            data: InventoryProductDetail;
        }>(
            `/api/inventory/products/${productId}/opening-stock`,
            {
                method:
                    'POST',

                body:
                    JSON.stringify(
                        payload,
                    ),
            },
        );

    return response.data;
}

/**
 * Apply one signed stock correction.
 */
export async function adjustInventoryStock(
    productId: number,
    payload: StockAdjustmentPayload,
): Promise<InventoryProductDetail> {
    const response =
        await apiRequest<{
            data: InventoryProductDetail;
        }>(
            `/api/inventory/products/${productId}/adjust`,
            {
                method:
                    'POST',

                body:
                    JSON.stringify(
                        payload,
                    ),
            },
        );

    return response.data;
}

/**
 * Transfer Product stock between active warehouses.
 */
export async function transferInventoryStock(
    productId: number,
    payload: StockTransferPayload,
): Promise<InventoryProductDetail> {
    const response =
        await apiRequest<{
            data: InventoryProductDetail;
        }>(
            `/api/inventory/products/${productId}/transfer`,
            {
                method:
                    'POST',

                body:
                    JSON.stringify(
                        payload,
                    ),
            },
        );

    return response.data;
}

/**
 * Create one warehouse.
 */
export async function createWarehouse(
    payload: WarehousePayload,
): Promise<Warehouse> {
    const response =
        await apiRequest<{
            data: Warehouse;
        }>(
            '/api/warehouses',
            {
                method:
                    'POST',

                body:
                    JSON.stringify(
                        payload,
                    ),
            },
        );

    return response.data;
}

/**
 * Rename one active warehouse.
 */
export async function updateWarehouse(
    warehouseId: number,
    payload: WarehousePayload,
): Promise<Warehouse> {
    const response =
        await apiRequest<{
            data: Warehouse;
        }>(
            `/api/warehouses/${warehouseId}`,
            {
                method:
                    'PATCH',

                body:
                    JSON.stringify(
                        payload,
                    ),
            },
        );

    return response.data;
}

/**
 * Promote one existing active warehouse to workspace default.
 */
export async function setDefaultWarehouse(
    warehouseId: number,
): Promise<Warehouse> {
    const response =
        await apiRequest<{
            data: Warehouse;
        }>(
            `/api/warehouses/${warehouseId}/default`,
            {
                method:
                    'POST',
            },
        );

    return response.data;
}

/**
 * Archive one active warehouse.
 */
export async function archiveWarehouse(
    warehouseId: number,
): Promise<void> {
    await apiRequest<void>(
        `/api/warehouses/${warehouseId}`,
        {
            method:
                'DELETE',
        },
    );
}

/**
 * Restore one archived warehouse.
 */
export async function restoreWarehouse(
    warehouseId: number,
): Promise<Warehouse> {
    const response =
        await apiRequest<{
            data: Warehouse;
        }>(
            `/api/warehouses/${warehouseId}/restore`,
            {
                method:
                    'POST',
            },
        );

    return response.data;
}

/**
 * Permanently remove one archived warehouse after server-side safety checks.
 */
export async function permanentlyDeleteWarehouse(
    warehouseId: number,
): Promise<void> {
    await apiRequest<void>(
        `/api/warehouses/${warehouseId}/permanent`,
        {
            method:
                'DELETE',
        },
    );
}