<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Models\WorkspaceRole;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PartyCollectionsTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private User $owner;

    private int $partyId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Collections Co']);
        $this->organization->users()->attach($this->owner->id, ['role' => 'owner']);
        $this->as($this->owner);

        $this->partyId = $this->postJson('/api/parties', [
            'type' => 'company', 'company_name' => 'Slow Payer Ltd', 'roles' => ['customer', 'supplier'],
        ])->assertCreated()->json('data.id');
    }

    private function as(User $user): void
    {
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $this->organization->id]);
    }

    private function day(int $daysAgo): string
    {
        return now()->subDays($daysAgo)->toDateString();
    }

    private function invoice(string $kind, int $amount, int $issuedDaysAgo, int $dueDaysAgo): int
    {
        $id = $this->postJson('/api/finance/documents', [
            'kind' => $kind,
            'party_id' => $this->partyId,
            'issue_date' => $this->day($issuedDaysAgo),
            'due_date' => $this->day($dueDaysAgo),
            'activity_type' => 'services',
            'market_type' => 'local',
            'currency' => 'ILS',
            'exchange_rate' => '1',
            'shipping_total' => '0',
            'lines' => [[
                'description' => 'Service', 'quantity' => '1', 'unit' => 'service', 'unit_price' => (string) $amount,
                'discount_percent' => '0', 'tax_rate' => '0', 'affects_inventory' => false,
            ]],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/documents/{$id}/issue", ['acknowledge_warnings' => false])->assertOk();

        return $id;
    }

    /**
     * @param  list<array{financial_document_id: int, amount: string}>  $allocations
     */
    private function receipt(int $amount, int $daysAgo, string $method = 'cash', array $allocations = [], array $extra = []): int
    {
        $id = $this->postJson('/api/finance/cash-movements', [
            'direction' => 'incoming',
            'party_id' => $this->partyId,
            'category' => 'customer_receipt',
            'amount' => (string) $amount,
            'currency' => 'ILS',
            'movement_date' => $this->day($daysAgo),
            'method' => $method,
            'account_label' => 'Main',
            'allocations' => $allocations,
            ...$extra,
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/cash-movements/{$id}/post")->assertOk();

        return $id;
    }

    /**
     * @return array<string, mixed>
     */
    private function statement(string $query = ''): array
    {
        return $this->getJson("/api/parties/{$this->partyId}/collections{$query}")->assertOk()->json('data');
    }

    /**
     * Not due 100, 40 days late 200 (50 paid in cash), 100 days late 300 (80 by pending cheque).
     *
     * @return array{notDue: int, late: int, veryLate: int, cheque: int}
     */
    private function scenario(): array
    {
        $notDue = $this->invoice('sale_invoice', 100, 10, -20);
        $late = $this->invoice('sale_invoice', 200, 70, 40);
        $veryLate = $this->invoice('sale_invoice', 300, 130, 100);

        $this->receipt(50, 5, 'cash', [['financial_document_id' => $late, 'amount' => '50']]);
        $cheque = $this->receipt(80, 3, 'check', [['financial_document_id' => $veryLate, 'amount' => '80']], [
            'check_number' => 'CHK-77', 'check_bank' => 'Local Bank', 'check_due_date' => now()->addDays(10)->toDateString(),
        ]);

        return ['notDue' => $notDue, 'late' => $late, 'veryLate' => $veryLate, 'cheque' => $cheque];
    }

    public function test_outstanding_is_split_into_not_due_and_overdue_with_aging_buckets(): void
    {
        $this->scenario();

        $data = $this->statement();

        $this->assertSame('470.0000', $data['summary']['outstanding']);
        $this->assertSame('100.0000', $data['summary']['not_due']);
        $this->assertSame('370.0000', $data['summary']['overdue']);
        $this->assertSame(100, $data['summary']['oldest_overdue_days']);
        $this->assertSame('100.0000', $data['aging']['not_due']);
        $this->assertSame('150.0000', $data['aging']['days_31_60']);
        $this->assertSame('220.0000', $data['aging']['over_90']);
        $this->assertSame('0.0000', $data['aging']['days_1_30']);

        $states = collect($data['documents'])->pluck('state', 'total')->all();
        $this->assertEquals(['100.0000' => 'not_due', '200.0000' => 'overdue', '300.0000' => 'overdue'], $states);
    }

    public function test_last_payment_partial_payments_and_pending_cheques_are_distinguished_from_cash(): void
    {
        $ids = $this->scenario();

        $data = $this->statement();

        $this->assertSame($this->day(3), $data['summary']['last_payment']['date']);
        $this->assertTrue($data['summary']['last_payment']['is_pending_cheque']);
        $this->assertSame(3, $data['summary']['days_since_last_payment']);

        $this->assertCount(2, $data['partial_payments']);
        $veryLate = collect($data['documents'])->firstWhere('id', $ids['veryLate']);
        $this->assertSame('80.0000', $veryLate['pending_cheque_paid']);
        $this->assertSame('0.0000', $veryLate['cleared_paid']);
        $this->assertSame('220.0000', $veryLate['balance_due']);
        $this->assertSame('300.0000', $veryLate['balance_if_cheques_bounce']);

        $late = collect($data['documents'])->firstWhere('id', $ids['late']);
        $this->assertSame('50.0000', $late['cleared_paid']);
        $this->assertSame($this->day(5), $late['last_payment_on']);

        $this->assertSame('50.0000', $data['cheques']['cash_collected']);
        $this->assertSame('80.0000', $data['cheques']['pending_total']);
        $this->assertSame(1, $data['cheques']['pending_count']);
        $this->assertSame('CHK-77', $data['cheques']['pending'][0]['check_number']);
        $this->assertSame(10, $data['cheques']['pending'][0]['days_to_due']);
    }

    public function test_a_cleared_cheque_becomes_collected_and_a_bounced_one_returns_to_the_balance(): void
    {
        $ids = $this->scenario();

        $this->patchJson("/api/finance/cash-movements/{$ids['cheque']}/check-status", ['status' => 'cleared'])->assertOk();
        $cleared = $this->statement();
        $this->assertSame('130.0000', $cleared['cheques']['cash_collected']);
        $this->assertSame('0.0000', $cleared['cheques']['pending_total']);
        $this->assertSame('470.0000', $cleared['summary']['outstanding']);

        $this->patchJson("/api/finance/cash-movements/{$ids['cheque']}/check-status", ['status' => 'bounced'])->assertOk();
        $bounced = $this->statement();
        $this->assertSame('550.0000', $bounced['summary']['outstanding']);
        $this->assertSame('80.0000', $bounced['cheques']['bounced_total']);
        $this->assertSame('300.0000', collect($bounced['documents'])->firstWhere('id', $ids['veryLate'])['balance_due']);
        $this->assertTrue($bounced['reconciliation']['reconciled']);
    }

    public function test_the_statement_reconciles_with_the_finance_ledger(): void
    {
        $this->scenario();
        $this->receipt(40, 1);
        $this->patchJson("/api/parties/{$this->partyId}/opening-balances", [
            'customer' => ['amount' => '1000', 'as_of_date' => $this->day(200)],
        ])->assertOk();

        $reconciliation = $this->statement()['reconciliation'];

        $this->assertSame('1000.0000', $reconciliation['opening_balance']);
        $this->assertSame('470.0000', $reconciliation['documents_outstanding']);
        $this->assertSame('40.0000', $reconciliation['unapplied_receipts']);
        $this->assertSame($reconciliation['expected_position'], $reconciliation['ledger_position']);
        $this->assertSame('1430.0000', $reconciliation['ledger_position']);
        $this->assertTrue($reconciliation['reconciled']);

        $account = $this->getJson("/api/parties/{$this->partyId}/account?scope=customer&date_from={$this->day(300)}&date_to=".now()->toDateString())->json();
        $this->assertSame('1430.0000', $account['positions']['customer']);
    }

    public function test_the_supplier_side_is_reported_separately_for_a_dual_role_party(): void
    {
        $this->scenario();
        $this->invoice('purchase_invoice', 400, 50, 20);

        $supplier = $this->statement('?side=supplier');

        $this->assertSame('supplier', $supplier['side']);
        $this->assertSame('400.0000', $supplier['summary']['outstanding']);
        $this->assertSame('400.0000', $supplier['summary']['overdue']);
        $this->assertSame([], $supplier['promises']);
        $this->assertTrue($supplier['reconciliation']['reconciled']);
        $this->assertSame('470.0000', $this->statement()['summary']['outstanding']);
    }

    public function test_promises_and_follow_ups_are_shown_with_their_lateness(): void
    {
        $ids = $this->scenario();

        DB::table('payment_promises')->insert([
            'organization_id' => $this->organization->id, 'party_id' => $this->partyId, 'financial_document_id' => $ids['late'],
            'amount' => '150', 'promised_on' => $this->day(2), 'status' => 'open', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('payment_promises')->insert([
            'organization_id' => $this->organization->id, 'party_id' => $this->partyId, 'financial_document_id' => $ids['veryLate'],
            'amount' => '220', 'promised_on' => now()->addDays(5)->toDateString(), 'status' => 'open', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('record_reminders')->insert([
            'organization_id' => $this->organization->id, 'record_type' => 'party', 'record_id' => $this->partyId, 'user_id' => $this->owner->id,
            'note' => 'Call the accountant', 'due_at' => now()->subDay(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        $data = $this->statement();

        $this->assertSame([true, false], array_column($data['promises'], 'late'));
        $this->assertSame('150.0000', $data['promises'][0]['amount']);
        $this->assertCount(1, $data['follow_ups']);
        $this->assertTrue($data['follow_ups'][0]['overdue']);
        $this->assertSame('Call the accountant', $data['follow_ups'][0]['note']);
    }

    public function test_as_of_date_moves_documents_from_not_due_to_overdue_and_ignores_later_payments(): void
    {
        $this->scenario();

        $earlier = $this->statement('?as_of='.$this->day(30));

        $this->assertSame($this->day(30), $earlier['as_of']);
        $this->assertSame('0.0000', $earlier['cheques']['pending_total']);
        $this->assertSame('0.0000', $earlier['cheques']['cash_collected']);
        $this->assertSame('500.0000', $earlier['summary']['outstanding'], 'the 100 invoice was not issued yet; payments came later');
    }

    public function test_access_depends_on_the_side_permission_cash_view_and_company(): void
    {
        $this->scenario();

        $employee = User::factory()->create();
        $this->organization->users()->attach($employee->id, ['role' => 'employee']);
        $this->as($employee);
        $this->getJson("/api/parties/{$this->partyId}/collections")->assertForbidden();

        $viewer = User::factory()->create();
        $this->organization->users()->attach($viewer->id, ['role' => 'employee']);
        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
        $role = WorkspaceRole::create(['name' => 'Sales viewer', 'base_role' => 'employee', 'is_custom' => true, 'permissions' => ['parties.view', 'finance.sales.view']]);
        DB::table('memberships')->where('user_id', $viewer->id)->update(['workspace_role_id' => $role->id]);
        $this->as($viewer);

        $data = $this->getJson("/api/parties/{$this->partyId}/collections")->assertOk()->json('data');
        $this->assertSame('470.0000', $data['summary']['outstanding']);
        $this->assertNull($data['cheques']);
        $this->assertNull($data['summary']['last_payment']);
        $this->getJson("/api/parties/{$this->partyId}/collections?side=supplier")->assertForbidden();

        $other = Organization::create(['name' => 'Other Co']);
        $stranger = User::factory()->create();
        $other->users()->attach($stranger->id, ['role' => 'owner']);
        $this->actingAs($stranger)->withSession([OrganizationAccess::SESSION_KEY => $other->id]);
        $this->getJson("/api/parties/{$this->partyId}/collections")->assertNotFound();
    }
}
