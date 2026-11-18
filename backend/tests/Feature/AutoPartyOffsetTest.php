<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AutoPartyOffsetTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_sale_to_a_supplier_is_paid_by_what_we_bought_from_it(): void
    {
        $this->signIn();
        $party = $this->party(['customer', 'supplier'], 'Manadel');
        $product = $this->product('Auto Offset A');

        $purchase = $this->issued('purchase_invoice', $party, $product, '3000', '2026-05-01');
        $sale = $this->issued('sale_invoice', $party, $product, '4000', '2026-05-02');

        $this->assertDatabaseHas('financial_documents', ['id' => $purchase, 'status' => 'paid', 'balance_due' => '0.0000']);
        $this->assertDatabaseHas('financial_documents', ['id' => $sale, 'status' => 'partially_paid', 'balance_due' => '1000.0000']);
        $this->assertDatabaseCount('cash_movements', 0);
    }

    public function test_the_other_direction_works_too(): void
    {
        $this->signIn();
        $party = $this->party(['customer', 'supplier'], 'Both Ways');
        $product = $this->product('Auto Offset B');

        $sale = $this->issued('sale_invoice', $party, $product, '5000', '2026-05-01');
        $purchase = $this->issued('purchase_invoice', $party, $product, '2000', '2026-05-02');

        $this->assertDatabaseHas('financial_documents', ['id' => $purchase, 'status' => 'paid']);
        $this->assertDatabaseHas('financial_documents', ['id' => $sale, 'status' => 'partially_paid', 'balance_due' => '3000.0000']);
    }

    public function test_single_role_parties_and_a_switched_off_workspace_are_left_alone(): void
    {
        $this->signIn();
        $customer = $this->party(['customer'], 'Only Customer');
        $product = $this->product('Auto Offset C');

        $sale = $this->issued('sale_invoice', $customer, $product, '700', '2026-05-01');
        $this->assertDatabaseHas('financial_documents', ['id' => $sale, 'status' => 'issued', 'balance_due' => '700.0000']);

        Organization::query()->update(['preferences' => ['auto_party_offset' => false]]);
        $both = $this->party(['customer', 'supplier'], 'Switched Off');

        $purchase = $this->issued('purchase_invoice', $both, $product, '300', '2026-05-02');
        $saleBoth = $this->issued('sale_invoice', $both, $product, '400', '2026-05-03');

        $this->assertDatabaseHas('financial_documents', ['id' => $purchase, 'status' => 'issued']);
        $this->assertDatabaseHas('financial_documents', ['id' => $saleBoth, 'status' => 'issued', 'balance_due' => '400.0000']);
    }

    private function signIn(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Auto offset workspace']);
        $organization->users()->attach($user->id, ['role' => 'owner']);

        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);
    }

    /**
     * @param  list<string>  $roles
     */
    private function party(array $roles, string $name): int
    {
        return (int) $this->postJson('/api/parties', ['type' => 'company', 'company_name' => $name, 'roles' => $roles])
            ->assertCreated()->json('data.id');
    }

    private function product(string $name): int
    {
        return (int) $this->postJson('/api/products', [
            'type' => 'product', 'name' => $name, 'sku' => null, 'unit' => 'unit',
            'unit_price' => '100.0000', 'cost_price' => '50.0000', 'tax_rate' => '0',
        ])->assertCreated()->json('data.id');
    }

    private function issued(string $kind, int $party, int $product, string $price, string $date): int
    {
        $id = (int) $this->postJson('/api/finance/documents', [
            'kind' => $kind, 'party_id' => $party, 'issue_date' => $date, 'currency' => 'ILS',
            'lines' => [[
                'product_id' => $product, 'description' => 'Line', 'quantity' => '1', 'unit' => 'unit', 'unit_price' => $price,
                'discount_percent' => '0', 'tax_rate' => '0', 'affects_inventory' => false,
            ]],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/documents/{$id}/issue", ['acknowledge_warnings' => true])->assertOk();

        return $id;
    }
}
