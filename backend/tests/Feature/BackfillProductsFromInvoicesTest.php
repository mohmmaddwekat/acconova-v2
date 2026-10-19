<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\FinancialDocument;
use App\Models\FinancialDocumentLine;
use App\Models\Organization;
use App\Models\Product;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BackfillProductsFromInvoicesTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    public function test_apply_merges_spelling_variants_and_links_lines_without_changing_totals(): void
    {
        $organization = Organization::create(['name' => 'Backfill Co']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);

        $sale = $this->document('sale_invoice', 'S-1');
        $purchase = $this->document('purchase_invoice', 'P-1');

        $this->line($sale, '1لتر اصفر', '1.00');
        $this->line($sale, '1لتراصفر', '0.80');
        $this->line($purchase, 'خومر', '5.00');
        $this->line($purchase, 'نقل', '100.00');

        $this->artisan('products:backfill-from-invoices', ['--apply' => true, '--csv' => 'test-backfill.csv'])->assertSuccessful();

        $this->assertSame(3, Product::count());
        $this->assertSame(0, FinancialDocumentLine::whereNull('product_id')->count());
        $this->assertSame(
            1,
            FinancialDocumentLine::whereIn('description', ['1لتر اصفر', '1لتراصفر'])->distinct()->count('product_id'),
        );
        $this->assertSame('raw_material', Product::where('name', 'خومر')->value('type')->value);
        $this->assertSame('service', Product::where('name', 'نقل')->value('type')->value);
        $this->assertSame('product', Product::where('name', 'like', '1لتر%')->first()->type->value);
        $this->assertSame('0.9000', Product::where('name', 'like', '1لتر%')->value('unit_price'));
        $this->assertSame('100.0000', $sale->fresh()->total);
    }

    public function test_dry_run_writes_nothing_and_rerunning_apply_does_not_duplicate_products(): void
    {
        $organization = Organization::create(['name' => 'Backfill Co']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $this->line($this->document('sale_invoice', 'S-1'), 'غطاء 4 لتر', '0.15');

        $this->artisan('products:backfill-from-invoices', ['--csv' => 'test-backfill.csv'])->assertSuccessful();
        $this->assertSame(0, Product::count());

        $this->artisan('products:backfill-from-invoices', ['--apply' => true, '--csv' => 'test-backfill.csv'])->assertSuccessful();
        $this->artisan('products:backfill-from-invoices', ['--apply' => true, '--csv' => 'test-backfill.csv'])->assertSuccessful();

        $this->assertSame(1, Product::count());
    }

    public function test_price_suffixes_in_descriptions_merge_into_one_product_without_the_suffix(): void
    {
        $organization = Organization::create(['name' => 'Backfill Co']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $sale = $this->document('sale_invoice', 'S-1');

        $this->line($sale, '1لتر - سعر 0.9', '0.90');
        $this->line($sale, '1لتر - سعر 1', '1.00');

        $this->artisan('products:backfill-from-invoices', ['--apply' => true, '--csv' => 'test-backfill.csv'])->assertSuccessful();

        $this->assertSame(['1لتر'], Product::pluck('name')->all());
        $this->assertSame(0, FinancialDocumentLine::whereNull('product_id')->count());
    }

    private function document(string $kind, string $number): FinancialDocument
    {
        return FinancialDocument::create([
            'kind' => $kind,
            'number' => $number,
            'status' => 'issued',
            'issue_date' => '2026-09-01',
            'currency' => 'ILS',
            'total' => '100',
            'paid_total' => '0',
            'balance_due' => '100',
            'credit_total' => '0',
        ]);
    }

    private function line(FinancialDocument $document, string $description, string $price): FinancialDocumentLine
    {
        return FinancialDocumentLine::create([
            'financial_document_id' => $document->id,
            'description' => $description,
            'quantity' => '1',
            'unit_price' => $price,
        ]);
    }
}
