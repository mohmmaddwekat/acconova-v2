<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\AiImportDraftFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiImportDraft extends Model
{
    /** @use HasFactory<AiImportDraftFactory> */
    use BelongsToOrganization;

    use HasFactory;

    public const STATUS_DRAFT = 'draft';

    public const STATUS_CONFIRMED = 'confirmed';

    public const STATUS_COMMITTED = 'committed';

    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'ai_conversation_id',
        'user_id',
        'source_file_name',
        'source_file_type',
        'target_entity',
        'extracted_rows',
        'field_mapping',
        'ai_notes',
        'status',
        'commit_summary',
    ];

    protected function casts(): array
    {
        return [
            'extracted_rows' => 'array',
            'field_mapping' => 'array',
            'commit_summary' => 'array',
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
