<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\AiPendingActionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A sensitive assistant action that was planned and shown to the user but
 * not yet confirmed. The token is single-use: once executed, replaying it
 * returns the stored result and changes nothing.
 */
class AiPendingAction extends Model
{
    /** @use HasFactory<AiPendingActionFactory> */
    use BelongsToOrganization;

    use HasFactory;

    public const STATUS_PENDING = 'pending';

    public const STATUS_EXECUTED = 'executed';

    protected $fillable = [
        'ai_conversation_id',
        'user_id',
        'tool_name',
        'token',
        'arguments_hash',
        'plan',
        'status',
        'result',
        'expires_at',
        'executed_at',
    ];

    protected function casts(): array
    {
        return [
            'plan' => 'array',
            'result' => 'array',
            'expires_at' => 'datetime',
            'executed_at' => 'datetime',
        ];
    }
}
