<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Enums\ProductType;
use App\Models\FinancialDocument;
use App\Models\FinancialDocumentLine;
use App\Models\InventoryBalance;
use App\Models\Organization;
use App\Models\Product;
use App\Models\ProductionRecipe;
use App\Models\ProductionRecipeComponent;
use App\Models\ProductionRecipeOption;
use App\Models\ProductionRun;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Services\Inventory\HistoricalStockBackfill;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class BackfillHistoricalStockTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    public function test_it_posts_production_and_invoice_movements_and_allows_negative_balances(): void
    {
        $organization = Organization::create(['name' => 'Stock Co']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        Warehouse::create(['code' => 'WH-1', 'name' => 'Main', 'is_default' => true]);

        $bottle = Product::create(['type' => ProductType::Product, 'name' => '1لتر ازرق', 'unit' => 'piece', 'unit_price' => 1, 'cost_price' => 0, 'tax_rate' => 0]);
        $cap = Product::create(['type' => ProductType::Product, 'name' => 'غطاء', 'unit' => 'piece', 'unit_price' => 1, 'cost_price' => 0, 'tax_rate' => 0]);

        $sale = $this->document('sale_invoice', 'S-1', '2026-01-10');
        $purchase = $this->document('purchase_invoice', 'P-1', '2026-01-02');
        $this->line($sale, $bottle, '300');
        $this->line($sale, $cap, '50');
        $this->line($purchase, $cap, '100');

        $service = app(HistoricalStockBackfill::class);
        $plan = $service->plan([['date' => '2026-01-05', 'name' => '1لتر ازرق', 'quantity' => '200']]);
        $result = $service->apply($plan);

        $this->assertSame(['runs' => 1, 'movements' => 5, 'products_created' => 0], $result);
        $this->assertSame(1, ProductionRun::where('status', 'posted')->count());
        $this->assertEquals(0, InventoryBalance::where('product_id', $bottle->id)->value('on_hand'));
        $this->assertEquals(100, StockMovement::where('product_id', $bottle->id)->where('type', 'opening')->value('quantity'));
        $this->assertEquals(50, InventoryBalance::where('product_id', $cap->id)->value('on_hand'));
        $this->assertEquals(5, StockMovement::count());
        $this->assertSame(1, FinancialDocumentLine::where('affects_inventory', true)->where('product_id', $cap->id)->where('financial_document_id', $purchase->id)->count());
        $this->assertSame('300.0000', FinancialDocumentLine::where('product_id', $bottle->id)->value('quantity'));
    }

    public function test_production_consumes_raw_materials_from_the_active_recipe(): void
    {
        $organization = Organization::create(['name' => 'Stock Co']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        Warehouse::create(['code' => 'WH-1', 'name' => 'Main', 'is_default' => true]);

        $bottle = Product::create(['type' => ProductType::Product, 'name' => '1لتر اسود', 'unit' => 'piece', 'unit_price' => 1, 'cost_price' => 0, 'tax_rate' => 0]);
        $resin = Product::create(['type' => ProductType::RawMaterial, 'name' => 'خومر', 'unit' => 'piece', 'unit_price' => 1, 'cost_price' => 0, 'tax_rate' => 0]);

        $recipe = ProductionRecipe::create(['product_id' => $bottle->id, 'version' => 1, 'is_active' => true]);
        $component = ProductionRecipeComponent::create(['production_recipe_id' => $recipe->id, 'name' => 'خومر', 'position' => 1]);
        ProductionRecipeOption::create(['production_recipe_component_id' => $component->id, 'raw_material_id' => $resin->id, 'quantity_per_unit' => '0.05555556', 'is_default' => true, 'position' => 1]);

        $service = app(HistoricalStockBackfill::class);
        $service->apply($service->plan([['date' => '2026-01-05', 'name' => '1لتر اسود', 'quantity' => '180']]));

        $this->assertEquals(180, InventoryBalance::where('product_id', $bottle->id)->value('on_hand'));
        $this->assertEquals(0, InventoryBalance::where('product_id', $resin->id)->value('on_hand'));
        $this->assertEquals(10, StockMovement::where('product_id', $resin->id)->where('type', 'opening')->value('quantity'));
        $this->assertSame(1, StockMovement::where('type', 'production_out')->whereNotNull('production_run_material_id')->count());
    }

    public function test_optional_components_are_consumed_only_while_stock_lasts(): void
    {
        $organization = Organization::create(['name' => 'Stock Co']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        Warehouse::create(['code' => 'WH-1', 'name' => 'Main', 'is_default' => true]);

        $bottle = Product::create(['type' => ProductType::Product, 'name' => '1لتر اسود', 'unit' => 'piece', 'unit_price' => 1, 'cost_price' => 0, 'tax_rate' => 0]);
        $filler = Product::create(['type' => ProductType::RawMaterial, 'name' => 'خومر جير', 'unit' => 'piece', 'unit_price' => 1, 'cost_price' => 0, 'tax_rate' => 0]);
        $purchase = $this->document('purchase_invoice', 'P-1', '2026-01-01');
        $this->line($purchase, $filler, '5');

        $recipe = ProductionRecipe::create(['product_id' => $bottle->id, 'version' => 1, 'is_active' => true]);
        $component = ProductionRecipeComponent::create(['production_recipe_id' => $recipe->id, 'name' => 'خومر جير', 'is_optional' => true, 'position' => 1]);
        ProductionRecipeOption::create(['production_recipe_component_id' => $component->id, 'raw_material_id' => $filler->id, 'quantity_per_unit' => '0.1', 'is_default' => true, 'position' => 1]);

        $service = app(HistoricalStockBackfill::class);
        $service->apply($service->plan([
            ['date' => '2026-01-05', 'name' => '1لتر اسود', 'quantity' => '40'],
            ['date' => '2026-01-06', 'name' => '1لتر اسود', 'quantity' => '40'],
        ]));

        $this->assertEquals(0, InventoryBalance::where('product_id', $filler->id)->value('on_hand'));
        $this->assertEquals(5, -StockMovement::where('product_id', $filler->id)->where('type', 'production_out')->sum('quantity'));
        $this->assertSame(0, StockMovement::where('product_id', $filler->id)->where('type', 'opening')->count());
    }

    public function test_it_refuses_to_run_twice(): void
    {
        $organization = Organization::create(['name' => 'Stock Co']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        Warehouse::create(['code' => 'WH-1', 'name' => 'Main', 'is_default' => true]);
        Product::create(['type' => ProductType::Product, 'name' => 'منتج', 'unit' => 'piece', 'unit_price' => 1, 'cost_price' => 0, 'tax_rate' => 0]);

        $service = app(HistoricalStockBackfill::class);
        $service->apply($service->plan([['date' => '2026-01-05', 'name' => 'منتج', 'quantity' => '10']]));

        $this->expectException(RuntimeException::class);
        $service->apply($service->plan([['date' => '2026-01-06', 'name' => 'منتج', 'quantity' => '10']]));
    }

    private function document(string $kind, string $number, string $date): FinancialDocument
    {
        return FinancialDocument::create([
            'kind' => $kind, 'number' => $number, 'status' => 'issued', 'issue_date' => $date,
            'currency' => 'ILS', 'total' => '100', 'paid_total' => '0', 'balance_due' => '100', 'credit_total' => '0',
        ]);
    }

    private function line(FinancialDocument $document, Product $product, string $quantity): FinancialDocumentLine
    {
        return FinancialDocumentLine::create([
            'financial_document_id' => $document->id, 'product_id' => $product->id,
            'description' => $product->name, 'quantity' => $quantity, 'unit_price' => '1',
        ]);
    }
}
