<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartyOffsetTest extends TestCase
{
    use RefreshDatabase;

    public function test_offset_settles_the_sale_and_part_of_the_purchase_then_void_restores_both(): void
    {
        $this->signIn();
        $partyId = $this->dualParty('Khattab');
        $productId = $this->product('Offset Product A');
        $purchaseId = $this->issuedInvoice('purchase_invoice', $partyId, $productId, '9000', '2026-01-05');
        $saleId = $this->issuedInvoice('sale_invoice', $partyId, $productId, '5000', '2026-01-10');

        $preview = $this->postJson("/api/parties/{$partyId}/offsets/preview")->assertOk()->json('data');
        $this->assertSame(5000.0, (float) $preview['total']);
        $this->assertCount(1, $preview['pairs']);

        $result = $this->postJson("/api/parties/{$partyId}/offsets", ['notes' => 'مقاصة'])
            ->assertCreated()->json('data');

        $this->assertSame(5000.0, (float) $result['total']);
        $this->assertDatabaseHas('financial_documents', ['id' => $saleId, 'status' => 'paid', 'balance_due' => '0.0000']);
        $this->assertDatabaseHas('financial_documents', ['id' => $purchaseId, 'status' => 'partially_paid', 'balance_due' => '4000.0000']);
        $this->assertDatabaseCount('cash_movements', 0);

        $this->postJson("/api/parties/offsets/{$result['group']}/void", ['reason' => 'خطأ'])
            ->assertOk()->assertJsonPath('data.voided', 2);

        $this->assertDatabaseHas('financial_documents', ['id' => $saleId, 'status' => 'issued', 'balance_due' => '5000.0000']);
        $this->assertDatabaseHas('financial_documents', ['id' => $purchaseId, 'status' => 'issued', 'balance_due' => '9000.0000']);
    }

    public function test_partial_amount_is_capped_and_single_role_party_is_rejected(): void
    {
        $this->signIn();
        $partyId = $this->dualParty('Capped Party');
        $productId = $this->product('Offset Product B');
        $this->issuedInvoice('purchase_invoice', $partyId, $productId, '300', '2026-02-01');
        $saleId = $this->issuedInvoice('sale_invoice', $partyId, $productId, '1000', '2026-02-02');

        $this->postJson("/api/parties/{$partyId}/offsets", ['amount' => '400'])->assertUnprocessable();

        $this->postJson("/api/parties/{$partyId}/offsets", ['amount' => '100'])->assertCreated();
        $this->assertDatabaseHas('financial_documents', ['id' => $saleId, 'status' => 'partially_paid', 'balance_due' => '900.0000']);

        $customerOnly = (int) $this->postJson('/api/parties', [
            'type' => 'company', 'company_name' => 'Only Customer', 'roles' => ['customer'],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/parties/{$customerOnly}/offsets")->assertUnprocessable();
    }

    private function signIn(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Offset workspace']);
        $organization->users()->attach($user->id, ['role' => 'owner']);

        $this->actingAs($user)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);
    }

    private function dualParty(string $name): int
    {
        return (int) $this->postJson('/api/parties', [
            'type' => 'company',
            'company_name' => $name,
            'roles' => ['customer', 'supplier'],
        ])->assertCreated()->json('data.id');
    }

    private function product(string $name): int
    {
        return (int) $this->postJson('/api/products', [
            'type' => 'product',
            'name' => $name,
            'sku' => null,
            'unit' => 'unit',
            'unit_price' => '100.0000',
            'cost_price' => '50.0000',
            'tax_rate' => '0',
        ])->assertCreated()->json('data.id');
    }

    private function issuedInvoice(string $kind, int $partyId, int $productId, string $price, string $date): int
    {
        $id = (int) $this->postJson('/api/finance/documents', [
            'kind' => $kind,
            'party_id' => $partyId,
            'issue_date' => $date,
            'currency' => 'ILS',
            'lines' => [[
                'product_id' => $productId,
                'description' => 'Offset line',
                'quantity' => '1',
                'unit' => 'unit',
                'unit_price' => $price,
                'discount_percent' => '0',
                'tax_rate' => '0',
                'affects_inventory' => false,
            ]],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/documents/{$id}/issue", ['acknowledge_warnings' => true])->assertOk();

        return $id;
    }
}
