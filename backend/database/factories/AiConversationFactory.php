<?php

namespace Database\Factories;

use App\Models\AiConversation;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AiConversation>
 */
class AiConversationFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => app(TenantContext::class)->id(),
            'user_id' => User::factory(),
            'title' => fake()->sentence(3),
        ];
    }
}
