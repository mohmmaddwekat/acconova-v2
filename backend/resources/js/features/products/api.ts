import type {
    Product,
    ProductIndexResponse,
    ProductType,
} from '@/features/products/types';
import {
    apiRequest,
} from '@/lib/http';

export type ProductLifecycle =
    | 'active'
    | 'deleted';

export type ProductSort =
    | 'name_asc'
    | 'name_desc'
    | 'price_low'
    | 'price_high'
    | 'newest'
    | 'oldest';

export type ProductQuality =
    | 'missing_sku'
    | 'zero_price'
    | 'missing_cost';

export type ProductFilters = {
    search?: string;

    type?: ProductType;

    status?: ProductLifecycle;

    quality?: ProductQuality;

    sort?: ProductSort;

    page?: number;

    perPage?: number;
};

export type ProductPayload = {
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
};

/**
 * Build Product index query parameters.
 */
export function buildProductQuery(
    filters: ProductFilters,
    includePagination = true,
): string {
    const query =
        new URLSearchParams();

    if (
        filters.search?.trim()
    ) {
        query.set(
            'search',
            filters.search.trim(),
        );
    }

    if (filters.type) {
        query.set(
            'type',
            filters.type,
        );
    }

    if (filters.quality) {
        query.set(
            'quality',
            filters.quality,
        );
    }

    query.set(
        'status',
        filters.status ??
            'active',
    );

    query.set(
        'sort',
        filters.sort ??
            'name_asc',
    );

    if (includePagination) {
        query.set(
            'page',
            String(
                filters.page ??
                    1,
            ),
        );

        query.set(
            'per_page',
            String(
                filters.perPage ??
                    25,
            ),
        );
    }

    return query.toString();
}

/**
 * Load one server-side catalog page.
 */
export async function fetchProducts(
    filters: ProductFilters = {},
): Promise<ProductIndexResponse> {
    return apiRequest<ProductIndexResponse>(
        `/api/products?${buildProductQuery(filters)}`,
    );
}

/**
 * Create one Product or Service.
 */
export async function createProduct(
    payload: ProductPayload,
): Promise<Product> {
    const response =
        await apiRequest<{
            data: Product;
        }>(
            '/api/products',
            {
                method: 'POST',

                body:
                    JSON.stringify(
                        payload,
                    ),
            },
        );

    return response.data;
}

/**
 * Update one active catalog item.
 */
export async function updateProduct(
    productId: number,
    payload: ProductPayload,
): Promise<Product> {
    const response =
        await apiRequest<{
            data: Product;
        }>(
            `/api/products/${productId}`,
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
 * Archive one catalog item.
 */
export async function archiveProduct(
    productId: number,
): Promise<void> {
    await apiRequest<void>(
        `/api/products/${productId}`,
        {
            method:
                'DELETE',
        },
    );
}

/**
 * Restore one archived catalog item.
 */
export async function restoreProduct(
    productId: number,
): Promise<Product> {
    const response =
        await apiRequest<{
            data: Product;
        }>(
            `/api/products/${productId}/restore`,
            {
                method:
                    'POST',
            },
        );

    return response.data;
}