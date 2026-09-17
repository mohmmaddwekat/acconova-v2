<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductionRunOutput extends Model
{
    use BelongsToOrganization;

    protected $guarded = [
        'id',
        'organization_id',
    ];

    /**
     * Cast production quantities and immutable suggestion snapshots.
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
            'reversed_at' => 'datetime',
        ];
    }

    /**
     * Return the parent Production Run.
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
     * Return the warehouse where finished stock was received.
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
     * Return the optional Recipe used to suggest material consumption.
     *
     * The Recipe is not authoritative for Inventory quantities.
     */
    public function recipe(): BelongsTo
    {
        return $this->belongsTo(
            ProductionRecipe::class,
            'production_recipe_id',
        );
    }

    /**
     * Return the actual Raw Material rows entered for this Product output.
     */
    public function materials(): HasMany
    {
        return $this
            ->hasMany(
                ProductionRunMaterial::class,
                'production_run_output_id',
            )
            ->orderBy(
                'line_number',
            );
    }

    /**
     * Return the positive ProductionIn movement created at Posting time.
     */
    public function postedMovement(): BelongsTo
    {
        return $this->belongsTo(
            StockMovement::class,
            'posted_movement_id',
        );
    }

    /**
     * Return the user who reversed this individual output.
     */
    public function reversedBy(): BelongsTo
    {
        return $this->belongsTo(
            User::class,
            'reversed_by',
        );
    }

    /**
     * Determine whether this Product output has already been reversed.
     */
    public function isReversed(): bool
    {
        return $this->reversed_at !==
            null;
    }
}
