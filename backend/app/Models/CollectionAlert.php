<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\CollectionAlertFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CollectionAlert extends Model
{
    /** @use HasFactory<CollectionAlertFactory> */
    use BelongsToOrganization;

    use HasFactory;

    public const STATUS_OPEN = 'open';

    public const STATUS_SNOOZED = 'snoozed';

    public const STATUS_RESOLVED = 'resolved';

    protected $fillable = [
        'party_id', 'kind', 'status', 'severity', 'reason', 'outstanding', 'overdue_amount', 'days_late',
        'last_payment_on', 'next_action', 'notified_count', 'last_notified_at', 'last_notified_days_late',
        'snoozed_until', 'first_raised_at', 'resolved_at',
    ];

    protected function casts(): array
    {
        return [
            'reason' => 'array',
            'outstanding' => 'decimal:4',
            'overdue_amount' => 'decimal:4',
            'days_late' => 'integer',
            'last_payment_on' => 'date',
            'last_notified_at' => 'datetime',
            'snoozed_until' => 'date',
            'first_raised_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    public function party(): BelongsTo
    {
        return $this->belongsTo(Party::class)->withTrashed();
    }
}
