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
     * Build the shared tenant-scoped Party query used by indexes and exports.
     *
     * @param  array<string, mixed>  $filters
     */
    public function query(
        array $filters,
    ): Builder {
        $query =
            Party::query()
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

        $this->applyContactQuality(
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
     * Return one paginated Party page.
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
     * Return every matching Party without pagination for exports.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, Party>
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
     * Apply active, archived, or all-record lifecycle visibility.
     *
     * @param  array<string, mixed>  $filters
     */
    private function applyLifecycle(
        Builder $query,
        array $filters,
    ): void {
        $status =
            $filters['status'] ??
            'active';

        if (
            $status ===
            'deleted'
        ) {
            $query->onlyTrashed();

            return;
        }

        if (
            $status ===
            'all'
        ) {
            $query->withTrashed();
        }
    }

    /**
     * Apply tokenized multi-field search.
     *
     * Each entered word must match at least one searchable Party field.
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

        $search =
            Str::squish(
                (string) $filters[
                    'search'
                ],
            );

        $terms =
            preg_split(
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
                 * One token may match any useful Party identity or contact
                 * field while all tokens remain required overall.
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
             * Match one requested business relationship role.
             */
            function (
                Builder $query,
            ) use (
                $filters,
            ): void {
                $query->where(
                    'role',
                    $filters['role']
                );
            },
        );
    }

    /**
     * Filter records by contact-data completeness.
     *
     * @param  array<string, mixed>  $filters
     */
    private function applyContactQuality(
        Builder $query,
        array $filters,
    ): void {
        $contact =
            $filters['contact'] ??
            null;

        if (
            $contact ===
            null
        ) {
            return;
        }

        if (
            $contact ===
            'missing_email'
        ) {
            $query->where(
                /**
                 * Treat both null and empty email values as missing.
                 */
                fn (
                    Builder $query,
                ): Builder => $query
                    ->whereNull(
                        'email',
                    )
                    ->orWhere(
                        'email',
                        '',
                    ),
            );

            return;
        }

        if (
            $contact ===
            'missing_phone'
        ) {
            $query->where(
                /**
                 * Treat both null and empty phone values as missing.
                 */
                fn (
                    Builder $query,
                ): Builder => $query
                    ->whereNull(
                        'phone',
                    )
                    ->orWhere(
                        'phone',
                        '',
                    ),
            );

            return;
        }

        if (
            $contact ===
            'missing_both'
        ) {
            $query
                ->where(
                    /**
                     * Require email to be missing.
                     */
                    fn (
                        Builder $query,
                    ): Builder => $query
                        ->whereNull(
                            'email',
                        )
                        ->orWhere(
                            'email',
                            '',
                        ),
                )
                ->where(
                    /**
                     * Require phone to be missing.
                     */
                    fn (
                        Builder $query,
                    ): Builder => $query
                        ->whereNull(
                            'phone',
                        )
                        ->orWhere(
                            'phone',
                            '',
                        ),
                );

            return;
        }

        if (
            $contact ===
            'complete'
        ) {
            $query
                ->whereNotNull(
                    'email',
                )
                ->where(
                    'email',
                    '<>',
                    '',
                )
                ->whereNotNull(
                    'phone',
                )
                ->where(
                    'phone',
                    '<>',
                    '',
                );
        }
    }

    /**
     * Apply a deterministic portable Party ordering.
     *
     * @param  array<string, mixed>  $filters
     */
    private function applySort(
        Builder $query,
        array $filters,
    ): void {
        $sort =
            $filters['sort'] ??
            'name_asc';

        match ($sort) {
            'name_desc' => $query
                ->orderByRaw(
                    'COALESCE(company_name, name) DESC',
                )
                ->orderByDesc(
                    'id',
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
                ->orderByRaw(
                    'COALESCE(company_name, name) ASC',
                )
                ->orderBy(
                    'id',
                ),
        };
    }
}
