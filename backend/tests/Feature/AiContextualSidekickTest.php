<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\AiConversation;
use App\Models\AiMessage;
use App\Models\Organization;
use App\Models\User;
use App\Services\AI\AiScreenContextCache;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
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

        $this->actingAs($user)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);

        $conversationId = (int) $this->postJson(
            '/api/ai/conversations',
            ['title' => 'Context test'],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            "/api/ai/conversations/{$conversationId}/messages",
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

    public function test_screen_snapshot_is_sent_once_then_only_changes_until_the_page_changes(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'AI screen cache']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);

        $conversation = AiConversation::factory()->create(['user_id' => $user->id]);
        $screen = app(AiScreenContextCache::class);
        $page = [
            'url' => '/app/payments/create',
            'title' => 'Record payment',
            'headings' => ['Record payment'],
            'visible_text' => "Supplier\nIsmail\nAmount\n11200",
        ];

        $first = $this->storeUserMessage($conversation, $screen->block($conversation, $page));
        $this->assertStringContainsString('kind=full', $first->content);
        $this->assertStringContainsString('11200', $first->content);

        $same = $this->storeUserMessage($conversation, $screen->block($conversation, $page));
        $this->assertStringContainsString('kind=same', $same->content);
        $this->assertStringNotContainsString('Supplier', $same->content);

        $changed = $this->storeUserMessage($conversation, $screen->block($conversation, [
            ...$page,
            'visible_text' => "Supplier\nIsmail\nAmount\n9500",
        ]));
        $this->assertStringContainsString('kind=delta', $changed->content);
        $this->assertStringContainsString('9500', $changed->content);
        $this->assertStringNotContainsString('Supplier', $changed->content);
        $this->assertStringContainsString('kind=full', $first->fresh()->content);

        $otherPage = $this->storeUserMessage($conversation, $screen->block($conversation, [
            'url' => '/app/parties/13',
            'visible_text' => 'Ismail balance',
        ]));
        $this->assertStringContainsString('kind=full', $otherPage->content);
        $this->assertSame('Question', $first->fresh()->content);
        $this->assertSame('Question', $changed->fresh()->content);
    }

    private function storeUserMessage(AiConversation $conversation, string $screenBlock): AiMessage
    {
        return AiMessage::create([
            'ai_conversation_id' => $conversation->id,
            'user_id' => $conversation->user_id,
            'role' => 'user',
            'content' => 'Question'.$screenBlock,
        ]);
    }
}
