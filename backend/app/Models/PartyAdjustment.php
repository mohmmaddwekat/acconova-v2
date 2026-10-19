<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\PartyAdjustmentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A balance difference with a Party that is neither a sale, a purchase nor a
 * cash movement, such as an agreed price or weight difference. It moves only
 * the Party balance: no stock and no cash.
 *
 * Direction is read from the workspace's point of view:
 * `owed_to_us` means the Party owes us more (or we owe it less);
 * `we_owe` means we owe the Party more (or it owes us less).
 */
class PartyAdjustment extends Model
{
    /** @use HasFactory<PartyAdjustmentFactory> */
    use BelongsToOrganization;

    use HasFactory;

    public const STATUS_POSTED = 'posted';

    public const STATUS_VOIDED = 'voided';

    public const DIRECTION_OWED_TO_US = 'owed_to_us';

    public const DIRECTION_WE_OWE = 'we_owe';

    protected $fillable = [
        'party_id',
        'financial_document_id',
        'number',
        'side',
        'direction',
        'amount',
        'currency',
        'adjustment_date',
        'reason',
        'notes',
        'status',
        'created_by',
        'voided_by',
        'voided_at',
        'void_reason',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:4',
            'adjustment_date' => 'date',
            'voided_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Party, $this>
     */
    public function party(): BelongsTo
    {
        return $this->belongsTo(Party::class);
    }

    /**
     * @return BelongsTo<FinancialDocument, $this>
     */
    public function document(): BelongsTo
    {
        return $this->belongsTo(FinancialDocument::class, 'financial_document_id');
    }

    /**
     * Signed effect on the customer position (positive: the Party owes us more).
     */
    public function customerEffect(): float
    {
        if ($this->side !== 'customer') {
            return 0.0;
        }

        return $this->direction === self::DIRECTION_OWED_TO_US ? (float) $this->amount : -(float) $this->amount;
    }

    /**
     * Signed effect on the supplier position (positive: we owe the Party more).
     */
    public function supplierEffect(): float
    {
        if ($this->side !== 'supplier') {
            return 0.0;
        }

        return $this->direction === self::DIRECTION_WE_OWE ? (float) $this->amount : -(float) $this->amount;
    }
}
