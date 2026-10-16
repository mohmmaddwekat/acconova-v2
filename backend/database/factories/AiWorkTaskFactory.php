<?php

namespace Database\Factories;

use App\Models\AiConversation;
use App\Models\AiWorkTask;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AiWorkTask>
 */
class AiWorkTaskFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => app(TenantContext::class)->id(),
            'ai_conversation_id' => AiConversation::factory(),
            'user_id' => User::factory(),
            'position' => 1,
            'title' => fake()->sentence(4),
            'status' => AiWorkTask::STATUS_PENDING,
        ];
    }
}
