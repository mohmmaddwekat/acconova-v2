<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * End-to-end customer cases: the collections statement, the alerts and the
 * credit recommendation must agree, and a cheque still in hand is never
 * treated as collected money or as a guarantee of payment.
 */
class CustomerCasesTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    protected function setUp(): void
    {
        parent::setUp();

        $owner = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Cases Co']);
        $this->organization->users()->attach($owner->id, ['role' => 'owner']);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $this->organization->id]);
    }

    private function day(int $daysAgo): string
    {
        return now()->subDays($daysAgo)->toDateString();
    }

    /**
     * @param  list<string>  $roles
     */
    private function customer(string $name, array $roles = ['customer']): int
    {
        return $this->postJson('/api/parties', ['type' => 'company', 'company_name' => $name, 'roles' => $roles])->assertCreated()->json('data.id');
    }

    private function invoice(int $party, int $amount, int $issuedDaysAgo, int $dueDaysAgo, string $kind = 'sale_invoice'): int
    {
        $id = $this->postJson('/api/finance/documents', [
            'kind' => $kind, 'party_id' => $party,
            'issue_date' => $this->day($issuedDaysAgo), 'due_date' => $this->day($dueDaysAgo),
            'activity_type' => 'services', 'market_type' => 'local', 'currency' => 'ILS', 'exchange_rate' => '1', 'shipping_total' => '0',
            'lines' => [['description' => 'Service', 'quantity' => '1', 'unit' => 'service', 'unit_price' => (string) $amount,
                'discount_percent' => '0', 'tax_rate' => '0', 'affects_inventory' => false]],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/documents/{$id}/issue", ['acknowledge_warnings' => false])->assertOk();

        return $id;
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function pay(int $party, int $document, int $amount, int $paidDaysAgo, string $method = 'cash', array $extra = []): int
    {
        $id = $this->postJson('/api/finance/cash-movements', [
            'direction' => 'incoming', 'party_id' => $party, 'category' => 'customer_receipt', 'amount' => (string) $amount,
            'currency' => 'ILS', 'movement_date' => $this->day($paidDaysAgo), 'method' => $method, 'account_label' => 'Main',
            'allocations' => [['financial_document_id' => $document, 'amount' => (string) $amount]], ...$extra,
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/cash-movements/{$id}/post")->assertOk();

        return $id;
    }

    /**
     * @return array<string, mixed>
     */
    private function cheque(int $party, int $document, int $amount, int $paidDaysAgo, int $chequeDueInDays = 10): int
    {
        return $this->pay($party, $document, $amount, $paidDaysAgo, 'check', [
            'check_number' => 'CHK-'.$document, 'check_bank' => 'Bank', 'check_due_date' => now()->addDays($chequeDueInDays)->toDateString(),
        ]);
    }

    /**
     * Four 200 invoices, due 30 days after issue and paid $lateDays after the
     * due date (negative = early). $offset moves the whole history back in time.
     *
     * @param  list<string>  $roles
     * @param  list<int>  $lateDays
     */
    private function history(string $name, array $lateDays, int $offset = 0, array $roles = ['customer']): int
    {
        $party = $this->customer($name, $roles);

        foreach ([100, 80, 60, 40] as $index => $issued) {
            $document = $this->invoice($party, 200, $issued + $offset, $issued + $offset - 30);
            $this->pay($party, $document, 200, ($issued + $offset - 30) - $lateDays[$index]);
        }

        return $party;
    }

    /**
     * @return array<string, mixed>
     */
    private function statement(int $party, string $side = 'customer'): array
    {
        return $this->getJson("/api/parties/{$party}/collections?side={$side}")->assertOk()->json('data');
    }

    /**
     * @return array<string, mixed>
     */
    private function credit(int $party): array
    {
        return $this->getJson("/api/parties/{$party}/credit-assessment")->assertOk()->json('data');
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function followUps(): array
    {
        return $this->getJson('/api/collections/follow-ups?refresh=1')->assertOk()->json('data');
    }

    private function notifications(): int
    {
        return DB::table('workspace_notifications')->where('kind', 'collection_alert')->count();
    }

    /**
     * @param  array<string, mixed>  $assessment
     * @return list<string>
     */
    private function reasonCodes(array $assessment): array
    {
        return array_column($assessment['reasons'], 'code');
    }

    public function test_a_regular_customer_has_no_alerts_and_earns_credit(): void
    {
        $party = $this->history('Regular', [-20, -20, -20, -20]);
        $this->invoice($party, 200, 5, -25);

        $statement = $this->statement($party);
        $this->assertSame('200.0000', $statement['summary']['outstanding']);
        $this->assertSame('200.0000', $statement['summary']['not_due']);
        $this->assertSame('0.0000', $statement['summary']['overdue']);

        $this->assertSame([], $this->followUps());
        $this->assertSame(0, $this->notifications());

        $credit = $this->credit($party);
        $this->assertSame('credit', $credit['recommendation']['key']);
        $this->assertSame('500.0000', $credit['recommendation']['credit_limit'], 'average monthly sales 250 x 2 months');
        $this->assertSame(30, $credit['recommendation']['credit_days']);
    }

    public function test_a_chronically_late_customer_gets_one_alert_and_cash_only(): void
    {
        $party = $this->history('Always Late', [30, 30, 30, 5]);

        $this->invoice($party, 200, 50, 20);

        $items = $this->followUps();
        $this->followUps();

        $this->assertCount(1, $items);
        $this->assertSame('200.0000', $items[0]['overdue_amount']);
        $this->assertSame(20, $items[0]['days_late']);
        $this->assertSame(1, $this->notifications(), 'evaluating again does not alert again');

        $credit = $this->credit($party);
        $this->assertSame('cash_only', $credit['recommendation']['key']);
        $this->assertContains('avg_days_late', $this->reasonCodes($credit));
    }

    public function test_a_customer_who_stopped_paying_long_ago_triggers_both_alerts_and_stops_credit(): void
    {
        $party = $this->history('Went Silent', [-20, -20, -20, -20], 100);
        $this->invoice($party, 500, 100, 70);

        $item = $this->followUps()[0];
        $this->followUps();

        $this->assertEqualsCanonicalizing(['overdue', 'stopped_paying'], array_column($item['alerts'], 'kind'));
        $this->assertSame('500.0000', $item['overdue_amount']);
        $this->assertSame(2, $this->notifications(), 'one notification per alert, never repeated by re-evaluation');

        $credit = $this->credit($party);
        $this->assertSame('stop_credit', $credit['recommendation']['key']);
        $this->assertSame(['overdue_days'], $this->reasonCodes($credit));
        $this->assertSame(70, $credit['reasons'][0]['value']);
    }

    public function test_a_partial_payment_alerts_only_for_the_unpaid_part_and_asks_for_an_advance(): void
    {
        $party = $this->history('Pays Partly', [-20, -20, -20, -20]);
        $invoice = $this->invoice($party, 500, 40, 10);
        $this->pay($party, $invoice, 200, 3);

        $statement = $this->statement($party);
        $this->assertSame('300.0000', $statement['summary']['outstanding']);
        $this->assertCount(1, $statement['partial_payments']);
        $this->assertSame('200.0000', $statement['partial_payments'][0]['cleared_paid']);
        $this->assertSame($this->day(3), $statement['summary']['last_collected_payment']['date']);

        $item = $this->followUps()[0];
        $this->assertSame('300.0000', $item['overdue_amount'], 'not the whole 500');

        $credit = $this->credit($party);
        $this->assertSame(4, $credit['data']['settled_invoices'], 'the partly paid invoice is not settled');
        $this->assertSame('advance_payment', $credit['recommendation']['key']);
        $this->assertContains('overdue_ratio', $this->reasonCodes($credit));
    }

    public function test_a_bounced_cheque_returns_the_debt_and_limits_cheques_then_stops_credit(): void
    {
        $party = $this->history('Bouncing', [-20, -20, -20, -20]);
        $invoice = $this->invoice($party, 300, 30, 10);
        $first = $this->cheque($party, $invoice, 300, 5);
        $this->patchJson("/api/finance/cash-movements/{$first}/check-status", ['status' => 'bounced'])->assertOk();

        $statement = $this->statement($party);
        $this->assertSame('300.0000', $statement['summary']['outstanding']);
        $this->assertSame('300.0000', $statement['cheques']['bounced_total']);
        $this->assertSame('0.0000', $statement['cheques']['pending_total']);
        $this->assertSame('300.0000', $this->followUps()[0]['overdue_amount']);

        $one = $this->credit($party);
        $this->assertSame('cheque_with_conditions', $one['recommendation']['key']);
        $this->assertContains('bounced_cheques', $this->reasonCodes($one));
        $this->assertNotEmpty($one['recommendation']['conditions']);

        $second = $this->cheque($party, $invoice, 100, 2);
        $this->patchJson("/api/finance/cash-movements/{$second}/check-status", ['status' => 'bounced'])->assertOk();
        $two = $this->credit($party);
        $this->assertSame('stop_credit', $two['recommendation']['key']);
        $this->assertSame(2, $two['data']['bounced_cheques']);
    }

    public function test_an_uncashed_cheque_is_not_a_payment_and_not_a_guarantee(): void
    {
        $party = $this->history('Cheque In Hand', [-20, -20, -20, -20]);
        $invoice = $this->invoice($party, 300, 40, 15);
        $cheque = $this->cheque($party, $invoice, 300, 2, 10);

        $statement = $this->statement($party);
        $this->assertSame('0.0000', $statement['summary']['ledger_outstanding'], 'finance counts the invoice as paid');
        $this->assertSame('300.0000', $statement['summary']['outstanding'], 'collections does not');
        $this->assertSame('300.0000', $statement['summary']['overdue']);
        $this->assertSame('300.0000', $statement['summary']['pending_cheques_total']);
        $this->assertTrue($statement['documents'][0]['awaiting_cheque']);
        $this->assertSame('800.0000', $statement['cheques']['cash_collected'], 'collected cash excludes the cheque');
        $this->assertSame($this->day(2), $statement['summary']['last_payment']['date']);
        $this->assertTrue($statement['summary']['last_payment']['is_pending_cheque']);
        $this->assertNotSame($this->day(2), $statement['summary']['last_collected_payment']['date']);

        $item = $this->followUps()[0];
        $this->assertSame('300.0000', $item['overdue_amount']);
        $this->assertSame('300.0000', $item['alerts'][0]['reason']['pending_cheques_total']);

        $credit = $this->credit($party);
        $this->assertSame(4, $credit['data']['settled_invoices'], 'the cheque invoice is not counted as paid');
        $this->assertSame('300.0000', $credit['data']['exposure']);
        $this->assertSame(1, $credit['data']['pending_cheques']);
        $this->assertContains('pending_cheques', $this->reasonCodes($credit));
        $this->assertNotSame('credit', $credit['recommendation']['key']);

        $this->patchJson("/api/finance/cash-movements/{$cheque}/check-status", ['status' => 'cleared'])->assertOk();
        $this->assertSame('0.0000', $this->statement($party)['summary']['outstanding']);
        $this->assertSame([], $this->followUps());
        $this->assertDatabaseHas('collection_alerts', ['party_id' => $party, 'status' => 'resolved']);
        $this->assertSame('credit', $this->credit($party)['recommendation']['key']);
    }

    public function test_exceeding_the_credit_limit_asks_for_an_advance_and_stops_credit_when_part_is_overdue(): void
    {
        $party = $this->history('Over Limit', [-20, -20, -20, -20]);
        $this->patchJson("/api/parties/{$party}", ['credit_limit' => '300'])->assertOk();
        $this->invoice($party, 400, 5, -25);

        $within = $this->credit($party);
        $this->assertSame('advance_payment', $within['recommendation']['key']);
        $this->assertSame(['within_limit'], $this->reasonCodes($within));
        $this->assertSame('400.0000', $within['data']['exposure']);
        $this->assertSame([], $this->followUps(), 'not overdue, so no collections alert');

        $this->invoice($party, 100, 50, 20);

        $over = $this->credit($party);
        $this->assertSame('stop_credit', $over['recommendation']['key']);
        $this->assertSame(['over_limit_overdue'], $this->reasonCodes($over));
        $this->assertCount(1, $this->followUps());
    }

    public function test_missing_payment_history_is_stated_instead_of_guessed(): void
    {
        $new = $this->customer('Brand New');
        $this->invoice($new, 100, 10, 5);

        $credit = $this->credit($new);
        $this->assertSame('insufficient_data', $credit['recommendation']['key']);
        $this->assertFalse($credit['sufficiency']['enough']);
        $this->assertContains('insufficient_history_invoices', $this->reasonCodes($credit));
        $this->assertContains('insufficient_paid_invoices', $this->reasonCodes($credit));
        $this->assertSame('advance_payment', $credit['recommendation']['fallback']);
        $this->assertSame([], $this->followUps(), 'five days late is below the alert threshold');

        $few = $this->customer('Two Invoices');
        foreach ([100, 80] as $issued) {
            $this->pay($few, $this->invoice($few, 100, $issued, $issued - 30), 100, $issued - 30);
        }
        $this->assertSame('insufficient_data', $this->credit($few)['recommendation']['key']);
    }

    public function test_a_customer_who_is_also_a_supplier_keeps_the_two_sides_apart(): void
    {
        $party = $this->history('Both Sides', [-20, -20, -20, -20], 0, ['customer', 'supplier']);
        $this->invoice($party, 1000, 120, 90, 'purchase_invoice');

        $this->assertSame('credit', $this->credit($party)['recommendation']['key'], 'what we owe them does not change their credit');
        $this->assertSame([], $this->followUps());

        $supplier = $this->statement($party, 'supplier');
        $this->assertSame('1000.0000', $supplier['summary']['overdue']);
        $this->assertSame('0.0000', $this->statement($party)['summary']['outstanding']);

        $account = $this->getJson("/api/parties/{$party}/account?scope=all&date_from={$this->day(300)}&date_to=".now()->toDateString())->assertOk()->json();
        $this->assertSame('1000.0000', $account['positions']['supplier']);
        $this->assertSame('0.0000', $account['positions']['customer']);
        $this->assertFalse($account['reconciliation']['auto_netting']);
        $this->assertDatabaseCount('party_settlements', 0);
        $this->assertTrue($this->statement($party)['reconciliation']['reconciled']);
        $this->assertTrue($supplier['reconciliation']['reconciled']);
    }
}
