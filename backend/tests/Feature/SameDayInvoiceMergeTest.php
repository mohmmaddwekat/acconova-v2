<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SameDayInvoiceMergeTest extends TestCase
{
    use RefreshDatabase;

    public function test_endpoint_merges_a_second_invoice_of_the_same_day_and_reports_nothing_to_merge_otherwise(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Merge workspace']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        $supplierId = (int) $this->postJson('/api/parties', [
            'type' => 'company', 'company_name' => 'Same Day Supplier', 'roles' => ['supplier'],
        ])->assertCreated()->json('data.id');
        $productA = $this->product('Merge Form A');
        $productB = $this->product('Merge Form B');

        $payload = fn (int $productId, string $price): array => [
            'kind' => 'purchase_invoice',
            'party_id' => $supplierId,
            'issue_date' => '2026-05-02',
            'currency' => 'ILS',
            'lines' => [[
                'product_id' => $productId,
                'description' => 'Line',
                'quantity' => '1',
                'unit' => 'unit',
                'unit_price' => $price,
                'discount_percent' => '0',
                'tax_rate' => '0',
                'affects_inventory' => false,
            ]],
        ];

        $this->postJson('/api/finance/documents/merge-same-day', $payload($productA, '100'))
            ->assertOk()->assertJsonPath('data.merged', false);

        $firstId = (int) $this->postJson('/api/finance/documents', $payload($productA, '100'))->assertCreated()->json('data.id');
        $this->postJson("/api/finance/documents/{$firstId}/issue", ['acknowledge_warnings' => true])->assertOk();

        $merged = $this->postJson('/api/finance/documents/merge-same-day', $payload($productB, '40'))
            ->assertOk()->assertJsonPath('data.merged', true)->json('data.document');

        $this->assertSame('140.0000', $merged['total']);
        $this->assertDatabaseHas('financial_documents', ['id' => $firstId, 'status' => 'superseded']);
        $this->assertDatabaseHas('financial_documents', ['id' => $merged['id'], 'status' => 'issued', 'total' => '140.0000']);
    }

    private function product(string $name): int
    {
        return (int) $this->postJson('/api/products', [
            'type' => 'product', 'name' => $name, 'sku' => null, 'unit' => 'unit',
            'unit_price' => '100.0000', 'cost_price' => '50.0000', 'tax_rate' => '0',
        ])->assertCreated()->json('data.id');
    }
}
