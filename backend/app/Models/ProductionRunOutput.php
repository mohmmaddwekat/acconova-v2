<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductionRunOutput extends Model
{
    use BelongsToOrganization;

    protected $guarded = [
        'id',
        'organization_id',
    ];

    /**
     * Cast production quantities and historical snapshots.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'line_number' => 'integer',

            'quantity' => 'decimal:4',

            'selections' => 'array',

            'material_sources' => 'array',

            'recipe_snapshot' => 'array',
        ];
    }

    /**
     * Return the parent production run.
     */
    public function run(): BelongsTo
    {
        return $this->belongsTo(
            ProductionRun::class,
            'production_run_id',
        );
    }

    /**
     * Return the finished Product, including archived historical Products.
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
     * Return the output warehouse, including archived historical warehouses.
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
     * Return the immutable recipe version selected by this output.
     */
    public function recipe(): BelongsTo
    {
        return $this->belongsTo(
            ProductionRecipe::class,
            'production_recipe_id',
        );
    }

    /**
     * Return the positive Inventory movement produced during Posting.
     */
    public function postedMovement(): BelongsTo
    {
        return $this->belongsTo(
            StockMovement::class,
            'posted_movement_id',
        );
    }
}
