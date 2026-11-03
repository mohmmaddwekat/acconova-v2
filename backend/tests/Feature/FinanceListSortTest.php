<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Enums\ProductType;
use App\Models\FinancialDocument;
use App\Models\InventoryBalance;
use App\Models\Organization;
use App\Models\Party;
use App\Models\Product;
use App\Models\User;
use App\Models\Warehouse;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FinanceListSortTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    private function workspace(): array
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Sort Co']);
        $organization->users()->attach($user->id, ['role' => OrganizationRole::Owner->value]);

        return [$user, $organization];
    }

    public function test_invoices_sort_by_total_and_by_party_name(): void
    {
        [$user, $organization] = $this->workspace();
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);

        $zaid = Party::create(['type' => 'company', 'company_name' => 'زيد', 'name' => 'زيد']);
        $amal = Party::create(['type' => 'company', 'company_name' => 'امل', 'name' => 'امل']);

        foreach ([['S-1', $zaid, '300'], ['S-2', $amal, '900'], ['S-3', $zaid, '100']] as [$number, $party, $total]) {
            FinancialDocument::create([
                'kind' => 'sale_invoice', 'number' => $number, 'party_id' => $party->id, 'status' => 'issued',
                'issue_date' => '2026-03-0'.substr($number, -1), 'currency' => 'ILS', 'total' => $total,
                'paid_total' => '0', 'balance_due' => $total, 'credit_total' => '0',
            ]);
        }

        app(TenantContext::class)->clear();
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        $numbers = fn (string $query): array => collect($this->getJson('/api/finance/documents?kind=sale_invoice&'.$query)->assertOk()->json('data'))->pluck('number')->all();

        $this->assertSame(['S-2', 'S-1', 'S-3'], $numbers('sort=total&sort_direction=desc'));
        $this->assertSame(['S-3', 'S-1', 'S-2'], $numbers('sort=total&sort_direction=asc'));
        $this->assertSame(['S-2'], array_slice($numbers('sort=party&sort_direction=asc'), 0, 1));
        $this->assertSame(['S-3', 'S-2', 'S-1'], $numbers(''));
    }

    public function test_staff_directory_sorts_by_the_chosen_column(): void
    {
        [$user, $organization] = $this->workspace();

        foreach ([['ب', 'hour', 5], ['أ', 'month', 3000], ['ج', 'day', 100]] as [$name, $basis, $rate]) {
            DB::table('staff_members')->insert([
                'organization_id' => $organization->id, 'name' => $name, 'basis' => $basis, 'rate' => $rate,
                'currency' => 'ILS', 'started_on' => '2026-01-01', 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        $names = fn (string $query): array => collect($this->getJson('/api/staff?'.$query)->assertOk()->json('data.data'))->pluck('name')->all();

        $this->assertSame(['أ', 'ب', 'ج'], $names(''));
        $this->assertSame(['ج', 'ب', 'أ'], $names('sort=name&sort_direction=desc'));
        $this->assertSame(['ج', 'ب', 'أ'], $names('sort=basis&sort_direction=asc&per_page=20'));
    }

    public function test_cash_movements_and_products_sort_by_the_chosen_column(): void
    {
        [$user, $organization] = $this->workspace();
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);

        foreach ([['P-1', '100'], ['P-2', '900'], ['P-3', '500']] as [$number, $amount]) {
            DB::table('cash_movements')->insert([
                'organization_id' => $organization->id, 'number' => $number, 'direction' => 'outgoing', 'status' => 'posted',
                'category' => 'utilities', 'amount' => $amount, 'currency' => 'ILS', 'movement_date' => '2026-03-01',
                'method' => 'cash', 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        $warehouse = Warehouse::create(['code' => 'WH-1', 'name' => 'Main', 'is_default' => true]);
        $many = Product::create(['type' => ProductType::Product, 'name' => 'كثير', 'unit' => 'piece', 'unit_price' => 1, 'cost_price' => 0, 'tax_rate' => 0, 'track_inventory' => true]);
        $few = Product::create(['type' => ProductType::Product, 'name' => 'قليل', 'unit' => 'piece', 'unit_price' => 1, 'cost_price' => 0, 'tax_rate' => 0, 'track_inventory' => true]);
        InventoryBalance::create(['product_id' => $many->id, 'warehouse_id' => $warehouse->id, 'on_hand' => '500', 'reserved' => '0']);
        InventoryBalance::create(['product_id' => $few->id, 'warehouse_id' => $warehouse->id, 'on_hand' => '5', 'reserved' => '0']);

        app(TenantContext::class)->clear();
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        $cash = collect($this->getJson('/api/finance/cash-movements?direction=outgoing&sort=amount&sort_direction=desc')->assertOk()->json('data'))->pluck('number')->all();
        $this->assertSame(['P-2', 'P-3', 'P-1'], $cash);

        $names = fn (string $sort): array => collect($this->getJson('/api/products?sort='.$sort)->assertOk()->json('data'))->pluck('name')->all();
        $this->assertSame(['قليل', 'كثير'], $names('stock_low'));
        $this->assertSame(['كثير', 'قليل'], $names('stock_high'));
    }
}
