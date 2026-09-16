<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryBalance extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'warehouse_id',
        'product_id',
        'on_hand',
        'reserved',
    ];

    /**
     * Preserve stock quantities as decimal strings.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'on_hand' => 'decimal:4',

            'reserved' => 'decimal:4',
        ];
    }

    /**
     * Return the warehouse holding this balance.
     */
    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(
            Warehouse::class,
        )->withTrashed();
    }

    /**
     * Return the Product represented by this balance.
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(
            Product::class,
        )->withTrashed();
    }
}
