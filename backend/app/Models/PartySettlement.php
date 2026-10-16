<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\PartySettlementFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An agreed offset of what a dual-role Party owes us (customer side) against
 * what we owe it (supplier side). It never happens automatically: it is
 * requested with the agreement details, approved by a reviewer, and only a
 * `posted` settlement reduces both positions. Reversing it restores them.
 */
class PartySettlement extends Model
{
    /** @use HasFactory<PartySettlementFactory> */
    use BelongsToOrganization;

    use HasFactory;

    public const STATUS_PENDING = 'pending';

    public const STATUS_POSTED = 'posted';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_REVERSED = 'reversed';

    protected $fillable = [
        'party_id',
        'amount',
        'currency',
        'settlement_date',
        'agreement_reference',
        'agreement_date',
        'agreement_notes',
        'status',
        'requested_by',
        'approved_by',
        'approved_at',
        'rejected_by',
        'rejected_at',
        'rejection_reason',
        'reversed_by',
        'reversed_at',
        'reversal_reason',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:4',
            'settlement_date' => 'date',
            'agreement_date' => 'date',
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
            'reversed_at' => 'datetime',
        ];
    }

    public function party(): BelongsTo
    {
        return $this->belongsTo(Party::class)->withTrashed();
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
