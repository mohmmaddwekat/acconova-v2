<?php

namespace Tests\Feature\AI;

use App\Enums\OrganizationRole;
use App\Models\AiImportDraft;
use App\Models\AiMessage;
use App\Models\BillingAccount;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Mpdf\Mpdf;
use Mpdf\Output\Destination;
use Tests\TestCase;

class AiAssistantImportUploadTest extends TestCase
{
    use RefreshDatabase;

    public function test_uploading_a_csv_creates_a_draft_and_tags_the_message(): void
    {
        [$user, $organization] = $this->workspace('owner', 'Smart import upload');
        $this->actingInWorkspace($user, $organization);
        $this->configureProvider();
        $this->fakeAiSequence();

        $conversationId = (int) $this->postJson('/api/ai/conversations', [
            'title' => 'Import question',
        ])->assertCreated()->json('data.id');

        $response = $this->postJson(
            "/api/ai/conversations/{$conversationId}/messages",
            [
                'message' => 'import these',
                'import_file' => [
                    'data_url' => $this->csvDataUrl("name\nJane\n"),
                    'name' => 'x.csv',
                    'mime' => 'text/csv',
                ],
            ],
        );

        $response->assertOk();

        $this->assertDatabaseHas('ai_import_drafts', [
            'ai_conversation_id' => $conversationId,
            'user_id' => $user->id,
            'source_file_name' => 'x.csv',
            'source_file_type' => 'spreadsheet',
            'status' => AiImportDraft::STATUS_DRAFT,
        ]);

        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $draft = AiImportDraft::query()->latest('id')->first();
        $this->assertNotNull($draft);
        $this->assertSame([['name' => 'Jane']], $draft->extracted_rows);

        $userMessage = AiMessage::where('role', 'user')->latest('id')->first();
        $this->assertNotNull($userMessage);
        $this->assertStringContainsString('ACCONOVA_IMPORT_DRAFT_V1', $userMessage->content);
        $this->assertStringContainsString("Draft-Id: {$draft->id}", $userMessage->content);
    }

    public function test_a_file_only_submission_without_a_typed_message_succeeds(): void
    {
        [$user, $organization] = $this->workspace('owner', 'Smart import file only');
        $this->actingInWorkspace($user, $organization);
        $this->configureProvider();
        $this->fakeAiSequence();

        $conversationId = (int) $this->postJson('/api/ai/conversations', [
            'title' => 'Import question',
        ])->assertCreated()->json('data.id');

        $response = $this->postJson(
            "/api/ai/conversations/{$conversationId}/messages",
            [
                'import_file' => [
                    'data_url' => $this->csvDataUrl("name\nJane\n"),
                    'name' => 'x.csv',
                    'mime' => 'text/csv',
                ],
            ],
        );

        $response->assertOk();

        $this->assertDatabaseHas('ai_import_drafts', [
            'ai_conversation_id' => $conversationId,
            'user_id' => $user->id,
            'source_file_type' => 'spreadsheet',
            'status' => AiImportDraft::STATUS_DRAFT,
        ]);

        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $userMessage = AiMessage::where('role', 'user')->latest('id')->first();
        $this->assertNotNull($userMessage);
        $this->assertStringContainsString('Preview the attached file for import.', $userMessage->content);
        $this->assertStringContainsString('ACCONOVA_IMPORT_DRAFT_V1', $userMessage->content);
    }

    public function test_processing_a_csv_import_file_does_not_leak_a_temp_file(): void
    {
        [$user, $organization] = $this->workspace('owner', 'Smart import temp cleanup');
        $this->actingInWorkspace($user, $organization);
        $this->configureProvider();
        $this->fakeAiSequence();

        $pattern = sys_get_temp_dir().DIRECTORY_SEPARATOR.'acconova_import_*';
        $before = glob($pattern) ?: [];

        $conversationId = (int) $this->postJson('/api/ai/conversations', [
            'title' => 'Import question',
        ])->assertCreated()->json('data.id');

        $this->postJson(
            "/api/ai/conversations/{$conversationId}/messages",
            [
                'message' => 'import these',
                'import_file' => [
                    'data_url' => $this->csvDataUrl("name\nJane\n"),
                    'name' => 'x.csv',
                    'mime' => 'text/csv',
                ],
            ],
        )->assertOk();

        $after = glob($pattern) ?: [];

        $this->assertSame($before, $after, 'A temp file created while processing the import upload was left behind.');
    }

