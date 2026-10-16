<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A proposed payment plan. Approving it records the merchant's decision only:
 * nothing is transferred and no payment is recorded from it.
 */
class SupplierPaymentPlan extends Model
{
    use BelongsToOrganization;

    protected $guarded = ['id', 'organization_id'];

    protected function casts(): array
    {
        return [
            'as_of' => 'date',
            'payload' => 'array',
            'approved_at' => 'datetime',
            'planned_total' => 'decimal:4',
            'unfunded_total' => 'decimal:4',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(SupplierPaymentPlanItem::class)->orderBy('pay_on')->orderBy('id');
    }
}
