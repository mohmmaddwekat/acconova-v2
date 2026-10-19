<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Enums\ProductType;
use App\Models\CashMovement;
use App\Models\FinancialDocument;
use App\Models\Organization;
use App\Models\Product;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ImportRetailSalesTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    public function test_sales_of_one_day_become_one_paid_invoice_with_a_cash_receipt(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Retail Co']);
        $organization->users()->attach($user->id, ['role' => OrganizationRole::Owner->value]);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);

        $cap = Product::create(['type' => ProductType::Product, 'name' => 'غطاء 4 لتر', 'unit' => 'piece', 'unit_price' => 0.15, 'cost_price' => 0, 'tax_rate' => 0]);
        Product::create(['type' => ProductType::Product, 'name' => '3.5كلور ابيض', 'unit' => 'piece', 'unit_price' => 1.2, 'cost_price' => 0, 'tax_rate' => 0]);

        $path = tempnam(sys_get_temp_dir(), 'retail');
        file_put_contents($path, implode("\n", [
            "INSERT INTO r VALUES('aaa', '2025-01-10', 'غطاء 4 لتر', 100, 0.15);",
            "INSERT INTO r VALUES('aaa', '2025-01-10', '3.5كلور ابيض', 100, 1.20);",
            "INSERT INTO r VALUES('bbb', '2025-01-10', 'غطاء 4 لتر', 100, 0.20);",
            "INSERT INTO r VALUES('ccc', '2025-01-11', '3.5كلور ابيض', 50, 1.25);",
        ]));

        $this->artisan('finance:import-retail-sales', ['file' => $path, '--apply' => true])->assertSuccessful();

        $this->assertSame(2, FinancialDocument::count());
        $first = FinancialDocument::whereDate('issue_date', '2025-01-10')->first();
        $this->assertSame('paid', $first->status);
        $this->assertEquals(155.0, (float) $first->total);
        $this->assertCount(2, $first->lines);
        $this->assertEquals(0.175, (float) $first->lines->firstWhere('product_id', $cap->id)->unit_price);
        $this->assertStringContainsString('100 × 0.15', (string) $first->notes);
        $this->assertSame(2, CashMovement::where('status', 'posted')->count());
        $this->assertEquals(217.5, (float) FinancialDocument::sum('total'));

        $this->artisan('finance:import-retail-sales', ['file' => $path, '--apply' => true])->assertSuccessful();
        $this->assertSame(2, FinancialDocument::count());

        unlink($path);
    }
}
