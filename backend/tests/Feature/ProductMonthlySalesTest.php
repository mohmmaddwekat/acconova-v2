<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Enums\ProductType;
use App\Models\FinancialDocument;
use App\Models\FinancialDocumentLine;
use App\Models\InventoryBalance;
use App\Models\Organization;
use App\Models\Product;
use App\Models\User;
use App\Models\Warehouse;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductMonthlySalesTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    public function test_catalog_returns_average_monthly_sales_of_the_last_six_months(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Catalog Co']);
        $organization->users()->attach($user->id, ['role' => OrganizationRole::Owner->value]);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);

        $warehouse = Warehouse::create(['code' => 'WH-1', 'name' => 'Main', 'is_default' => true]);
        $product = Product::create(['type' => ProductType::Product, 'name' => '1لتر اسود', 'unit' => 'piece', 'unit_price' => 1, 'cost_price' => 0, 'tax_rate' => 0, 'track_inventory' => true]);
        InventoryBalance::create(['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'on_hand' => '600', 'reserved' => '0']);

        $this->sale($product, 'S-1', now()->subMonth()->toDateString(), 'issued', '40');
        $this->sale($product, 'S-2', now()->subMonths(2)->toDateString(), 'paid', '20');
        $this->sale($product, 'S-3', now()->subMonths(8)->toDateString(), 'issued', '500');
        $this->sale($product, 'S-4', now()->subMonth()->toDateString(), 'voided', '900');

        app(TenantContext::class)->clear();
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        $row = collect($this->getJson('/api/products')->assertOk()->json('data'))->firstWhere('id', $product->id);

        $this->assertEquals(10, (float) $row['monthly_sales']);
        $this->assertEquals(600, (float) $row['stock_on_hand']);
    }

    private function sale(Product $product, string $number, string $date, string $status, string $quantity): void
    {
        $document = FinancialDocument::create([
            'kind' => 'sale_invoice', 'number' => $number, 'status' => $status, 'issue_date' => $date,
            'currency' => 'ILS', 'total' => '10', 'paid_total' => '0', 'balance_due' => '10', 'credit_total' => '0',
        ]);

        FinancialDocumentLine::create([
            'financial_document_id' => $document->id, 'product_id' => $product->id,
            'description' => $product->name, 'quantity' => $quantity, 'unit_price' => '1',
        ]);
    }
}
