<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class StaffEntry extends Model
{
    use BelongsToOrganization;
    use SoftDeletes;

    protected $guarded = ['id', 'organization_id'];

    /**
     * Payroll amounts are fixed-point values. Attendance-backed work is kept as
     * the exact quantity x rate amount that created it; hourly attendance must
     * never be silently normalized into an inferred monthly salary.
     */
    protected function casts(): array
    {
        return [
            'amount' => 'decimal:4',
            'rate' => 'decimal:4',
            'quantity' => 'decimal:4',
            'terms' => 'array',
        ];
    }
}
