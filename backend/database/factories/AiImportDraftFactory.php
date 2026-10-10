<?php

namespace Database\Factories;

use App\Models\AiConversation;
use App\Models\AiImportDraft;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AiImportDraft>
 */
class AiImportDraftFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => app(TenantContext::class)->id(),
            'ai_conversation_id' => AiConversation::factory(),
            'user_id' => User::factory(),
            'source_file_name' => fake()->word().'.xlsx',
            'source_file_type' => 'xlsx',
            'target_entity' => 'staff',
            'extracted_rows' => [],
            'field_mapping' => null,
            'ai_notes' => null,
            'status' => AiImportDraft::STATUS_DRAFT,
            'commit_summary' => null,
        ];
    }
}
