<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Warehouse extends Model
{
    use BelongsToOrganization;
    use SoftDeletes;

    protected $fillable = [
        'code',
        'name',
        'is_default',
    ];

    /**
     * Cast warehouse lifecycle values into stable domain values.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
        ];
    }

    /**
     * Return current Product balances stored in this warehouse.
     */
    public function balances(): HasMany
    {
        return $this->hasMany(
            InventoryBalance::class,
        );
    }

    /**
     * Return the warehouse stock audit trail.
     */
    public function stockMovements(): HasMany
    {
        return $this->hasMany(
            StockMovement::class,
        );
    }

    /**
     * Restrict a warehouse query to the designated default location.
     */
    public function scopeDefault(
        Builder $query,
    ): Builder {
        return $query->where(
            'is_default',
            true,
        );
    }
}
