<?php

namespace App\Queries\Parties;

use App\Models\Party;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class PartyIndexQuery
{
    /**
     * Build the shared tenant-scoped Party query used by index screens,
     * printing, spreadsheets, and PDFs.
     *
     * @param  array<string, mixed>  $filters
     */
    public function query(
        array $filters,
    ): Builder {
        $query = Party::query()
            ->with('roles');

        $this->applyLifecycle(
            $query,
            $filters,
        );

        $this->applySearch(
            $query,
            $filters,
        );

        $this->applyEntityType(
            $query,
            $filters,
        );

        $this->applyRole(
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
     * Return one paginated Party page for the interactive index.
     *
     * @param  array<string, mixed>  $filters
     */
    public function execute(
        array $filters,
    ): LengthAwarePaginator {
        return $this->query(
            $filters,
        )->paginate(
            perPage: (int) (
                $filters['per_page']
                ?? 25
            ),
        );
    }

    /**
     * Return every matching Party without pagination.
     *
     * Exports intentionally use this method so Excel, PDF, and Print always
     * contain the complete filtered dataset rather than the current page.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, Party>
     */
    public function all(
        array $filters,
    ): Collection {
        return $this->query(
            $filters,
        )->get();
    }

    /**
     * Apply active, archived, or all-record lifecycle visibility.
     *
     * @param  array<string, mixed>  $filters
     */
    private function applyLifecycle(
        Builder $query,
        array $filters,
    ): void {
        $status =
            $filters['status']
            ?? 'active';

        if (
            $status === 'deleted'
        ) {
            $query->onlyTrashed();

            return;
        }

        if (
            $status === 'all'
        ) {
            $query->withTrashed();
        }
    }

    /**
     * Apply tokenized multi-field search.
     *
     * Every entered search word must match at least one searchable field,
     * allowing searches such as "ahmad nablus" or "acme supplier@email.com".
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

        $search = Str::squish(
            (string) $filters['search'],
        );

        $terms = preg_split(
            '/\s+/u',
            $search,
            -1,
            PREG_SPLIT_NO_EMPTY,
        ) ?: [];

        foreach (
            $terms as $term
        ) {
            $query->where(
                /**
                 * Each search token may match any useful Party identity or
                 * contact field while all tokens remain required overall.
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
                            'company_name',
                            'like',
                            $pattern,
                        )
                        ->orWhere(
                            'email',
                            'like',
                            $pattern,
                        )
                        ->orWhere(
                            'phone',
                            'like',
                            $pattern,
                        )
                        ->orWhere(
                            'tax_number',
                            'like',
                            $pattern,
                        )
                        ->orWhere(
                            'city',
                            'like',
                            $pattern,
                        )
                        ->orWhere(
                            'state',
                            'like',
                            $pattern,
                        )
                        ->orWhere(
                            'country_code',
                            'like',
                            $pattern,
                        );
                },
            );
        }
    }

    /**
     * Apply person/company filtering.
     *
     * @param  array<string, mixed>  $filters
     */
    private function applyEntityType(
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
     * Apply customer/supplier relationship filtering.
     *
     * @param  array<string, mixed>  $filters
     */
    private function applyRole(
        Builder $query,
        array $filters,
    ): void {
        if (
            empty(
                $filters['role']
            )
        ) {
            return;
        }

        $query->whereHas(
            'roles',
            /**
             * Match the requested business relationship role.
             */
            function (
                Builder $query,
            ) use (
                $filters,
            ): void {
                $query->where(
                    'role',
                    $filters['role'],
                );
            },
        );
    }

    /**
     * Apply a portable deterministic Party ordering.
     *
     * @param  array<string, mixed>  $filters
     */
    private function applySort(
        Builder $query,
        array $filters,
    ): void {
        $sort =
            $filters['sort']
            ?? 'name_asc';

        match ($sort) {
            'name_desc' => $query
                ->orderByRaw(
                    'COALESCE(company_name, name) DESC',
                )
                ->orderByDesc('id'),

            'newest' => $query
                ->orderByDesc(
                    'created_at',
                )
                ->orderByDesc('id'),

            'oldest' => $query
                ->orderBy(
                    'created_at',
                )
                ->orderBy('id'),

            default => $query
                ->orderByRaw(
                    'COALESCE(company_name, name) ASC',
                )
                ->orderBy('id'),
        };
    }
}
