<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductionRunMaterial extends Model
{
    use BelongsToOrganization;

    protected $guarded = [
        'id',
        'organization_id',
    ];

    /**
     * Cast actual physical consumption.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'line_number' => 'integer',
            'actual_quantity' => 'decimal:4',
        ];
    }

    /**
     * Return the finished-product output that consumed this material.
     */
    public function output(): BelongsTo
    {
        return $this->belongsTo(
            ProductionRunOutput::class,
            'production_run_output_id',
        );
    }

    /**
     * Return the actual Raw Material consumed, including archived history.
     */
    public function rawMaterial(): BelongsTo
    {
        return $this
            ->belongsTo(
                Product::class,
                'raw_material_id',
            )
            ->withTrashed();
    }

    /**
     * Return the warehouse the Raw Material was physically consumed from.
     */
    public function warehouse(): BelongsTo
    {
        return $this
            ->belongsTo(
                Warehouse::class,
            )
            ->withTrashed();
    }
}
