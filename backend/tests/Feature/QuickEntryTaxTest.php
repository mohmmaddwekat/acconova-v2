<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\FinancialDocument;
use App\Models\Organization;
use App\Models\TaxRule;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuickEntryTaxTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_quick_entry_invoice_can_carry_a_tax_rule(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Quick entry tax workspace']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        $customerId = (int) $this->postJson('/api/parties', ['type' => 'company', 'company_name' => 'Taxed Customer', 'roles' => ['customer']])->assertCreated()->json('data.id');
        $productId = (int) $this->postJson('/api/products', [
            'type' => 'product', 'name' => 'Taxed Product', 'sku' => null, 'unit' => 'unit',
            'unit_price' => '100.0000', 'cost_price' => '50.0000', 'tax_rate' => '0',
        ])->assertCreated()->json('data.id');

        app(TenantContext::class)->set($organization, OrganizationRole::Owner);

        $rule = TaxRule::create([
            'name' => 'VAT 16', 'code' => 'VAT16', 'tax_type' => 'vat', 'country_code' => 'JO',
            'applies_to' => 'both', 'rate' => '16', 'inclusive' => false, 'recoverable' => false, 'active' => true,
        ]);

        $this->postJson('/api/quick-entry', ['rows' => [[
            'type' => 'sale', 'date' => '2026-03-02', 'party_id' => $customerId, 'tax_rule_id' => $rule->id,
            'lines' => [['product_id' => $productId, 'quantity' => '2', 'unit_price' => '50']],
        ]]])->assertOk();

        app(TenantContext::class)->set($organization, OrganizationRole::Owner);

        $invoice = FinancialDocument::query()->where('kind', 'sale_invoice')->firstOrFail();

        $this->assertSame('16.0000', $invoice->tax_total);
        $this->assertSame('116.0000', $invoice->total);
    }
}
