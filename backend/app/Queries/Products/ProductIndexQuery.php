<?php

namespace App\Queries\Products;

use App\Models\Product;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class ProductIndexQuery
{
    /**
     * Build the shared catalog query used by index pages and exports.
     *
     * @param  array<string, mixed>  $filters
     */
    public function query(
        array $filters,
    ): Builder {
        $query =
            Product::query()->withSum('inventoryBalances as stock_on_hand', 'on_hand')->withSum('inventoryBalances as stock_reserved', 'reserved');

        $this->applyLifecycle(
            $query,
            $filters,
        );

        $this->applySearch(
            $query,
            $filters,
        );

        $this->applyType(
            $query,
            $filters,
        );

        $this->applyQuality(
            $query,
            $filters,
        );

        $this->applySort(
            $query,
            $filters,
        );

        return $query;
    }

    /**
     * Return one paginated catalog page.
     *
     * @param  array<string, mixed>  $filters
     */
    public function execute(
        array $filters,
    ): LengthAwarePaginator {
        return $this
            ->query(
                $filters,
            )
            ->paginate(
                perPage: (int) (
                    $filters[
                        'per_page'
                    ] ?? 25
                ),
            );
    }

    /**
     * Return all matching records for full-dataset exports.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, Product>
     */
    public function all(
        array $filters,
    ): Collection {
        return $this
            ->query(
                $filters,
            )
            ->get();
    }

    /**
     * Apply active or archived lifecycle visibility.
     *
     * @param  array<string, mixed>  $filters
     */
    private function applyLifecycle(
        Builder $query,
        array $filters,
    ): void {
        if (
            (
                $filters['status'] ??
                'active'
            ) === 'deleted'
        ) {
            $query->onlyTrashed();
        }
    }

    /**
     * Apply tokenized catalog search across useful identity fields.
     *
     * @param  array<string, mixed>  $filters
     */
    private function applySearch(
        Builder $query,
        array $filters,
    ): void {
        if (
            empty(
                $filters['search']
            )
        ) {
            return;
        }

        $terms =
            preg_split(
                '/\s+/u',
                Str::squish(
                    (string) $filters[
                        'search'
                    ],
                ),
                -1,
                PREG_SPLIT_NO_EMPTY,
            ) ?: [];

        foreach (
            $terms as $term
        ) {
            $query->where(
                /**
                 * One search token may match any searchable catalog field.
                 */
                function (
                    Builder $query,
                ) use (
                    $term,
                ): void {
                    $pattern =
                        "%{$term}%";

                    $query
                        ->where(
                            'name',
                            'like',
                            $pattern,
                        )
                        ->orWhere(
                            'sku',
                            'like',
                            $pattern,
                        )
                        ->orWhere(
                            'description',
                            'like',
                            $pattern,
                        )
                        ->orWhere(
                            'unit',
                            'like',
                            $pattern,
                        );
                },
            );
        }
    }

    /**
     * Apply Product or Service filtering.
     *
     * @param  array<string, mixed>  $filters
     */
    private function applyType(
        Builder $query,
        array $filters,
    ): void {
        if (
            empty(
                $filters['type']
            )
        ) {
            return;
        }

        $query->where(
            'type',
            $filters['type'],
        );
    }

    /**
     * Surface catalog data that may need attention before invoices are built.
     *
     * @param  array<string, mixed>  $filters
     */
    private function applyQuality(
        Builder $query,
        array $filters,
    ): void {
        $quality =
            $filters['quality'] ??
            null;

        match ($quality) {
            'missing_sku' => $query->where(
                /**
                 * Treat both null and empty SKU values as missing.
                 */
                fn (
                    Builder $query,
                ): Builder => $query
                    ->whereNull(
                        'sku',
                    )
                    ->orWhere(
                        'sku',
                        '',
                    ),
            ),

            'zero_price' => $query->where(
                'unit_price',
                '<=',
                0,
            ),

            'missing_cost' => $query->whereNull(
                'cost_price',
            ),

            default => null,
        };
    }

    /**
     * Apply a portable deterministic catalog ordering.
     *
     * @param  array<string, mixed>  $filters
     */
    private function applySort(
        Builder $query,
        array $filters,
    ): void {
        match (
            $filters['sort'] ??
            'name_asc'
        ) {
            'name_desc' => $query
                ->orderByDesc(
                    'name',
                )
                ->orderByDesc(
                    'id',
                ),

            'price_low' => $query
                ->orderBy(
                    'unit_price',
                )
                ->orderBy(
                    'name',
                ),

            'price_high' => $query
                ->orderByDesc(
                    'unit_price',
                )
                ->orderBy(
                    'name',
                ),

            'newest' => $query
                ->orderByDesc(
                    'created_at',
                )
                ->orderByDesc(
                    'id',
                ),

            'oldest' => $query
                ->orderBy(
                    'created_at',
                )
                ->orderBy(
                    'id',
                ),

            default => $query
                ->orderBy(
                    'name',
                )
                ->orderBy(
                    'id',
                ),
        };
    }
}
