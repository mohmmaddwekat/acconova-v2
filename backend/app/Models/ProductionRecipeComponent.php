<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductionRecipeComponent extends Model
{
    use BelongsToOrganization;

    protected $guarded = [
        'id',
        'organization_id',
    ];

    /**
     * Return the immutable recipe version owning this component.
     */
    public function recipe(): BelongsTo
    {
        return $this->belongsTo(
            ProductionRecipe::class,
            'production_recipe_id',
        );
    }

    /**
     * Return alternative raw materials for this logical component.
     */
    public function options(): HasMany
    {
        return $this
            ->hasMany(
                ProductionRecipeOption::class,
            )
            ->orderBy(
                'position',
            );
    }
}
