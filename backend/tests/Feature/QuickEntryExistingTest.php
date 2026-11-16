<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuickEntryExistingTest extends TestCase
{
    use RefreshDatabase;

    public function test_existing_entries_for_a_party_and_date_are_reported_before_they_are_typed_again(): void
    {
        $this->signIn();
        $customerId = $this->party('customer', 'Repeat Customer');
        $otherId = $this->party('customer', 'Other Customer');
        $productId = $this->product('Repeat Product');

        $this->postJson('/api/quick-entry', [
            'rows' => [
                ['type' => 'sale', 'date' => '2026-03-02', 'party_id' => $customerId, 'lines' => [['product_id' => $productId, 'quantity' => '4', 'unit_price' => '25']]],
                ['type' => 'receipt', 'date' => '2026-03-02', 'party_id' => $customerId, 'payment' => ['amount' => '60', 'method' => 'cash']],
                ['type' => 'misc', 'date' => '2026-03-02', 'lines' => [['product_id' => $productId, 'quantity' => '1', 'unit_price' => '30']]],
            ],
        ])->assertOk();

        $sale = $this->getJson("/api/quick-entry/existing?type=sale&date=2026-03-02&party_id={$customerId}")->assertOk()->json('data');

        $this->assertCount(1, $sale);
        $this->assertSame('100.0000', $sale[0]['amount']);
        $this->assertSame('4.0000', $sale[0]['lines'][0]['quantity']);

        $receipt = $this->getJson("/api/quick-entry/existing?type=receipt&date=2026-03-02&party_id={$customerId}")->assertOk()->json('data');

        $this->assertCount(1, $receipt);
        $this->assertSame('60.0000', $receipt[0]['amount']);
        $this->assertSame('cash', $receipt[0]['method']);

        $misc = $this->getJson('/api/quick-entry/existing?type=misc&date=2026-03-02')->assertOk()->json('data');

        $this->assertCount(1, $misc);
        $this->assertSame('30.0000', $misc[0]['amount']);

        $this->getJson("/api/quick-entry/existing?type=sale&date=2026-03-03&party_id={$customerId}")->assertOk()->assertJson(['data' => []]);
        $this->getJson("/api/quick-entry/existing?type=sale&date=2026-03-02&party_id={$otherId}")->assertOk()->assertJson(['data' => []]);
        $this->getJson('/api/quick-entry/existing?type=sale&date=2026-03-02')->assertUnprocessable();
    }

    private function signIn(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Quick entry workspace']);
        $organization->users()->attach($user->id, ['role' => 'owner']);

        $this->actingAs($user)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);
    }

    private function party(string $role, string $name): int
    {
        return (int) $this->postJson('/api/parties', [
            'type' => 'company',
            'company_name' => $name,
            'roles' => [$role],
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
}
