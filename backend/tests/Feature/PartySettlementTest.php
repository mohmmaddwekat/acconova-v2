<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PartySettlementTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private User $owner;

    private int $partyId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Dual Ledger']);
        $this->organization->users()->attach($this->owner->id, ['role' => 'owner']);

        $this->as($this->owner);

        $this->partyId = $this->postJson('/api/parties', [
            'type' => 'company', 'company_name' => 'Dual Trading Co', 'roles' => ['customer', 'supplier'],
        ])->assertCreated()->json('data.id');

        $this->setOpening(500, 300);
    }

    private function as(User $user): void
    {
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $this->organization->id]);
    }

    private function member(string $role): User
    {
        $user = User::factory()->create();
        $this->organization->users()->attach($user->id, ['role' => $role]);

        return $user;
    }

    private function setOpening(int $customer, int $supplier): void
    {
        $this->patchJson("/api/parties/{$this->partyId}/opening-balances", [
            'customer' => ['amount' => (string) $customer, 'as_of_date' => '2026-01-01'],
            'supplier' => ['amount' => (string) $supplier, 'as_of_date' => '2026-01-01'],
        ])->assertOk();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function body(array $overrides = []): array
    {
        return [
            'amount' => '200',
            'settlement_date' => now()->toDateString(),
            'agreement_reference' => 'AGR-2026-001',
            'agreement_date' => now()->toDateString(),
            'agreement_notes' => 'Signed offset agreement',
            ...$overrides,
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function requestSettlement(array $overrides = []): int
    {
        return $this->postJson("/api/parties/{$this->partyId}/settlements", $this->body($overrides))->assertCreated()->json('data.id');
    }

    /**
     * @return array<string, mixed>
     */
    private function account(): array
    {
        return $this->getJson("/api/parties/{$this->partyId}/account?scope=all&date_from=2026-01-01&date_to=".now()->toDateString())
            ->assertOk()->json();
    }

    /**
     * @return list<string>
     */
    private function auditActions(): array
    {
        return DB::table('finance_audit_events')->where('auditable_type', 'PartySettlement')->orderBy('id')->pluck('action')->all();
    }

    public function test_one_party_keeps_receivable_and_payable_separate_with_totals_per_side(): void
    {
        $account = $this->account();

        $this->assertSame('500.0000', $account['positions']['customer']);
        $this->assertSame('300.0000', $account['positions']['supplier']);
        $this->assertSame('500.0000', $account['sides']['customer']['closing']);
        $this->assertSame('300.0000', $account['sides']['supplier']['closing']);
        $this->assertSame('300.0000', $account['reconciliation']['nettable']);
        $this->assertFalse($account['reconciliation']['auto_netting']);
        $this->assertDatabaseCount('parties', 1);
    }

    public function test_nothing_is_netted_until_a_settlement_is_approved(): void
    {
        $this->requestSettlement();

        $account = $this->account();

        $this->assertSame('500.0000', $account['positions']['customer']);
        $this->assertSame('300.0000', $account['positions']['supplier']);
        $this->assertSame('200.0000', $account['reconciliation']['pending_settlement']);
        $this->assertSame('100.0000', $account['reconciliation']['nettable']);
    }

    public function test_an_approved_settlement_reduces_both_sides_and_is_recorded_in_the_statement_and_audit(): void
    {
        $id = $this->requestSettlement();

        $this->postJson("/api/parties/{$this->partyId}/settlements/{$id}/approve")->assertOk()->assertJsonPath('data.status', 'posted');

        $account = $this->account();
        $this->assertSame('300.0000', $account['positions']['customer']);
        $this->assertSame('100.0000', $account['positions']['supplier']);
        $this->assertSame('-200.0000', $account['sides']['customer']['settlements']);
        $this->assertSame('-200.0000', $account['sides']['supplier']['settlements']);
        $this->assertSame('300.0000', $account['sides']['customer']['closing']);

        $lines = collect($account['transactions'])->where('type', 'settlement');
        $this->assertCount(2, $lines);
        $this->assertSame('AGR-2026-001', $lines->first()['reference']);

        $this->assertSame(['settlement.requested', 'settlement.posted'], $this->auditActions());
        $this->assertSame($this->owner->id, DB::table('finance_audit_events')->where('action', 'settlement.posted')->value('created_by'));
    }

    public function test_a_valid_agreement_and_available_balances_are_required(): void
    {
        $url = "/api/parties/{$this->partyId}/settlements";

        $this->postJson($url, $this->body(['agreement_reference' => '']))->assertUnprocessable()->assertJsonValidationErrors('agreement_reference');
        $this->postJson($url, $this->body(['amount' => '301']))->assertUnprocessable()->assertJsonValidationErrors('amount');
        $this->postJson($url, $this->body(['amount' => '0']))->assertUnprocessable()->assertJsonValidationErrors('amount');
        $this->postJson($url, $this->body(['agreement_date' => now()->addDay()->toDateString()]))->assertUnprocessable()->assertJsonValidationErrors('agreement_date');
        $this->postJson($url, $this->body(['settlement_date' => '2025-12-31']))->assertUnprocessable();

        $single = $this->postJson('/api/parties', ['type' => 'person', 'name' => 'Only Customer', 'roles' => ['customer']])->json('data.id');
        $this->postJson("/api/parties/{$single}/settlements", $this->body())->assertUnprocessable()->assertJsonValidationErrors('party');

        $this->assertDatabaseCount('party_settlements', 0);
    }

    public function test_pending_requests_cannot_exceed_what_can_be_settled(): void
    {
        $this->requestSettlement(['amount' => '200']);

        $this->postJson("/api/parties/{$this->partyId}/settlements", $this->body(['amount' => '150']))
            ->assertUnprocessable()->assertJsonValidationErrors('amount');
        $this->requestSettlement(['amount' => '100', 'agreement_reference' => 'AGR-2026-002']);
    }

    public function test_a_different_reviewer_is_needed_except_for_the_owner(): void
    {
        $adminOne = $this->member('admin');
        $adminTwo = $this->member('admin');
        $accountant = $this->member('accountant');

        $this->as($accountant);
        $byAccountant = $this->requestSettlement();
        $this->postJson("/api/parties/{$this->partyId}/settlements/{$byAccountant}/approve")->assertForbidden();

        $this->as($adminOne);
        $byAdmin = $this->requestSettlement(['amount' => '50', 'agreement_reference' => 'AGR-2']);
        $this->postJson("/api/parties/{$this->partyId}/settlements/{$byAdmin}/approve")->assertUnprocessable()->assertJsonValidationErrors('approver');

        $this->as($adminTwo);
        $this->postJson("/api/parties/{$this->partyId}/settlements/{$byAdmin}/approve")->assertOk();
    }

    public function test_reject_and_reverse_need_a_reason_and_restore_the_balances(): void
    {
        $rejected = $this->requestSettlement(['amount' => '50', 'agreement_reference' => 'AGR-R']);
        $this->postJson("/api/parties/{$this->partyId}/settlements/{$rejected}/reject", ['reason' => ''])->assertUnprocessable();
        $this->postJson("/api/parties/{$this->partyId}/settlements/{$rejected}/reject", ['reason' => 'Terms not agreed'])->assertOk()->assertJsonPath('data.status', 'rejected');
        $this->postJson("/api/parties/{$this->partyId}/settlements/{$rejected}/approve")->assertUnprocessable();

        $id = $this->requestSettlement();
        $this->postJson("/api/parties/{$this->partyId}/settlements/{$id}/approve")->assertOk();
        $this->assertSame('300.0000', $this->account()['positions']['customer']);

        $this->postJson("/api/parties/{$this->partyId}/settlements/{$id}/reverse", [])->assertUnprocessable();
        $this->postJson("/api/parties/{$this->partyId}/settlements/{$id}/reverse", ['reason' => 'Agreement cancelled'])->assertOk()->assertJsonPath('data.status', 'reversed');

        $account = $this->account();
        $this->assertSame('500.0000', $account['positions']['customer']);
        $this->assertSame('300.0000', $account['positions']['supplier']);
        $this->postJson("/api/parties/{$this->partyId}/settlements/{$id}/reverse", ['reason' => 'again'])->assertUnprocessable();

        $this->assertSame(
            ['settlement.requested', 'settlement.rejected', 'settlement.requested', 'settlement.posted', 'settlement.reversed'],
            $this->auditActions(),
        );
    }

    public function test_a_settlement_is_not_posted_when_the_balances_no_longer_cover_it(): void
    {
        $id = $this->requestSettlement(['amount' => '250']);

        $this->setOpening(500, 100);

        $this->postJson("/api/parties/{$this->partyId}/settlements/{$id}/approve")->assertUnprocessable()->assertJsonValidationErrors('amount');
        $this->assertSame('500.0000', $this->account()['positions']['customer']);
    }

    public function test_unauthorized_users_and_other_companies_are_refused(): void
    {
        $employee = $this->member('employee');
        $this->as($employee);
        $this->getJson("/api/parties/{$this->partyId}/settlements")->assertForbidden();
        $this->postJson("/api/parties/{$this->partyId}/settlements", $this->body())->assertForbidden();

        $this->as($this->owner);
        $id = $this->requestSettlement();

        $this->as($this->member('accountant'));
        $this->postJson("/api/parties/{$this->partyId}/settlements/{$id}/reverse", ['reason' => 'x'])->assertForbidden();

        $other = Organization::create(['name' => 'Other Company']);
        $stranger = User::factory()->create();
        $other->users()->attach($stranger->id, ['role' => 'owner']);
        $this->actingAs($stranger)->withSession([OrganizationAccess::SESSION_KEY => $other->id]);

        $this->getJson("/api/parties/{$this->partyId}/settlements")->assertNotFound();
        $this->postJson("/api/parties/{$this->partyId}/settlements/{$id}/approve")->assertNotFound();
        $this->assertDatabaseHas('party_settlements', ['id' => $id, 'status' => 'pending']);
    }
}
