<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductionRecipe extends Model
{
    use BelongsToOrganization;

    protected $guarded = [
        'id',
        'organization_id',
    ];

    /**
     * Cast recipe lifecycle values.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'version' => 'integer',

            'is_active' => 'boolean',
        ];
    }

    /**
     * Return the finished Product this recipe manufactures.
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(
            Product::class,
        );
    }

    /**
     * Return ordered logical material components.
     */
    public function components(): HasMany
    {
        return $this
            ->hasMany(
                ProductionRecipeComponent::class,
            )
            ->orderBy(
                'position',
            );
    }

    /**
     * Return production batches that permanently reference this version.
     */
    public function usages(): HasMany
    {
        return $this->hasMany(
            ProductionRecipeUsage::class,
        );
    }
}
