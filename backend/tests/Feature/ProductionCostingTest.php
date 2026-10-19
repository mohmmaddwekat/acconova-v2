<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Enums\ProductType;
use App\Models\FinancialDocument;
use App\Models\FinancialDocumentLine;
use App\Models\Organization;
use App\Models\Product;
use App\Models\ProductionCostPeriod;
use App\Models\ProductionRecipe;
use App\Models\ProductionRecipeComponent;
use App\Models\ProductionRecipeOption;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\Production\ProductionCostingService;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ProductionCostingTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    public function test_unit_cost_adds_the_months_wages_and_expenses_to_material_cost_and_recosts_sales(): void
    {
        $organization = Organization::create(['name' => 'Costing Co']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $warehouse = Warehouse::create(['code' => 'WH-1', 'name' => 'Main', 'is_default' => true]);
        $user = User::factory()->create();

        $bottle = Product::create(['type' => ProductType::Product, 'name' => '1لتر اسود', 'unit' => 'piece', 'unit_price' => 5, 'cost_price' => 0, 'tax_rate' => 0]);
        $resin = Product::create(['type' => ProductType::RawMaterial, 'name' => 'خومر', 'unit' => 'piece', 'unit_price' => 10, 'cost_price' => 10, 'tax_rate' => 0]);
        $recipe = ProductionRecipe::create(['product_id' => $bottle->id, 'version' => 1, 'is_active' => true]);
        $component = ProductionRecipeComponent::create(['production_recipe_id' => $recipe->id, 'name' => 'خومر', 'position' => 1]);
        ProductionRecipeOption::create(['production_recipe_component_id' => $component->id, 'raw_material_id' => $resin->id, 'quantity_per_unit' => '0.1', 'is_default' => true, 'position' => 1]);

        $runId = DB::table('production_runs')->insertGetId([
            'organization_id' => $organization->id, 'run_number' => 'PR-000001', 'occurred_on' => '2026-01-10',
            'status' => 'posted', 'revision' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('production_run_outputs')->insert([
            'organization_id' => $organization->id, 'production_run_id' => $runId, 'line_number' => 1,
            'product_id' => $bottle->id, 'warehouse_id' => $warehouse->id, 'quantity' => '100', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $staffId = DB::table('staff_members')->insertGetId([
            'organization_id' => $organization->id, 'name' => 'Worker', 'basis' => 'month', 'rate' => 100,
            'currency' => 'ILS', 'started_on' => '2026-01-01', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('staff_entries')->insert([
            'organization_id' => $organization->id, 'staff_member_id' => $staffId, 'created_by' => $user->id,
            'request_id' => 'req-1', 'kind' => 'work', 'occurred_on' => '2026-01-15', 'amount' => '60', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('cash_movements')->insert([
            ['organization_id' => $organization->id, 'number' => 'CP-1', 'direction' => 'outgoing', 'status' => 'posted', 'category' => 'utilities', 'amount' => '40', 'currency' => 'ILS', 'movement_date' => '2026-01-20', 'method' => 'cash', 'created_at' => now(), 'updated_at' => now()],
            ['organization_id' => $organization->id, 'number' => 'CP-2', 'direction' => 'outgoing', 'status' => 'posted', 'category' => 'supplier_payment', 'amount' => '999', 'currency' => 'ILS', 'movement_date' => '2026-01-21', 'method' => 'cash', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $sale = FinancialDocument::create([
            'kind' => 'sale_invoice', 'number' => 'S-1', 'status' => 'issued', 'issue_date' => '2026-01-25',
            'currency' => 'ILS', 'total' => '500', 'paid_total' => '0', 'balance_due' => '500', 'credit_total' => '0',
        ]);
        $line = FinancialDocumentLine::create(['financial_document_id' => $sale->id, 'product_id' => $bottle->id, 'description' => '1لتر اسود', 'quantity' => '100', 'unit_price' => '5']);

        $service = app(ProductionCostingService::class);
        $rows = $service->compute(ProductionCostingService::BASIS_UNITS, 1);

        $this->assertCount(1, $rows);
        $this->assertEqualsWithDelta(1.0, $rows[0]['material_unit_cost'], 0.0001);
        $this->assertEqualsWithDelta(1.0, $rows[0]['overhead_unit_cost'], 0.0001);

        $result = $service->apply($rows);

        $this->assertEqualsWithDelta(1 / 3, $service->compute()[0]['overhead_unit_cost'], 0.0001);
        $this->assertSame(['periods' => 1, 'products' => 1, 'lines' => 1], $result);
        $this->assertEquals(2, ProductionCostPeriod::first()->unit_cost);
        $this->assertEquals(2, $bottle->fresh()->cost_price);
        $this->assertEquals(2, $line->fresh()->cost_price_snapshot);
    }
}
