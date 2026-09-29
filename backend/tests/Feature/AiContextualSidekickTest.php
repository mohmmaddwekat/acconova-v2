<?php

namespace Tests\Feature;

use App\Models\AiConversation;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AiContextualSidekickTest extends TestCase
{
    use RefreshDatabase;

    public function test_page_context_is_bounded_before_ai_processing(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create([
            'name' => 'AI contextual sidekick',
        ]);
        $organization->users()->attach($user->id, [
            'role' => 'owner',
        ]);

        $conversation = AiConversation::create([
            'user_id' => $user->id,
            'title' => 'Context test',
            'last_message_at' => now(),
        ]);

        $this->actingAs($user)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson(
                "/api/ai/conversations/{$conversation->id}/messages",
                [
                    'message' => 'What is on this page?',
                    'page_context' => [
                        'url' => '/app/invoices/sales/42',
                        'title' => 'Invoice 42',
                        'section' => 'invoices',
                        'entity_type' => 'sales_invoice',
                        'entity_id' => '42',
                        'headings' => ['Invoice 42'],
                        'visible_text' => str_repeat('x', 6001),
                    ],
                ],
            )
            ->assertStatus(422)
            ->assertJsonValidationErrors([
                'page_context.visible_text',
            ]);
    }
}
