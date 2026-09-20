<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GovernmentObligation extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'tax_rule_id',
        'authority_name',
        'title',
        'obligation_type',
        'country_code',
        'region_code',
        'period_start',
        'period_end',
        'due_date',
        'amount',
        'paid_total',
        'balance_due',
        'currency',
        'status',
        'notes',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'due_date' => 'date',
            'amount' => 'decimal:4',
            'paid_total' => 'decimal:4',
            'balance_due' => 'decimal:4',
        ];
    }

    public function taxRule(): BelongsTo
    {
        return $this->belongsTo(TaxRule::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(CashMovement::class);
    }
}
