<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductionRecipeOption extends Model
{
    use BelongsToOrganization;

    protected $guarded = [
        'id',
        'organization_id',
    ];

    /**
     * Cast high-precision Recipe consumption and default selection.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'quantity_per_unit' => 'decimal:8',

            'is_default' => 'boolean',
        ];
    }

    /**
     * Return the logical component this alternative satisfies.
     */
    public function component(): BelongsTo
    {
        return $this->belongsTo(
            ProductionRecipeComponent::class,
            'production_recipe_component_id',
        );
    }

    /**
     * Return the Raw Material used by this alternative.
     */
    public function rawMaterial(): BelongsTo
    {
        return $this->belongsTo(
            Product::class,
            'raw_material_id',
        );
    }
}
