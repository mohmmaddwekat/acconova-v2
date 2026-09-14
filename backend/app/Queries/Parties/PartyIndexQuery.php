<?php

namespace App\Queries\Parties;

use App\Models\Party;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Pagination\LengthAwarePaginator;

class PartyIndexQuery
{
    /**
     * Build and paginate the current tenant's Party list using validated
     * search, type, role, and archive filters.
     *
     * @param  array<string, mixed>  $filters
     */
    public function execute(array $filters): LengthAwarePaginator
    {
        $query = Party::query()
            ->with('roles');

        $status = $filters['status'] ?? 'active';

        if ($status === 'deleted') {
            $query->onlyTrashed();
        } elseif ($status === 'all') {
            $query->withTrashed();
        }

        if (! empty($filters['search'])) {
            $search = (string) $filters['search'];

            $query->where(
                function (Builder $query) use ($search): void {
                    $query
                        ->where('name', 'like', "%{$search}%")
                        ->orWhere(
                            'company_name',
                            'like',
                            "%{$search}%",
                        )
                        ->orWhere(
                            'email',
                            'like',
                            "%{$search}%",
                        )
                        ->orWhere(
                            'phone',
                            'like',
                            "%{$search}%",
                        )
                        ->orWhere(
                            'tax_number',
                            'like',
                            "%{$search}%",
                        );
                },
            );
        }

        if (! empty($filters['type'])) {
            $query->where(
                'type',
                $filters['type'],
            );
        }

        if (! empty($filters['role'])) {
            $query->whereHas(
                'roles',
                function (Builder $query) use ($filters): void {
                    $query->where(
                        'role',
                        $filters['role'],
                    );
                },
            );
        }

        return $query
            ->orderBy('id')
            ->paginate(
                perPage: (int) ($filters['per_page'] ?? 25),
            );
    }
}
