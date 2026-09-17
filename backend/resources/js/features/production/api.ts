import type {
    ProductionPreview,
    ProductionRecipeResponse,
    ProductionRun,
    ProductionRunIndexResponse,
    ProductionRunPayload,
    ProductionRunStatus,
} from '@/features/production/types';
import {
    apiRequest,
} from '@/lib/http';

/**
 * Load searchable Production Run history.
 */
export async function fetchProductionRuns(
    filters: {
        search?: string;

        status?:
            | ProductionRunStatus
            | '';

        page?: number;
    } = {},
): Promise<ProductionRunIndexResponse> {
    const query =
        new URLSearchParams();

    if (filters.search?.trim()) {
        query.set(
            'search',
            filters.search.trim(),
        );
    }

    if (filters.status) {
        query.set(
            'status',
            filters.status,
        );
    }

    query.set(
        'page',
        String(
            filters.page ?? 1,
        ),
    );

    query.set(
        'per_page',
        '25',
    );

    return apiRequest<ProductionRunIndexResponse>(
        `/api/production-runs?${query.toString()}`,
    );
}

/**
 * Load one Production Run with complete output and material history.
 */
export async function fetchProductionRun(
    runId: number,
): Promise<ProductionRun> {
    const response =
        await apiRequest<{
            data: ProductionRun;
        }>(
            `/api/production-runs/${runId}`,
        );

    return response.data;
}

/**
 * Create one editable Production Draft.
 */
export async function createProductionRun(
    payload: ProductionRunPayload,
): Promise<ProductionRun> {
    const response =
        await apiRequest<{
            data: ProductionRun;
        }>(
            '/api/production-runs',
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
 * Replace the complete content of one Production Draft.
 */
export async function updateProductionRun(
    runId: number,
    revision: number,
    payload: ProductionRunPayload,
): Promise<ProductionRun> {
    const response =
        await apiRequest<{
            data: ProductionRun;
        }>(
            `/api/production-runs/${runId}`,
            {
                method:
                    'PATCH',

                body:
                    JSON.stringify({
                        ...payload,

                        expected_revision:
                            revision,
                    }),
            },
        );

    return response.data;
}

/**
 * Load stock availability and Recipe-vs-Actual comparison.
 */
export async function previewProductionRun(
    runId: number,
): Promise<ProductionPreview> {
    const response =
        await apiRequest<{
            data: ProductionPreview;
        }>(
            `/api/production-runs/${runId}/preview`,
        );

    return response.data;
}

/**
 * Commit Actual Consumption and finished outputs to Inventory.
 */
export async function postProductionRun(
    runId: number,
    revision: number,
): Promise<ProductionRun> {
    const response =
        await apiRequest<{
            data: ProductionRun;
        }>(
            `/api/production-runs/${runId}/post`,
            {
                method:
                    'POST',

                body:
                    JSON.stringify({
                        expected_revision:
                            revision,
                    }),
            },
        );

    return response.data;
}

/**
 * Reverse all remaining outputs in one Production Run.
 */
export async function reverseProductionRun(
    runId: number,
    revision: number,
    reason: string,
): Promise<ProductionRun> {
    const response =
        await apiRequest<{
            data: ProductionRun;
        }>(
            `/api/production-runs/${runId}/reverse`,
            {
                method:
                    'POST',

                body:
                    JSON.stringify({
                        expected_revision:
                            revision,

                        reason,
                    }),
            },
        );

    return response.data;
}

/**
 * Reverse one Product output without touching the other outputs.
 */
export async function reverseProductionOutput(
    runId: number,
    outputId: number,
    revision: number,
    reason: string,
): Promise<ProductionRun> {
    const response =
        await apiRequest<{
            data: ProductionRun;
        }>(
            `/api/production-runs/${runId}/outputs/${outputId}/reverse`,
            {
                method:
                    'POST',

                body:
                    JSON.stringify({
                        expected_revision:
                            revision,

                        reason,
                    }),
            },
        );

    return response.data;
}

/**
 * Load the currently active optional Recipe for one finished Product.
 */
export async function fetchProductionRecipe(
    productId: number,
): Promise<ProductionRecipeResponse> {
    return apiRequest<ProductionRecipeResponse>(
        `/api/products/${productId}/production-recipe`,
    );
}