<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\CollectionAlertRuleFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One configurable collections alert rule per workspace and kind. The
 * approved channels only describe which ways of reaching a customer the
 * workspace allows as a suggested next step; nothing is ever sent by a rule.
 */
class CollectionAlertRule extends Model
{
    /** @use HasFactory<CollectionAlertRuleFactory> */
    use BelongsToOrganization;

    use HasFactory;

    public const KIND_OVERDUE = 'overdue';

    public const KIND_STOPPED_PAYING = 'stopped_paying';

    public const KIND_MISSED_PROMISE = 'missed_promise';

    public const KINDS = [self::KIND_OVERDUE, self::KIND_STOPPED_PAYING, self::KIND_MISSED_PROMISE];

    public const CHANNELS = ['call', 'visit', 'email', 'whatsapp', 'sms'];

    protected $fillable = ['kind', 'enabled', 'threshold_days', 'min_amount', 'repeat_after_days', 'approved_channels'];

    /**
     * @return array<string, array{threshold_days:int, repeat_after_days:int}>
     */
    public static function defaults(): array
    {
        return [
            self::KIND_OVERDUE => ['threshold_days' => 7, 'repeat_after_days' => 7],
            self::KIND_STOPPED_PAYING => ['threshold_days' => 45, 'repeat_after_days' => 14],
            self::KIND_MISSED_PROMISE => ['threshold_days' => 0, 'repeat_after_days' => 3],
        ];
    }

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'threshold_days' => 'integer',
            'repeat_after_days' => 'integer',
            'min_amount' => 'decimal:4',
            'approved_channels' => 'array',
        ];
    }
}
