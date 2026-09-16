import type {
    InventoryOverview,
    Warehouse,
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