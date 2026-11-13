<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerPriceAutoSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_issuing_a_sale_invoice_updates_existing_customer_price_only(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Price sync workspace']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        $this->actingAs($user)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);

        $customerId = (int) $this->postJson('/api/parties', [
            'type' => 'company',
            'company_name' => 'Sync Customer',
            'roles' => ['customer'],
        ])->assertCreated()->json('data.id');

        $priced = $this->product('Priced');
        $unpriced = $this->product('Unpriced');

        $this->postJson("/api/parties/{$customerId}/prices", [
            'product_id' => $priced,
            'unit_price' => '0.8',
        ])->assertCreated();

        $id = (int) $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice',
            'party_id' => $customerId,
            'issue_date' => '2026-03-01',
            'due_date' => '2026-03-01',
            'currency' => 'ILS',
            'lines' => [
                $this->line($priced, '1'),
                $this->line($unpriced, '5'),
            ],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/documents/{$id}/issue", ['acknowledge_warnings' => true])
            ->assertOk();

        $rows = $this->getJson("/api/parties/{$customerId}/prices")->assertOk()->json('data');

        $this->assertCount(1, $rows);
        $this->assertSame($priced, (int) $rows[0]['product_id']);
        $this->assertEquals(1.0, (float) $rows[0]['unit_price']);
    }

    private function product(string $name): int
    {
        return (int) $this->postJson('/api/products', [
            'type' => 'product',
            'name' => $name,
            'unit' => 'piece',
            'unit_price' => '2',
            'cost_price' => '1',
            'tax_rate' => '0',
            'track_inventory' => false,
        ])->assertCreated()->json('data.id');
    }

    /** @return array<string, mixed> */
    private function line(int $productId, string $price): array
    {
        return [
            'product_id' => $productId,
            'description' => 'Line',
            'quantity' => '1',
            'unit' => 'piece',
            'unit_price' => $price,
            'discount_percent' => '0',
            'tax_rate' => '0',
            'affects_inventory' => false,
        ];
    }
}
