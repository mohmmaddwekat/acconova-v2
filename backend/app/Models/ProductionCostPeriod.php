<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductionCostPeriod extends Model
{
    use BelongsToOrganization;

    protected $guarded = ['id', 'organization_id'];

    protected function casts(): array
    {
        return [
            'period' => 'date',
            'quantity_produced' => 'decimal:4',
            'material_unit_cost' => 'decimal:4',
            'overhead_unit_cost' => 'decimal:4',
            'unit_cost' => 'decimal:4',
            'wages_pool' => 'decimal:4',
            'expenses_pool' => 'decimal:4',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
