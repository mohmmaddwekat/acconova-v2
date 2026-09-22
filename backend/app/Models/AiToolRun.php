<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiToolRun extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'ai_conversation_id',
        'user_id',
        'tool_name',
        'arguments',
        'status',
        'result_meta',
        'duration_ms',
        'error',
    ];

    protected function casts(): array
    {
        return [
            'arguments' => 'array',
            'result_meta' => 'array',
            'duration_ms' => 'integer',
        ];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(AiConversation::class, 'ai_conversation_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
