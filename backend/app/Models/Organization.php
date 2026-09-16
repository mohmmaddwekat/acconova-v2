<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Organization extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name',
    ];

    /**
     * Return users that belong to this organization.
     */
    public function users(): BelongsToMany
    {
        return $this
            ->belongsToMany(
                User::class,
                'memberships',
            )
            ->withPivot(
                'role',
            )
            ->withTimestamps();
    }

    /**
     * Return the organization's access memberships.
     *
     * The explicit organization_id relation safely anchors this query, so it
     * does not require an already-selected active tenant.
     */
    public function memberships(): HasMany
    {
        $relation =
            $this->hasMany(
                Membership::class,
            );

        $relation
            ->getQuery()
            ->withoutGlobalScope(
                'organization',
            );

        return $relation;
    }

    /**
     * Return tenant-scoped business relationships.
     */
    public function parties(): HasMany
    {
        return $this->hasMany(
            Party::class,
        );
    }

    /**
     * Return tenant-scoped Products and Services.
     */
    public function products(): HasMany
    {
        return $this->hasMany(
            Product::class,
        );
    }

    /**
     * Return the organization's physical inventory locations.
     */
    public function warehouses(): HasMany
    {
        return $this->hasMany(
            Warehouse::class,
        );
    }
}
