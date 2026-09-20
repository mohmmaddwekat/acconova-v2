<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CashMovement extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'party_id',
        'government_obligation_id',
        'department_id',
        'corrected_from_id',
        'reversal_of_id',
        'number',
        'direction',
        'status',
        'category',
        'amount',
        'currency',
        'movement_date',
        'method',
        'account_label',
        'branch_label',
        'cost_center',
        'reference',
        'check_number',
        'check_bank',
        'check_due_date',
        'check_status',
        'method_details',
        'notes',
        'correction_reason',
        'posted_at',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:4',
            'movement_date' => 'date',
            'check_due_date' => 'date',
            'method_details' => 'array',
            'posted_at' => 'datetime',
        ];
    }

    public function party(): BelongsTo
    {
        return $this->belongsTo(Party::class)->withTrashed();
    }

    public function governmentObligation(): BelongsTo
    {
        return $this->belongsTo(GovernmentObligation::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(CashAllocation::class);
    }

    public function correctedFrom(): BelongsTo
    {
        return $this->belongsTo(self::class, 'corrected_from_id');
    }

    public function reversalOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reversal_of_id');
    }
}
