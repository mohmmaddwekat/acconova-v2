<?php

namespace Tests\Feature\AI;

use App\Enums\OrganizationRole;
use App\Models\AiConversation;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\User;
use App\Models\WorkspaceRole;
use App\Services\AI\AiAssistantOrchestrator;
use App\Services\AI\AiCapabilityGuide;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AiCapabilityGuideTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Organization $organization;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'ai.enabled' => true,
            'ai.default_provider' => 'openai',
            'ai.fallback_providers' => [],
            'ai.max_output_tokens' => 500,
            'ai.timeout_seconds' => 5,
            'ai.providers' => ['openai' => [
                'driver' => 'openai_compatible', 'label' => 'OpenAI', 'base_url' => 'https://ai.example.test',
                'chat_path' => '/v1/chat/completions', 'model' => 'test-model', 'max_tokens_field' => 'max_completion_tokens',
                'auth' => ['mode' => 'api_key', 'api_key' => 'server-only-key'],
            ]],
        ]);

        $this->owner = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Guide Co']);
        $this->organization->users()->attach($this->owner->id, ['role' => 'owner']);
        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();
        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_the_guide_lists_what_the_user_can_do_and_how_to_work(): void
    {
        $guide = app(AiCapabilityGuide::class)->forUser($this->owner);

        foreach (['party_balances', 'party_create', 'product_update', 'recurring_payment_create', 'smart_import_propose'] as $tool) {
            $this->assertStringContainsString($tool.':', $guide);
        }

        $this->assertStringContainsString('ask for what is missing', $guide);
        $this->assertStringContainsString('explicit yes', $guide);
        $this->assertStringContainsString('Nothing is ever deleted permanently', $guide);
        $this->assertStringContainsString('Not available through chat yet', $guide);
        $this->assertStringNotContainsString('party_delete', $guide);
    }

    public function test_the_guide_only_promises_what_the_users_permissions_allow(): void
    {
        $member = User::factory()->create();
        $this->organization->users()->attach($member->id, ['role' => 'employee']);
        $role = WorkspaceRole::create(['name' => 'Reader', 'base_role' => 'employee', 'is_custom' => true, 'permissions' => ['ai.business_data.use', 'ai.business_data.write', 'parties.create']]);
        Membership::query()->where('user_id', $member->id)->update(['workspace_role_id' => $role->id]);
        app(TenantContext::class)->set($this->organization, OrganizationRole::Employee);

        $guide = app(AiCapabilityGuide::class)->forUser($member);

        $this->assertStringContainsString('party_create:', $guide);
        $this->assertStringNotContainsString('product_create:', $guide);
        $this->assertStringNotContainsString('recurring_payment_create:', $guide);
        $this->assertStringNotContainsString('party_archive:', $guide);
    }

    public function test_the_answering_model_receives_the_guide(): void
    {
        $conversation = AiConversation::factory()->for($this->owner)->create();

        Http::preventStrayRequests();
        Http::fake(fn () => Http::response([
            'model' => 'test-model',
            'choices' => [['message' => ['content' => '{"calls":[]}']]],
            'usage' => ['prompt_tokens' => 1, 'completion_tokens' => 1, 'total_tokens' => 2],
        ]));

        app(AiAssistantOrchestrator::class)->chat($conversation, $this->owner, [
            ['role' => 'system', 'content' => 'Base prompt'],
            ['role' => 'user', 'content' => 'What can you do?'],
        ]);

        Http::assertSent(function ($request): bool {
            $messages = (array) $request['messages'];

            return ($messages[0]['content'] ?? null) === 'Base prompt'
                && str_contains((string) ($messages[1]['content'] ?? ''), 'AccoNova assistant briefing')
                && str_contains((string) ($messages[1]['content'] ?? ''), 'recurring_payment_create');
        });
    }
}
