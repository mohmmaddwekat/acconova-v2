<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartyBalanceOverviewTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_ages_open_balances_from_newest_invoice_backwards(): void
    {
        $customerId = $this->seedWorkspace();

        $this->getJson('/api/parties?status=active&sort=name_asc')
            ->assertOk()
            ->assertJsonPath('data.0.id', $customerId)
            ->assertJsonPath('data.0.balance_summary.aging.current', 500)
            ->assertJsonPath('data.0.balance_summary.aging.days_31_60', 300)
            ->assertJsonPath('data.0.balance_summary.aging.over_60', 200)
            ->assertJsonPath('data.0.balance_summary.aging.oldest_days', 108);
    }

    public function test_overview_returns_workspace_totals_and_tab_counts(): void
    {
        $this->seedWorkspace();

        $this->getJson('/api/parties/overview')
            ->assertOk()
            ->assertJsonPath('data.owed_to_us', 1000)
            ->assertJsonPath('data.we_owe', 0)
            ->assertJsonPath('data.overdue', 200)
            ->assertJsonPath('data.balances_visible', true)
            ->assertJsonPath('data.counts.all', 3)
            ->assertJsonPath('data.counts.customers', 2)
            ->assertJsonPath('data.counts.suppliers', 1)
            ->assertJsonPath('data.counts.receivable', 1)
            ->assertJsonPath('data.counts.overdue', 1);
    }

    public function test_balance_filter_limits_the_index_to_matching_parties(): void
    {
        $customerId = $this->seedWorkspace();

        $this->getJson('/api/parties?status=active&balance=overdue')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $customerId);

        $this->getJson('/api/parties?status=active&balance=payable')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->getJson('/api/parties?status=active&balance=unknown')
            ->assertUnprocessable();
    }

    public function test_a_party_that_is_both_customer_and_supplier_shows_only_the_net_balance(): void
    {
        $this->seedWorkspace();

        $dualId = $this->postJson('/api/parties', ['type' => 'company', 'company_name' => 'D Both Ways', 'roles' => ['customer', 'supplier']])
            ->assertCreated()->json('data.id');
        $this->patchJson("/api/parties/{$dualId}/opening-balances", [
            'customer' => ['amount' => '500', 'as_of_date' => '2026-01-01'],
            'supplier' => ['amount' => '300', 'as_of_date' => '2026-01-01'],
        ])->assertOk();

        $this->getJson('/api/parties?status=active&sort=name_asc')
            ->assertOk()
            ->assertJsonPath('data.3.id', $dualId)
            ->assertJsonPath('data.3.balance_summary.owed_to_us', '200.0000')
            ->assertJsonPath('data.3.balance_summary.we_owe', '0.0000')
            ->assertJsonPath('data.3.balance_summary.aging.over_60', 200);

        $this->getJson('/api/parties/overview')
            ->assertOk()
            ->assertJsonPath('data.owed_to_us', 1200)
            ->assertJsonPath('data.we_owe', 0);
    }

    /**
     * One customer owing 1,000 across three ages, one settled customer, one supplier.
     */
    private function seedWorkspace(): int
    {
        $this->travelTo(now()->setDate(2026, 10, 17)->startOfDay());

        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Aging Co']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        $customerId = $this->postJson('/api/parties', ['type' => 'company', 'company_name' => 'A Late Customer', 'roles' => ['customer']])
            ->assertCreated()->json('data.id');
        $this->postJson('/api/parties', ['type' => 'company', 'company_name' => 'B Settled Customer', 'roles' => ['customer']])->assertCreated();
        $this->postJson('/api/parties', ['type' => 'company', 'company_name' => 'C Supplier', 'roles' => ['supplier']])->assertCreated();

        foreach (['2026-07-01' => 200, '2026-09-01' => 300, '2026-10-10' => 500] as $date => $amount) {
            $saleId = $this->postJson('/api/finance/documents', [
                'kind' => 'sale_invoice',
                'party_id' => $customerId,
                'issue_date' => $date,
                'due_date' => $date,
                'activity_type' => 'services',
                'market_type' => 'local',
                'currency' => 'ILS',
                'exchange_rate' => '1',
                'shipping_total' => '0',
                'lines' => [[
                    'description' => 'Service '.$date,
                    'quantity' => '1',
                    'unit' => 'service',
                    'unit_price' => (string) $amount,
                    'discount_percent' => '0',
                    'tax_rate' => '0',
                    'affects_inventory' => false,
                ]],
            ])->assertCreated()->json('data.id');

            $this->postJson('/api/finance/documents/'.$saleId.'/issue', ['acknowledge_warnings' => true])->assertOk();
        }

        return $customerId;
    }
}
