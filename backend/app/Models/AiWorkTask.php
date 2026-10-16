<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\AiWorkTaskFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One step of a work session's plan. The assistant works through the steps in
 * order; a step that needs the user's answer or approval is left `blocked`.
 */
class AiWorkTask extends Model
{
    /** @use HasFactory<AiWorkTaskFactory> */
    use BelongsToOrganization;

    use HasFactory;

    public const STATUS_PENDING = 'pending';

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_DONE = 'done';

    public const STATUS_BLOCKED = 'blocked';

    public const STATUS_CANCELLED = 'cancelled';

    public const OPEN = [self::STATUS_PENDING, self::STATUS_IN_PROGRESS, self::STATUS_BLOCKED];

    protected $fillable = ['ai_conversation_id', 'user_id', 'position', 'title', 'status', 'note', 'started_at', 'finished_at'];

    protected function casts(): array
    {
        return ['position' => 'integer', 'started_at' => 'datetime', 'finished_at' => 'datetime'];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(AiConversation::class, 'ai_conversation_id');
    }
}