    /**
     * Covers Task 7 (closes I3): an image-based import file spends real AI
     * vision tokens via `ImageRowExtractor`, which must be billed to the
     * organization's credit balance the same way every other AI call in
     * the app is billed — this previously fell through uncharged.
     */
    public function test_an_image_import_file_bills_ai_usage(): void
    {
        [$user, $organization] = $this->workspace('owner', 'Smart import image billing');
        $this->actingInWorkspace($user, $organization);
        $this->configureProvider();

        // Force every token spent this month to count as billable overage,
        // so the image-extraction usage below is deterministically debited
        // from the wallet rather than silently absorbed by an included
        // monthly allowance.
        config(['billing.plans.starter.limits.ai_tokens' => 0]);

        BillingAccount::create([
            'organization_id' => $organization->id,
            'provider_customer_id' => 'cus_import_image_billing',
            'provider_subscription_id' => 'sub_import_image_billing',
            'plan_key' => 'starter',
            'billing_interval' => 'month',
            'status' => 'active',
        ]);

        DB::table('billing_ai_wallets')->insert([
            'organization_id' => $organization->id,
            'balance_tokens' => 100000,
            'total_purchased_tokens' => 100000,
            'total_consumed_tokens' => 0,
            'auto_recharge_enabled' => false,
            'auto_recharge_threshold_tokens' => 100000,
            'auto_recharge_tokens' => 0,
            'auto_recharge_amount_minor' => 0,
            'auto_recharge_currency' => 'USD',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/*' => Http::sequence()
                // 1. ImageRowExtractor's vision call.
                ->push([
                    'model' => 'vision-model',
                    'choices' => [[
                        'message' => ['content' => '[{"name":"Jane"}]'],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 80,
                        'completion_tokens' => 12,
                        'total_tokens' => 92,
                    ],
                ])
                // 2. The orchestrator's planner call.
                ->push([
                    'model' => 'tool-test-model',
                    'choices' => [[
                        'message' => [
                            'content' => json_encode(['calls' => []], JSON_THROW_ON_ERROR),
                        ],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 10,
                        'completion_tokens' => 5,
                        'total_tokens' => 15,
                    ],
                ])
                // 3. The orchestrator's final answer call.
                ->push([
                    'model' => 'tool-test-model',
                    'choices' => [[
                        'message' => ['content' => 'Imported the rows from the photo.'],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 20,
                        'completion_tokens' => 10,
                        'total_tokens' => 30,
                    ],
                ]),
        ]);

        $conversationId = (int) $this->postJson('/api/ai/conversations', [
            'title' => 'Import question',
        ])->assertCreated()->json('data.id');

        $response = $this->postJson(
            "/api/ai/conversations/{$conversationId}/messages",
            [
                'message' => 'import this photo',
                'import_file' => [
                    'data_url' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl+X9sAAAAASUVORK5CYII=',
                    'name' => 'scan.png',
                    'mime' => 'image/png',
                ],
            ],
        );

        $response->assertOk();

        // Exactly one debit for the image-extraction usage, not "at least
        // one": a regression that double-bills (e.g. consumeOverage()
        // called twice for the same usage) would still satisfy
        // assertDatabaseHas, since that only checks a matching row exists.
        $this->assertSame(
            1,
            DB::table('billing_ai_credit_transactions')
                ->where('organization_id', $organization->id)
                ->where('kind', 'usage')
                ->where('tokens', -92)
                ->count(),
        );
    }

    public function test_an_unsupported_import_file_mime_is_rejected(): void
    {
        [$user, $organization] = $this->workspace('owner', 'Smart import rejection');
        $this->actingInWorkspace($user, $organization);
        $this->configureProvider();

        $conversationId = (int) $this->postJson('/api/ai/conversations', [
            'title' => 'Import question',
        ])->assertCreated()->json('data.id');

        $this->postJson(
            "/api/ai/conversations/{$conversationId}/messages",
            [
                'message' => 'import these',
                'import_file' => [
                    'data_url' => 'data:application/zip;base64,UEsDBAoAAAAAAA==',
                    'name' => 'x.zip',
                    'mime' => 'application/zip',
                ],
            ],
        )
            ->assertStatus(422)
            ->assertJsonValidationErrors(['import_file.mime']);
    }

    /**
     * Covers Task 2 of the extraction-upgrades plan: a PDF import file is
     * now accepted and routed through `PdfRowExtractor`, which spends real
     * AI text-model tokens that must be billed to the organization's
     * credit balance the same way the image path already is (see
     * `test_an_image_import_file_bills_ai_usage()` above).
     */
    public function test_a_pdf_import_file_bills_ai_usage(): void
    {
        [$user, $organization] = $this->workspace('owner', 'Smart import pdf billing');
        $this->actingInWorkspace($user, $organization);
        $this->configureProvider();

        // Force every token spent this month to count as billable overage,
        // so the PDF-extraction usage below is deterministically debited
        // from the wallet rather than silently absorbed by an included
        // monthly allowance.
        config(['billing.plans.starter.limits.ai_tokens' => 0]);

        BillingAccount::create([
            'organization_id' => $organization->id,
            'provider_customer_id' => 'cus_import_pdf_billing',
            'provider_subscription_id' => 'sub_import_pdf_billing',
            'plan_key' => 'starter',
            'billing_interval' => 'month',
            'status' => 'active',
        ]);

        DB::table('billing_ai_wallets')->insert([
            'organization_id' => $organization->id,
            'balance_tokens' => 100000,
            'total_purchased_tokens' => 100000,
            'total_consumed_tokens' => 0,
            'auto_recharge_enabled' => false,
            'auto_recharge_threshold_tokens' => 100000,
            'auto_recharge_tokens' => 0,
            'auto_recharge_amount_minor' => 0,
            'auto_recharge_currency' => 'USD',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/*' => Http::sequence()
                // 1. PdfRowExtractor's text-model call.
                ->push([
                    'model' => 'tool-test-model',
                    'choices' => [[
                        'message' => ['content' => '[{"name":"Jane"}]'],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 80,
                        'completion_tokens' => 12,
                        'total_tokens' => 92,
                    ],
                ])
                // 2. The orchestrator's planner call.
                ->push([
                    'model' => 'tool-test-model',
                    'choices' => [[
                        'message' => [
                            'content' => json_encode(['calls' => []], JSON_THROW_ON_ERROR),
                        ],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 10,
                        'completion_tokens' => 5,
                        'total_tokens' => 15,
                    ],
                ])
                // 3. The orchestrator's final answer call.
                ->push([
                    'model' => 'tool-test-model',
                    'choices' => [[
                        'message' => ['content' => 'Imported the rows from the PDF.'],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 20,
                        'completion_tokens' => 10,
                        'total_tokens' => 30,
                    ],
                ]),
        ]);

        $conversationId = (int) $this->postJson('/api/ai/conversations', [
            'title' => 'Import question',
        ])->assertCreated()->json('data.id');

        $response = $this->postJson(
            "/api/ai/conversations/{$conversationId}/messages",
            [
                'message' => 'import this pdf',
                'import_file' => [
                    'data_url' => $this->pdfDataUrl('Jane    120.00 units shipped on Monday'),
                    'name' => 'scan.pdf',
                    'mime' => 'application/pdf',
                ],
            ],
        );

        $response->assertOk();

        // Exactly one debit for the PDF-extraction usage, not "at least
        // one": a regression that double-bills (e.g. consumeOverage()
        // called twice for the same usage) would still satisfy
        // assertDatabaseHas, since that only checks a matching row exists.
        $this->assertSame(
            1,
            DB::table('billing_ai_credit_transactions')
                ->where('organization_id', $organization->id)
                ->where('kind', 'usage')
                ->where('tokens', -92)
                ->count(),
        );
    }

    public function test_uploading_a_pdf_creates_a_draft_tagged_as_pdf(): void
    {
        [$user, $organization] = $this->workspace('owner', 'Smart import pdf tagging');
        $this->actingInWorkspace($user, $organization);
        $this->configureProvider();

        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/*' => Http::sequence()
                // 1. PdfRowExtractor's text-model call.
                ->push([
                    'model' => 'tool-test-model',
                    'choices' => [[
                        'message' => ['content' => '[{"name":"Jane"}]'],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 80,
                        'completion_tokens' => 12,
                        'total_tokens' => 92,
                    ],
                ])
                // 2. The orchestrator's planner call.
                ->push([
                    'model' => 'tool-test-model',
                    'choices' => [[
                        'message' => [
                            'content' => json_encode(['calls' => []], JSON_THROW_ON_ERROR),
                        ],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 10,
                        'completion_tokens' => 5,
                        'total_tokens' => 15,
                    ],
                ])
                // 3. The orchestrator's final answer call.
                ->push([
                    'model' => 'tool-test-model',
                    'choices' => [[
                        'message' => ['content' => 'Imported the rows from the PDF.'],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 20,
                        'completion_tokens' => 10,
                        'total_tokens' => 30,
                    ],
                ]),
        ]);

        $conversationId = (int) $this->postJson('/api/ai/conversations', [
            'title' => 'Import question',
        ])->assertCreated()->json('data.id');

        $response = $this->postJson(
            "/api/ai/conversations/{$conversationId}/messages",
            [
                'message' => 'import these',
                'import_file' => [
                    'data_url' => $this->pdfDataUrl('Jane appears on this record as the staff member'),
                    'name' => 'x.pdf',
                    'mime' => 'application/pdf',
                ],
            ],
        );

        $response->assertOk();

        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $draft = AiImportDraft::query()->latest('id')->first();
        $this->assertNotNull($draft);
        $this->assertSame('pdf', $draft->source_file_type);
    }

    private function fakeAiSequence(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/*' => Http::sequence()
                ->push([
                    'model' => 'tool-test-model',
                    'choices' => [[
                        'message' => [
                            'content' => json_encode(['calls' => []], JSON_THROW_ON_ERROR),
                        ],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 10,
                        'completion_tokens' => 5,
                        'total_tokens' => 15,
                    ],
                ])
                ->push([
                    'model' => 'tool-test-model',
                    'choices' => [[
                        'message' => [
                            'content' => 'I can help you import these rows.',
                        ],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 20,
                        'completion_tokens' => 10,
                        'total_tokens' => 30,
                    ],
                ]),
        ]);
    }

    private function csvDataUrl(string $csv): string
    {
        return 'data:text/csv;base64,'.base64_encode($csv);
    }

    /**
     * Builds a real text-based PDF (mirroring
     * `PdfRowExtractorTest::makeTextPdf()`) so `PdfRowExtractor`'s local
     * `smalot/pdfparser` text extraction has genuine selectable text to
     * read, then returns it as a base64 data URL ready for the
     * `import_file.data_url` payload.
     */
    private function pdfDataUrl(string $text): string
    {
        $mpdf = new Mpdf;
        $mpdf->WriteHTML('<p>'.e($text).'</p>');
        $path = tempnam(sys_get_temp_dir(), 'test_pdf_').'.pdf';
        $mpdf->Output($path, Destination::FILE);

        try {
            return 'data:application/pdf;base64,'.base64_encode(file_get_contents($path));
        } finally {
            unlink($path);
        }
    }

    private function configureProvider(): void
    {
        config([
            'billing.enabled' => false,
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
