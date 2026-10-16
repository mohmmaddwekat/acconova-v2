<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class SupplierPaymentPlanItem extends Model
{
    use BelongsToOrganization;

    protected $guarded = ['id', 'organization_id'];

    protected function casts(): array
    {
        return [
            'pay_on' => 'date',
            'due_date' => 'date',
            'amount' => 'decimal:4',
            'depends_on_expected' => 'boolean',
            'detail' => 'array',
        ];
    }
}
