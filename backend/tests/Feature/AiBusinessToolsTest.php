<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AiBusinessToolsTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_ai_uses_permission_checked_sales_tool_without_raw_database_access(): void
    {
        [$owner, $organization] = $this->workspace('owner', 'AI business tools');
        $this->actingInWorkspace($owner, $organization);

        $partyId = (int) $this->postJson('/api/parties', [
            'type' => 'company',
            'company_name' => 'AI Customer',
            'roles' => ['customer'],
        ])->assertCreated()->json('data.id');

        $documentId = (int) $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice',
            'party_id' => $partyId,
            'issue_date' => '2026-09-22',
            'due_date' => '2026-10-22',
            'currency' => 'ILS',
            'lines' => [[
                'description' => 'AI tool test service',
                'quantity' => '1',
                'unit_price' => '100',
                'tax_rate' => '0',
                'affects_inventory' => false,
            ]],
        ])->assertCreated()->json('data.id');

        $this->postJson(
            "/api/finance/documents/{$documentId}/issue",
            ['acknowledge_warnings' => false],
        )->assertOk();

        $this->configureProvider();

        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/*' => Http::sequence()
                ->push([
                    'model' => 'tool-test-model',
                    'choices' => [[
                        'message' => [
                            'content' => json_encode([
                                'calls' => [[
                                    'name' => 'sales_summary',
                                    'arguments' => [
                                        'date_from' => '2026-09-01',
                                        'date_to' => '2026-09-30',
                                    ],
                                ]],
                            ], JSON_THROW_ON_ERROR),
                        ],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 20,
                        'completion_tokens' => 10,
                        'total_tokens' => 30,
                    ],
                ])
                ->push([
                    'model' => 'tool-test-model',
                    'choices' => [[
                        'message' => [
                            'content' => 'September issued sales total 100.0000 ILS.',
                        ],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 40,
                        'completion_tokens' => 12,
                        'total_tokens' => 52,
                    ],
                ]),
        ]);

        $conversationId = (int) $this->postJson('/api/ai/conversations', [
            'title' => 'Sales question',
        ])->assertCreated()->json('data.id');

        $response = $this->postJson(
            "/api/ai/conversations/{$conversationId}/messages",
            [
                'message' => 'How much did we sell this month?',
            ],
        )
            ->assertOk()
            ->assertJsonMissingPath('data.message.provider')
            ->assertJsonMissingPath('data.message.model')
            ->assertJsonMissingPath('data.usage.provider')
            ->assertJsonMissingPath('data.usage.model')
            ->assertJsonPath('data.usage.total_tokens', 82)
            ->assertJsonPath('data.usage.tool_calls.0', 'sales_summary');

        $this->assertSame(
            'September issued sales total 100.0000 ILS.',
            $response->json('data.message.content'),
        );

        $this->assertDatabaseHas('ai_tool_runs', [
            'organization_id' => $organization->id,
            'ai_conversation_id' => $conversationId,
            'user_id' => $owner->id,
            'tool_name' => 'sales_summary',
            'status' => 'success',
        ]);

        Http::assertSentCount(2);

        Http::assertSent(function ($request): bool {
            $messages = (array) $request['messages'];

            foreach ($messages as $message) {
                if (
                    ($message['role'] ?? null) === 'system'
                    && str_contains(
                        (string) ($message['content'] ?? ''),
                        'Trusted AccoNova business-tool results',
                    )
                    && str_contains(
                        (string) ($message['content'] ?? ''),
                        '100.0000',
                    )
                ) {
                    return true;
                }
            }

            return false;
        });
    }

    public function test_employee_without_finance_permission_is_not_offered_finance_tools(): void
    {
        [$employee, $organization] = $this->workspace('employee', 'AI restricted tools');
        $this->actingInWorkspace($employee, $organization);
        $this->configureProvider();

        $status = $this->getJson('/api/ai/status')
            ->assertOk()
            ->assertJsonPath('data.configured', true)
            ->assertJsonMissingPath('data.provider')
            ->assertJsonMissingPath('data.model')
            ->assertJsonMissingPath('data.providers')
            ->assertJsonMissingPath('data.auth_mode');

        $available = $status->json('data.tools.available');

        $this->assertNotContains('sales_summary', $available);
        $this->assertNotContains('cashflow_summary', $available);
        $this->assertNotContains('overdue_invoices', $available);
    }

    private function configureProvider(): void
    {
        config([
            'ai.enabled' => true,
            'ai.default_provider' => 'openai',
            'ai.fallback_providers' => [],
            'ai.tools.enabled' => true,
            'ai.tools.max_calls' => 4,
            'ai.tools.planner_max_output_tokens' => 450,
            'ai.tools.max_result_chars' => 30000,
            'ai.providers' => [
                'openai' => [
                    'driver' => 'openai_compatible',
                    'label' => 'OpenAI',
                    'base_url' => 'https://ai.example.test',
                    'chat_path' => '/v1/chat/completions',
                    'model' => 'tool-test-model',
                    'max_tokens_field' => 'max_tokens',
                    'max_output_tokens' => 1200,
                    'auth' => [
                        'mode' => 'api_key',
                        'api_key' => 'server-only-key',
                    ],
                ],
            ],
        ]);
    }

    /** @return array{0:User,1:Organization} */
    private function workspace(string $role, string $name): array
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => $name]);
        $organization->users()->attach($user->id, ['role' => $role]);

        return [$user, $organization];
    }

    private function actingInWorkspace(User $user, Organization $organization): void
    {
        $this->actingAs($user)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);
    }
}
