<?php

namespace App\Models;

use App\Enums\StockMovementType;
use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockMovement extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'warehouse_id',
        'product_id',
        'created_by',
        'type',
        'quantity',
        'balance_after',
        'transfer_group_uuid',
        'reference_type',
        'reference_id',
        'note',
    ];

    /**
     * Cast inventory movement values into stable domain representations.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => StockMovementType::class,

            'quantity' => 'decimal:4',

            'balance_after' => 'decimal:4',
        ];
    }

    /**
     * Return the warehouse affected by this movement, including archived
     * warehouses so historical stock activity always remains readable.
     */
    public function warehouse(): BelongsTo
    {
        return $this
            ->belongsTo(
                Warehouse::class,
            )
            ->withTrashed();
    }

    /**
     * Return the Product affected by this movement, including archived
     * Products for historical reporting.
     */
    public function product(): BelongsTo
    {
        return $this
            ->belongsTo(
                Product::class,
            )
            ->withTrashed();
    }

    /**
     * Return the team member who caused this movement when still available.
     */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(
            User::class,
            'created_by',
        );
    }
}
