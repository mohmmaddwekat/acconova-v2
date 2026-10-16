<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\CreditDecisionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * The merchant's final credit decision for a customer, kept with the
 * recommendation and the data it was based on at that moment.
 */
class CreditDecision extends Model
{
    /** @use HasFactory<CreditDecisionFactory> */
    use BelongsToOrganization;

    use HasFactory;

    protected $fillable = [
        'party_id', 'recommended', 'decision', 'overrides_recommendation', 'credit_limit', 'credit_days',
        'advance_percent', 'applied_credit_limit', 'notes', 'snapshot', 'decided_by', 'decided_at',
    ];

    protected function casts(): array
    {
        return [
            'overrides_recommendation' => 'boolean',
            'applied_credit_limit' => 'boolean',
            'credit_limit' => 'decimal:4',
            'snapshot' => 'array',
            'decided_at' => 'datetime',
        ];
    }
}
