<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductionRecipeUsage extends Model
{
    use BelongsToOrganization;

    protected $guarded = [
        'id',
        'organization_id',
    ];

    /**
     * Cast the historical production recipe snapshot.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'snapshot' => 'array',
        ];
    }

    /**
     * Return the immutable recipe version used for this batch.
     */
    public function recipe(): BelongsTo
    {
        return $this->belongsTo(
            ProductionRecipe::class,
            'production_recipe_id',
        );
    }

    /**
     * Return the ProductionIn movement identifying the batch.
     */
    public function productionMovement(): BelongsTo
    {
        return $this->belongsTo(
            StockMovement::class,
            'production_movement_id',
        );
    }
}
