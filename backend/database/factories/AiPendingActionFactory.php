<?php

namespace Database\Factories;

use App\Models\AiConversation;
use App\Models\AiPendingAction;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<AiPendingAction>
 */
class AiPendingActionFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => app(TenantContext::class)->id(),
            'ai_conversation_id' => AiConversation::factory(),
            'user_id' => User::factory(),
            'tool_name' => 'party_archive',
            'token' => Str::random(32),
            'arguments_hash' => hash('sha256', 'x'),
            'plan' => [],
            'status' => AiPendingAction::STATUS_PENDING,
            'result' => null,
            'expires_at' => now()->addMinutes(15),
            'executed_at' => null,
        ];
    }
}
