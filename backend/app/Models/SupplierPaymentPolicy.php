<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/**
 * The workspace's rules for proposing supplier payments. One row per workspace.
 */
class SupplierPaymentPolicy extends Model
{
    use BelongsToOrganization;

    public const PRIORITIES = ['critical' => 4, 'high' => 3, 'normal' => 2, 'low' => 1];

    protected $fillable = ['operating_reserve', 'min_partial_percent', 'pay_days_before_due', 'overdue_first', 'party_priorities'];

    protected function casts(): array
    {
        return [
            'operating_reserve' => 'decimal:4',
            'min_partial_percent' => 'integer',
            'pay_days_before_due' => 'integer',
            'overdue_first' => 'boolean',
            'party_priorities' => 'array',
        ];
    }
}
