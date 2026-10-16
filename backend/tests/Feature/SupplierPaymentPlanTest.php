<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The plan proposes, it never pays: it stays inside the cash available in the
 * chosen scenario after the reserve, marks what depends on expected money, and
 * leaves the books, the audit trail and the permissions alone.
 */
class SupplierPaymentPlanTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Plan Co']);
        $this->organization->users()->attach($this->owner->id, ['role' => 'owner']);
        $this->as($this->owner);
    }

    private function as(User $user): void
    {
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $this->organization->id]);
    }

    private function day(int $daysAgo): string
    {
        return now()->subDays($daysAgo)->toDateString();
    }

    /**
     * @param  list<string>  $roles
     */
    private function party(string $name, array $roles): int
    {
        return $this->postJson('/api/parties', ['type' => 'company', 'company_name' => $name, 'roles' => $roles])->assertCreated()->json('data.id');
    }

    private function invoice(int $party, int $amount, int $dueInDays, string $kind): int
    {
        $id = $this->postJson('/api/finance/documents', [
            'kind' => $kind, 'party_id' => $party,
            'issue_date' => $this->day(40), 'due_date' => $this->day(-$dueInDays),
            'activity_type' => 'services', 'market_type' => 'local', 'currency' => 'ILS', 'exchange_rate' => '1', 'shipping_total' => '0',
            'lines' => [['description' => 'Goods', 'quantity' => '1', 'unit' => 'service', 'unit_price' => (string) $amount,
                'discount_percent' => '0', 'tax_rate' => '0', 'affects_inventory' => false]],
        ])->assertCreated()->json('data.id');
        $this->postJson("/api/finance/documents/{$id}/issue", ['acknowledge_warnings' => false])->assertOk();

        return $id;
    }

    private function cash(int $amount): void
    {
        $id = $this->postJson('/api/finance/cash-movements', [
            'direction' => 'incoming', 'category' => 'capital', 'amount' => (string) $amount, 'currency' => 'ILS',
            'movement_date' => $this->day(1), 'method' => 'cash', 'account_label' => 'Main',
        ])->assertCreated()->json('data.id');
        $this->postJson("/api/finance/cash-movements/{$id}/post")->assertOk();
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function receive(int $party, int $document, int $amount, array $extra = []): int
    {
        $id = $this->postJson('/api/finance/cash-movements', [
            'direction' => 'incoming', 'party_id' => $party, 'category' => 'customer_receipt', 'amount' => (string) $amount, 'currency' => 'ILS',
            'movement_date' => $this->day(0), 'method' => 'cash', 'account_label' => 'Main',
            'allocations' => [['financial_document_id' => $document, 'amount' => (string) $amount]], ...$extra,
        ])->assertCreated()->json('data.id');
        $this->postJson("/api/finance/cash-movements/{$id}/post")->assertOk();

        return $id;
    }

    /**
     * @param  array<string, mixed>  $policy
     */
    private function policy(array $policy): void
    {
        $this->putJson('/api/finance/supplier-payment-policy', $policy)->assertOk();
    }

    /**
     * @return array<string, mixed>
     */
    private function proposal(string $scenario, array $extra = []): array
    {
        return $this->postJson('/api/finance/supplier-payment-proposal', ['scenario' => $scenario, 'horizon_days' => 30, 'delay_days' => 14, ...$extra])->assertOk()->json('data');
    }

    /**
     * @param  array<string, mixed>  $proposal
     * @return list<array<string, mixed>>
     */
    private function paymentsFor(array $proposal, int $party): array
    {
        return array_values(array_filter($proposal['payments'], fn (array $payment): bool => $payment['party_id'] === $party));
    }

    /**
     * @param  array<string, mixed>  $proposal
     * @return list<string>
     */
    private function warningCodes(array $proposal): array
    {
        return array_column($proposal['warnings'], 'code');
    }

    /**
     * Cash 1000 with a reserve of 200: an important supplier due in 5 days (600), a normal one
     * due in 3 days (500), one already late (300), and a customer who owes 400 in 10 days.
     *
     * @return array<string, int>
     */
    private function market(): array
    {
        $this->cash(1000);
        $this->policy(['operating_reserve' => '200']);

        $critical = $this->party('Critical Supplier', ['supplier']);
        $normal = $this->party('Normal Supplier', ['supplier']);
        $late = $this->party('Late Supplier', ['supplier']);
        $customer = $this->party('Customer', ['customer']);
        $this->policy(['party_priorities' => [(string) $critical => 'critical']]);

        $this->invoice($critical, 600, 5, 'purchase_invoice');
        $this->invoice($normal, 500, 3, 'purchase_invoice');
        $this->invoice($late, 300, -20, 'purchase_invoice');
        $this->invoice($customer, 400, 10, 'sale_invoice');

        return compact('critical', 'normal', 'late', 'customer');
    }

    public function test_the_plan_never_pays_more_than_the_cash_above_the_reserve_and_pays_the_important_supplier_first(): void
    {
        $ids = $this->market();

        $confirmed = $this->proposal('confirmed_only');

        $this->assertSame('800.0000', $confirmed['totals']['planned'], 'cash 1000 minus the 200 reserve, nothing more');
        $critical = $this->paymentsFor($confirmed, $ids['critical']);
        $this->assertCount(1, $critical);
        $this->assertSame('full', $critical[0]['kind']);
        $this->assertSame('600.0000', $critical[0]['amount']);
        $this->assertSame(now()->addDays(5)->toDateString(), $critical[0]['pay_on']);

        $late = $this->paymentsFor($confirmed, $ids['late']);
        $this->assertSame('partial', $late[0]['kind'], 'only part of the late invoice fits what is left');
        $this->assertSame('200.0000', $late[0]['amount']);
        $this->assertSame([], $this->paymentsFor($confirmed, $ids['normal']), 'nothing is left for the normal supplier');
        $this->assertSame('600.0000', $confirmed['totals']['unfunded']);
        $this->assertContains('cash_shortfall', $this->warningCodes($confirmed));
        $this->assertSame([], array_filter($confirmed['payments'], fn (array $payment): bool => $payment['depends_on_expected']));
        $this->assertStringContainsString('No transfer', $confirmed['disclaimer']);

        foreach ($confirmed['balance_path'] as $point) {
            $this->assertGreaterThanOrEqual(200.0, (float) $point['balance_confirmed_only'], 'the reserve is never breached');
        }
    }

    public function test_money_that_is_only_expected_is_marked_and_a_late_collection_is_flagged(): void
    {
        $ids = $this->market();

        $expected = $this->proposal('expected');

        $this->assertSame('900.0000', $expected['totals']['planned']);
        $this->assertSame('500.0000', $expected['totals']['unfunded'], 'the normal supplier still cannot be paid');
        $remainder = collect($this->paymentsFor($expected, $ids['late']))->firstWhere('kind', 'remainder');
        $this->assertSame('100.0000', $remainder['amount']);
        $this->assertTrue($remainder['depends_on_expected']);
        $this->assertContains('customer_invoice', $remainder['depends_on']);
        $this->assertSame(now()->addDays(10)->toDateString(), $remainder['pay_on'], 'on the day the customer is expected to pay');
        $this->assertFalse(collect($this->paymentsFor($expected, $ids['critical']))->first()['depends_on_expected']);
        $this->assertSame('100.0000', $expected['totals']['depends_on_expected_receipts']);

        $risk = $expected['late_collection_risk'];
        $this->assertTrue($risk['breaches_reserve']);
        $this->assertSame('100.0000', $risk['shortfall_against_reserve']);
        $this->assertContains('late_collection_risk', $this->warningCodes($expected));

        $this->assertLessThanOrEqual(
            (float) $expected['opening']['confirmed_cash'] + 200.0,
            (float) $expected['totals']['planned'] - 0.0001,
            'with the 200 expected receipt the plan stays within cash plus that receipt, minus the reserve',
        );
    }

    public function test_a_pending_cheque_is_not_cash_and_the_partial_payment_waits_for_it(): void
    {
        $this->cash(500);
        $this->policy(['operating_reserve' => '100']);
        $supplier = $this->party('Cheque Supplier', ['supplier']);
        $customer = $this->party('Cheque Customer', ['customer']);
        $this->invoice($supplier, 600, 1, 'purchase_invoice');
        $document = $this->invoice($customer, 300, 5, 'sale_invoice');
        $this->receive($customer, $document, 300, ['method' => 'check', 'check_number' => 'C-1', 'check_bank' => 'Bank', 'check_due_date' => now()->addDays(2)->toDateString()]);

        $confirmed = $this->proposal('confirmed_only');
        $this->assertSame('400.0000', $confirmed['totals']['planned'], 'the cheque in hand is not counted as cash');
        $this->assertSame('partial', $this->paymentsFor($confirmed, $supplier)[0]['kind']);
        $this->assertSame('200.0000', $confirmed['totals']['unfunded']);

        $expected = $this->proposal('expected');
        $this->assertSame('600.0000', $expected['totals']['planned']);
        $rest = collect($this->paymentsFor($expected, $supplier))->firstWhere('kind', 'remainder');
        $this->assertSame('200.0000', $rest['amount']);
        $this->assertTrue($rest['depends_on_expected']);
        $this->assertContains('cheque_in', $rest['depends_on']);
        $this->assertSame(now()->addDays(2)->toDateString(), $rest['pay_on'], 'when the cheque is due, not before');
    }

    public function test_a_plan_is_a_draft_until_approved_and_approval_moves_no_money(): void
    {
        $this->market();
        $movements = DB::table('cash_movements')->count();
        $balances = DB::table('financial_documents')->sum('balance_due');

        $plan = $this->postJson('/api/finance/supplier-payment-plans', ['scenario' => 'confirmed_only'])->assertCreated()->json('data');
        $this->assertSame('draft', $plan['status']);
        $this->assertNotEmpty($plan['items']);
        $this->assertNotEmpty($plan['notice']);

        $this->postJson("/api/finance/supplier-payment-plans/{$plan['id']}/approve")->assertOk()->assertJsonPath('data.status', 'approved');
        $this->postJson("/api/finance/supplier-payment-plans/{$plan['id']}/approve")->assertUnprocessable();

        $this->assertSame($movements, DB::table('cash_movements')->count(), 'no payment is recorded');
        $this->assertEquals($balances, DB::table('financial_documents')->sum('balance_due'), 'no invoice balance changes');
        $this->assertSame(['generated', 'approved'], DB::table('finance_audit_events')->where('auditable_type', 'SupplierPaymentPlan')->orderBy('id')->pluck('action')->all());
    }

    public function test_refreshing_after_a_real_payment_updates_the_plan(): void
    {
        $ids = $this->market();
        $plan = $this->postJson('/api/finance/supplier-payment-plans', ['scenario' => 'confirmed_only'])->assertCreated()->json('data');

        $customerDocument = (int) DB::table('financial_documents')->where('party_id', $ids['customer'])->value('id');
        $this->receive($ids['customer'], $customerDocument, 400);

        $refreshed = $this->postJson("/api/finance/supplier-payment-plans/{$plan['id']}/refresh")->assertOk()->json();

        $this->assertSame('1400.0000', $this->proposal('confirmed_only')['opening']['confirmed_cash'], 'the collection is now cleared cash');
        $this->assertNotSame($plan['id'], $refreshed['data']['id']);
        $this->assertSame($plan['id'], $refreshed['data']['previous_plan_id']);
        $this->assertNotEmpty($refreshed['changes']);
        $this->assertSame('superseded', $this->getJson("/api/finance/supplier-payment-plans/{$plan['id']}")->json('data.status'));
        $this->assertGreaterThan((float) $plan['plan']['totals']['planned'], (float) $refreshed['data']['plan']['totals']['planned'], 'more cash means more can be paid');
    }

    public function test_a_stale_plan_cannot_be_approved_and_rules_and_approval_need_rights(): void
    {
        $this->market();
        $plan = $this->postJson('/api/finance/supplier-payment-plans', [])->assertCreated()->json('data');

        $this->travel(2)->days();
        $this->postJson("/api/finance/supplier-payment-plans/{$plan['id']}/approve")->assertUnprocessable();
        $this->travelBack();

        $employee = User::factory()->create();
        $this->organization->users()->attach($employee->id, ['role' => 'employee']);
        $this->as($employee);

        $this->getJson('/api/finance/supplier-payment-policy')->assertForbidden();
        $this->postJson('/api/finance/supplier-payment-proposal', [])->assertForbidden();
        $this->putJson('/api/finance/supplier-payment-policy', ['operating_reserve' => '0'])->assertForbidden();
        $this->postJson("/api/finance/supplier-payment-plans/{$plan['id']}/approve")->assertForbidden();
    }

    public function test_a_party_who_is_both_customer_and_supplier_is_planned_on_the_supplier_side_with_the_offset_noted(): void
    {
        $this->cash(1000);
        $dual = $this->party('Both Ways', ['customer', 'supplier']);
        $this->patchJson("/api/parties/{$dual}/opening-balances", [
            'customer' => ['amount' => '500', 'as_of_date' => '2026-01-01'],
            'supplier' => ['amount' => '300', 'as_of_date' => '2026-01-01'],
        ])->assertOk();

        $plan = $this->proposal('confirmed_only');
        $payment = $this->paymentsFor($plan, $dual)[0];
        $this->assertSame('300.0000', $payment['amount'], 'only what we owe as a supplier, never the customer side');
        $this->assertContains('also_customer', array_column($payment['reasons'], 'code'));
        $this->assertContains('carried_balance', array_column($payment['reasons'], 'code'));
    }

    public function test_an_approved_settlement_lowers_the_payment_and_a_rejected_one_changes_nothing_while_the_net_position_holds(): void
    {
        $this->cash(1000);
        $dual = $this->party('Both Ways', ['customer', 'supplier']);
        $this->patchJson("/api/parties/{$dual}/opening-balances", [
            'customer' => ['amount' => '500', 'as_of_date' => '2026-01-01'],
            'supplier' => ['amount' => '300', 'as_of_date' => '2026-01-01'],
        ])->assertOk();

        $positions = fn (): array => $this->getJson("/api/parties/{$dual}/account?scope=all&date_from=2026-01-01&date_to=".now()->toDateString())->assertOk()->json('positions');
        $body = fn (string $reference): array => ['amount' => '200', 'settlement_date' => now()->toDateString(), 'agreement_reference' => $reference, 'agreement_date' => now()->toDateString(), 'agreement_notes' => 'Signed'];

        $before = $positions();
        $this->assertSame('300.0000', $this->paymentsFor($this->proposal('confirmed_only'), $dual)[0]['amount']);

        $rejected = $this->postJson("/api/parties/{$dual}/settlements", $body('AGR-R'))->assertCreated()->json('data.id');
        $this->postJson("/api/parties/{$dual}/settlements/{$rejected}/reject", ['reason' => 'Not agreed'])->assertOk();
        $this->assertSame($before, $positions(), 'a rejected settlement changes no balance');
        $this->assertSame('300.0000', $this->paymentsFor($this->proposal('confirmed_only'), $dual)[0]['amount']);

        $approved = $this->postJson("/api/parties/{$dual}/settlements", $body('AGR-A'))->assertCreated()->json('data.id');
        $this->postJson("/api/parties/{$dual}/settlements/{$approved}/approve")->assertOk();
        $after = $positions();

        $this->assertSame('300.0000', $after['customer']);
        $this->assertSame('100.0000', $after['supplier']);
        $this->assertEquals((float) $before['customer'] - (float) $before['supplier'], (float) $after['customer'] - (float) $after['supplier'], 'what the party owes us net of what we owe them is unchanged');
        $this->assertSame('100.0000', $this->paymentsFor($this->proposal('confirmed_only'), $dual)[0]['amount'], 'the plan pays only what is still owed after the offset');
    }
}
