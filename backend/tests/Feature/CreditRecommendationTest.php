<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\AiConversation;
use App\Models\Organization;
use App\Models\User;
use App\Services\AI\AiBusinessToolRegistry;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CreditRecommendationTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Credit Co']);
        $this->organization->users()->attach($this->owner->id, ['role' => 'owner']);
        $this->as($this->owner);
    }

    private function as(User $user, ?Organization $organization = null): void
    {
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => ($organization ?? $this->organization)->id]);
    }

    private function day(int $daysAgo): string
    {
        return now()->subDays($daysAgo)->toDateString();
    }

    private function customer(string $name): int
    {
        return $this->postJson('/api/parties', ['type' => 'company', 'company_name' => $name, 'roles' => ['customer']])
            ->assertCreated()->json('data.id');
    }

    private function invoice(int $partyId, int $amount, int $issuedDaysAgo, int $dueDaysAgo): int
    {
        $id = $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice', 'party_id' => $partyId,
            'issue_date' => $this->day($issuedDaysAgo), 'due_date' => $this->day($dueDaysAgo),
            'activity_type' => 'services', 'market_type' => 'local', 'currency' => 'ILS', 'exchange_rate' => '1', 'shipping_total' => '0',
            'lines' => [['description' => 'Service', 'quantity' => '1', 'unit' => 'service', 'unit_price' => (string) $amount,
                'discount_percent' => '0', 'tax_rate' => '0', 'affects_inventory' => false]],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/documents/{$id}/issue", ['acknowledge_warnings' => false])->assertOk();

        return $id;
    }

    private function pay(int $partyId, int $documentId, int $amount, int $paidDaysAgo, string $method = 'cash', array $extra = []): int
    {
        $id = $this->postJson('/api/finance/cash-movements', [
            'direction' => 'incoming', 'party_id' => $partyId, 'category' => 'customer_receipt', 'amount' => (string) $amount,
            'currency' => 'ILS', 'movement_date' => $this->day($paidDaysAgo), 'method' => $method, 'account_label' => 'Main',
            'allocations' => [['financial_document_id' => $documentId, 'amount' => (string) $amount]], ...$extra,
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/cash-movements/{$id}/post")->assertOk();

        return $id;
    }

    /**
     * Four 200 invoices issued 100/80/60/40 days ago, due 30 days after issue.
     * $lateDays[n] is how many days after the due date invoice n was paid
     * (negative = early).
     *
     * @param  list<int>  $lateDays
     */
    private function history(string $name, array $lateDays): int
    {
        $party = $this->customer($name);

        foreach ([100, 80, 60, 40] as $index => $issued) {
            $document = $this->invoice($party, 200, $issued, $issued - 30);
            $this->pay($party, $document, 200, ($issued - 30) - $lateDays[$index]);
        }

        return $party;
    }

    /**
     * @return array<string, mixed>
     */
    private function assessment(int $party): array
    {
        return $this->getJson("/api/parties/{$party}/credit-assessment")->assertOk()->json('data');
    }

    public function test_the_policy_has_defaults_can_be_configured_and_needs_approval_rights_to_change(): void
    {
        $policy = $this->getJson('/api/credit-policy')->assertOk()->json('data');
        $this->assertSame(3, $policy['min_history_invoices']);
        $this->assertSame('advance_payment', $policy['new_customer_terms']);

        $this->putJson('/api/credit-policy', ['credit_days' => 45, 'max_credit_limit' => '5000', 'new_customer_terms' => 'cash_only'])
            ->assertOk()->assertJsonPath('data.credit_days', 45)->assertJsonPath('data.new_customer_terms', 'cash_only');
        $this->putJson('/api/credit-policy', ['min_on_time_ratio' => 2])->assertUnprocessable();
        $this->putJson('/api/credit-policy', ['new_customer_terms' => 'free_credit'])->assertUnprocessable();

        $accountant = User::factory()->create();
        $this->organization->users()->attach($accountant->id, ['role' => 'accountant']);
        $this->as($accountant);
        $this->getJson('/api/credit-policy')->assertOk();
        $this->putJson('/api/credit-policy', ['credit_days' => 5])->assertForbidden();
    }

    public function test_a_new_customer_gets_insufficient_data_with_what_is_missing_and_a_fallback(): void
    {
        $party = $this->customer('Brand New');
        $this->invoice($party, 100, 10, -20);

        $result = $this->assessment($party);

        $this->assertSame('insufficient_data', $result['recommendation']['key']);
        $this->assertSame('advance_payment', $result['recommendation']['fallback']);
        $this->assertFalse($result['sufficiency']['enough']);
        $this->assertEqualsCanonicalizing(['history_invoices', 'history_days', 'paid_invoices'], array_column($result['sufficiency']['missing'], 'code'));
        $this->assertSame(1, $result['data']['invoices']);
        $this->assertStringContainsString('authorized merchant', $result['disclaimer']);

        $this->putJson('/api/credit-policy', ['new_customer_terms' => 'cash_only'])->assertOk();
        $this->assertSame('cash_only', $this->assessment($party)['recommendation']['fallback']);
        $this->assertSame('insufficient_data', $this->assessment($this->customer('No Invoices'))['recommendation']['key']);
    }

    public function test_a_reliable_payer_gets_credit_with_a_limit_and_term_and_the_reasons(): void
    {
        $party = $this->history('Reliable', [-20, -20, -20, -20]);

        $result = $this->assessment($party);

        $this->assertSame('credit', $result['recommendation']['key']);
        $this->assertSame('400.0000', $result['recommendation']['credit_limit'], 'average monthly sales 200 x 2 months');
        $this->assertSame(30, $result['recommendation']['credit_days']);
        $this->assertEquals(1.0, $result['data']['on_time_ratio']);
        $this->assertSame(4, $result['data']['settled_invoices']);
        $this->assertEqualsCanonicalizing(['good_record', 'limit_basis'], array_column($result['reasons'], 'code'));
        $this->assertTrue(collect($result['checks'])->every(fn (array $check): bool => $check['ok']));

        $this->putJson('/api/credit-policy', ['max_credit_limit' => '300'])->assertOk();
        $this->assertSame('300.0000', $this->assessment($party)['recommendation']['credit_limit']);
    }

    public function test_an_occasionally_late_payer_is_asked_for_an_advance(): void
    {
        $result = $this->assessment($this->history('Sometimes Late', [-5, -5, -5, 5]));

        $this->assertSame('advance_payment', $result['recommendation']['key']);
        $this->assertSame(50, $result['recommendation']['advance_percent']);
        $this->assertSame(['on_time_ratio'], array_column($result['reasons'], 'code'));
        $this->assertSame(0.75, $result['reasons'][0]['value']);
        $this->assertSame(0.8, $result['reasons'][0]['threshold']);
    }

    public function test_a_chronically_late_payer_is_cash_only(): void
    {
        $party = $this->customer('Very Late');

        foreach ([300, 270, 240, 210] as $issued) {
            $document = $this->invoice($party, 200, $issued, $issued - 30);
            $this->pay($party, $document, 200, ($issued - 30) - 30);
        }

        $result = $this->assessment($party);

        $this->assertSame('cash_only', $result['recommendation']['key']);
        $this->assertContains('avg_days_late', array_column($result['reasons'], 'code'));
        $this->assertEquals(30.0, $result['data']['avg_days_late']);
    }

    public function test_credit_is_stopped_for_a_long_overdue_balance_even_with_little_history(): void
    {
        $party = $this->customer('Seriously Overdue');
        $this->invoice($party, 500, 100, 70);

        $result = $this->assessment($party);

        $this->assertSame('stop_credit', $result['recommendation']['key']);
        $this->assertSame(['overdue_days'], array_column($result['reasons'], 'code'));
        $this->assertSame(70, $result['reasons'][0]['value']);
        $this->assertSame(60, $result['reasons'][0]['threshold']);
    }

    public function test_bounced_cheques_and_missed_promises_stop_credit_or_limit_it_to_cheques_with_conditions(): void
    {
        $party = $this->history('Cheque Risk', [-20, -20, -20, -20]);
        $document = $this->invoice($party, 100, 5, -25);
        $cheque = $this->pay($party, $document, 50, 3, 'check', ['check_number' => 'C-1', 'check_bank' => 'Bank', 'check_due_date' => now()->addDays(5)->toDateString()]);
        $this->patchJson("/api/finance/cash-movements/{$cheque}/check-status", ['status' => 'bounced'])->assertOk();

        $one = $this->assessment($party);
        $this->assertSame('cheque_with_conditions', $one['recommendation']['key']);
        $this->assertSame(1, $one['data']['bounced_cheques']);
        $this->assertCount(3, $one['recommendation']['conditions']);
        $this->assertSame('50.0000', $one['data']['bounced_cheques_amount']);

        $second = $this->pay($party, $document, 40, 2, 'check', ['check_number' => 'C-2', 'check_bank' => 'Bank', 'check_due_date' => now()->addDays(5)->toDateString()]);
        $this->patchJson("/api/finance/cash-movements/{$second}/check-status", ['status' => 'bounced'])->assertOk();
        $this->assertSame('stop_credit', $this->assessment($party)['recommendation']['key']);

        $promiser = $this->history('Promise Breaker', [-20, -20, -20, -20]);
        foreach ([10, 20, 30] as $ago) {
            DB::table('payment_promises')->insert([
                'organization_id' => $this->organization->id, 'party_id' => $promiser, 'amount' => '100',
                'promised_on' => $this->day($ago), 'status' => 'missed', 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        $this->assertContains('missed_promises', array_column($this->assessment($promiser)['reasons'], 'code'));
        $this->assertSame('stop_credit', $this->assessment($promiser)['recommendation']['key']);
    }

    public function test_pending_cheques_count_as_exposure(): void
    {
        $party = $this->history('Pending Cheques', [-20, -20, -20, -20]);
        $document = $this->invoice($party, 300, 5, -25);
        $this->pay($party, $document, 120, 1, 'check', ['check_number' => 'P-1', 'check_bank' => 'Bank', 'check_due_date' => now()->addDays(20)->toDateString()]);

        $data = $this->assessment($party)['data'];

        $this->assertSame(1, $data['pending_cheques']);
        $this->assertSame('120.0000', $data['pending_cheques_amount']);
        $this->assertSame('300.0000', $data['exposure'], '180 still owed plus 120 in cheques that could bounce');
    }

    public function test_the_merchant_records_the_final_decision_and_may_override_and_apply_a_limit(): void
    {
        $party = $this->history('Decision Case', [-20, -20, -20, -20]);

        $this->postJson("/api/parties/{$party}/credit-decisions", ['decision' => 'insufficient_data'])->assertUnprocessable();
        $this->postJson("/api/parties/{$party}/credit-decisions", [
            'decision' => 'advance_payment', 'advance_percent' => 30, 'notes' => 'Prefers to be careful',
        ])->assertCreated()->assertJsonPath('data.overrides_recommendation', true);
        $this->postJson("/api/parties/{$party}/credit-decisions", [
            'decision' => 'credit', 'credit_limit' => '350', 'credit_days' => 30, 'apply_credit_limit' => true,
        ])->assertCreated()->assertJsonPath('data.overrides_recommendation', false);

        $this->assertEquals(350, $this->getJson("/api/parties/{$party}")->assertOk()->json('data.credit_limit'));
        $latest = $this->assessment($party)['latest_decision'];
        $this->assertSame('credit', $latest['decision']);
        $this->assertTrue($latest['applied_credit_limit']);
        $this->assertSame($this->owner->id, $latest['decided_by']);

        $history = $this->getJson("/api/parties/{$party}/credit-decisions")->assertOk()->json('data');
        $this->assertSame(['credit', 'advance_payment'], array_column($history, 'decision'));
        $this->assertSame('credit', DB::table('credit_decisions')->where('decision', 'advance_payment')->value('recommended'));
        $this->assertNotNull(json_decode((string) DB::table('credit_decisions')->value('snapshot'), true)['data']['on_time_ratio']);
    }

    public function test_only_authorized_users_of_the_same_company_can_see_or_decide(): void
    {
        $party = $this->history('Private Credit', [-20, -20, -20, -20]);

        $accountant = User::factory()->create();
        $this->organization->users()->attach($accountant->id, ['role' => 'accountant']);
        $this->as($accountant);
        $this->assertSame('credit', $this->assessment($party)['recommendation']['key']);
        $this->postJson("/api/parties/{$party}/credit-decisions", ['decision' => 'credit'])->assertForbidden();

        $employee = User::factory()->create();
        $this->organization->users()->attach($employee->id, ['role' => 'employee']);
        $this->as($employee);
        $this->getJson("/api/parties/{$party}/credit-assessment")->assertForbidden();

        $other = Organization::create(['name' => 'Other']);
        $stranger = User::factory()->create();
        $other->users()->attach($stranger->id, ['role' => 'owner']);
        $this->as($stranger, $other);
        $this->getJson("/api/parties/{$party}/credit-assessment")->assertNotFound();
        $this->postJson("/api/parties/{$party}/credit-decisions", ['decision' => 'credit'])->assertNotFound();
        $this->assertDatabaseCount('credit_decisions', 0);
    }

    public function test_the_chat_can_ask_for_a_recommendation_and_is_asked_to_clarify_ambiguous_names(): void
    {
        $this->history('Chat Customer One', [-20, -20, -20, -20]);
        $this->customer('Chat Customer Two');

        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
        $registry = app(AiBusinessToolRegistry::class);
        $conversation = AiConversation::factory()->for($this->owner)->create();

        $this->assertTrue($registry->available($this->owner, 'credit_recommendation'));

        $ok = $registry->execute($this->owner, 'credit_recommendation', ['party' => 'Chat Customer One'], $conversation);
        $this->assertSame('ok', $ok['status']);
        $this->assertSame('credit', $ok['recommendation']['key']);
        $this->assertStringContainsString('authorized merchant', $ok['disclaimer']);

        $ambiguous = $registry->execute($this->owner, 'credit_recommendation', ['party' => 'Chat Customer'], $conversation);
        $this->assertSame('needs_clarification', $ambiguous['status']);
        $this->assertCount(2, $ambiguous['candidates']);
        $this->assertSame('not_found', $registry->execute($this->owner, 'credit_recommendation', ['party' => 'Nobody Here'], $conversation)['status']);
    }
}
