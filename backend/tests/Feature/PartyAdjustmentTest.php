<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\FinancialDocument;
use App\Models\Organization;
use App\Models\PartyAdjustment;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartyAdjustmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_difference_entry_moves_the_party_balance_and_shows_on_the_statement(): void
    {
        $customerId = $this->seedWorkspace(['customer']);

        $this->postJson("/api/parties/{$customerId}/adjustments", [
            'direction' => 'owed_to_us',
            'amount' => '150',
            'adjustment_date' => '2026-10-10',
            'reason' => 'فرق أسعار',
        ])->assertCreated()->assertJsonPath('data.side', 'customer');

        $this->postJson("/api/parties/{$customerId}/adjustments", [
            'direction' => 'we_owe',
            'amount' => '40',
            'adjustment_date' => '2026-10-12',
            'reason' => 'بضاعة تالفة',
        ])->assertCreated();

        $this->getJson('/api/parties?status=active')
            ->assertOk()
            ->assertJsonPath('data.0.balance_summary.owed_to_us', '110.0000')
            ->assertJsonPath('data.0.balance_summary.aging.current', 110);

        $statement = $this->getJson("/api/parties/{$customerId}/account?scope=customer&date_from=2026-01-01&date_to=2026-10-17")
            ->assertOk()
            ->json('transactions');

        $adjustments = collect($statement)->where('type', 'adjustment')->values();
        $this->assertCount(2, $adjustments);
        $this->assertSame('فرق أسعار', $adjustments[0]['description']);
    }

    public function test_only_one_difference_entry_per_party_per_day(): void
    {
        $customerId = $this->seedWorkspace(['customer']);
        $payload = ['direction' => 'owed_to_us', 'amount' => '10', 'adjustment_date' => '2026-10-10', 'reason' => 'فرق وزن'];

        $this->postJson("/api/parties/{$customerId}/adjustments", $payload)->assertCreated();
        $this->postJson("/api/parties/{$customerId}/adjustments", $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('adjustment_date');

        $this->postJson("/api/parties/{$customerId}/adjustments", [...$payload, 'adjustment_date' => '2026-10-11'])->assertCreated();
    }

    public function test_a_dual_role_party_must_choose_the_account(): void
    {
        $partyId = $this->seedWorkspace(['customer', 'supplier']);
        $payload = ['direction' => 'we_owe', 'amount' => '25', 'adjustment_date' => '2026-10-10', 'reason' => 'خصم متفق عليه'];

        $this->postJson("/api/parties/{$partyId}/adjustments", $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('side');

        $this->postJson("/api/parties/{$partyId}/adjustments", [...$payload, 'side' => 'supplier'])
            ->assertCreated()
            ->assertJsonPath('data.side', 'supplier');

        $this->getJson('/api/parties?status=active')
            ->assertOk()
            ->assertJsonPath('data.0.balance_summary.we_owe', '25.0000');
    }

    public function test_voiding_removes_the_effect_and_moves_the_entry_to_the_archive(): void
    {
        $customerId = $this->seedWorkspace(['customer']);

        $adjustmentId = $this->postJson("/api/parties/{$customerId}/adjustments", [
            'direction' => 'owed_to_us',
            'amount' => '90',
            'adjustment_date' => '2026-10-10',
            'reason' => 'فرق أسعار',
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/parties/{$customerId}/adjustments/{$adjustmentId}/void", ['reason' => 'خطأ'])
            ->assertOk()
            ->assertJsonPath('data.status', PartyAdjustment::STATUS_VOIDED);

        $this->postJson("/api/parties/{$customerId}/adjustments/{$adjustmentId}/void", ['reason' => 'again'])
            ->assertUnprocessable();

        $this->getJson('/api/parties?status=active')
            ->assertOk()
            ->assertJsonPath('data.0.balance_summary.owed_to_us', '0.0000');

        $this->getJson('/api/finance/archive')
            ->assertOk()
            ->assertJsonPath('data.adjustments.0.id', $adjustmentId);

        $this->postJson('/api/finance/archive/delete', ['adjustments' => [$adjustmentId]])
            ->assertOk()
            ->assertJsonPath('data.adjustments', 1);

        $this->assertDatabaseMissing('party_adjustments', ['id' => $adjustmentId]);
    }

    public function test_a_posted_entry_cannot_be_deleted_from_the_archive(): void
    {
        $customerId = $this->seedWorkspace(['customer']);

        $adjustmentId = $this->postJson("/api/parties/{$customerId}/adjustments", [
            'direction' => 'owed_to_us',
            'amount' => '5',
            'adjustment_date' => '2026-10-10',
            'reason' => 'فرق أسعار',
        ])->assertCreated()->json('data.id');

        $this->postJson('/api/finance/archive/delete', ['adjustments' => [$adjustmentId]])
            ->assertUnprocessable();

        $this->assertDatabaseHas('party_adjustments', ['id' => $adjustmentId]);
    }

    public function test_a_discount_linked_to_an_invoice_reduces_it_and_closes_it(): void
    {
        $customerId = $this->seedWorkspace(['customer']);
        $tenant = app(TenantContext::class);
        $tenant->set(Organization::query()->firstOrFail(), OrganizationRole::Owner);
        $invoice = FinancialDocument::create([
            'party_id' => $customerId,
            'kind' => 'sale_invoice',
            'number' => 'INV-1',
            'status' => 'issued',
            'issue_date' => '2026-10-01',
            'currency' => 'ILS',
            'total' => '1000',
            'paid_total' => '0',
            'balance_due' => '1000',
            'credit_total' => '0',
        ]);
        $tenant->clear();
        $payload = ['direction' => 'owed_to_us', 'amount' => '100', 'adjustment_date' => '2026-10-10', 'reason' => 'خصم متفق عليه', 'financial_document_id' => $invoice->id];

        $this->postJson("/api/parties/{$customerId}/adjustments", [...$payload, 'amount' => '2000'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('amount');

        $first = $this->postJson("/api/parties/{$customerId}/adjustments", $payload)
            ->assertCreated()
            ->assertJsonPath('data.direction', PartyAdjustment::DIRECTION_WE_OWE)
            ->json('data.id');

        $this->assertSame('900.0000', $invoice->fresh()->balance_due);
        $this->assertSame('partially_paid', $invoice->fresh()->status);

        $this->postJson("/api/parties/{$customerId}/adjustments", [...$payload, 'amount' => '900'])->assertCreated();
        $this->assertSame('paid', $invoice->fresh()->status);

        $this->postJson("/api/parties/{$customerId}/adjustments/{$first}/void", ['reason' => 'خطأ'])->assertOk();
        $this->assertSame('100.0000', $invoice->fresh()->balance_due);
    }

    /**
     * @param  list<string>  $roles
     */
    private function seedWorkspace(array $roles): int
    {
        $this->travelTo(now()->setDate(2026, 10, 17)->startOfDay());

        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Differences Co']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        return $this->postJson('/api/parties', ['type' => 'company', 'company_name' => 'Clean Home', 'roles' => $roles])
            ->assertCreated()
            ->json('data.id');
    }
}
