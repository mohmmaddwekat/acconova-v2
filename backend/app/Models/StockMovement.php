<?php

namespace App\Models;

use App\Enums\StockMovementType;
use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
        'production_run_output_id',
        'production_run_material_id',
        'reversal_of_movement_id',
        'note',
    ];

    /**
     * Cast Inventory movement values.
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
     * Return the affected warehouse including archived history.
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
     * Return the affected Product including archived history.
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
     * Return the user who caused this movement.
     */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(
            User::class,
            'created_by',
        );
    }

    /**
     * Return the Production output that caused this movement.
     */
    public function productionRunOutput(): BelongsTo
    {
        return $this->belongsTo(
            ProductionRunOutput::class,
            'production_run_output_id',
        );
    }

    /**
     * Return the exact actual-consumption line for ProductionOut movements.
     */
    public function productionRunMaterial(): BelongsTo
    {
        return $this->belongsTo(
            ProductionRunMaterial::class,
            'production_run_material_id',
        );
    }

    /**
     * Return the original movement compensated by this row.
     */
    public function reversalOf(): BelongsTo
    {
        return $this->belongsTo(
            self::class,
            'reversal_of_movement_id',
        );
    }

    /**
     * Return compensating movement rows.
     */
    public function reversals(): HasMany
    {
        return $this->hasMany(
            self::class,
            'reversal_of_movement_id',
        );
    }
}
