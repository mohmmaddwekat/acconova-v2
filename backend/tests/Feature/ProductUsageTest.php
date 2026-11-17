<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductUsageTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_new_item_is_for_both_sale_and_purchase_unless_told_otherwise(): void
    {
        $this->signIn();

        $this->postJson('/api/products', $this->payload('Default usage'))
            ->assertCreated()
            ->assertJsonPath('data.usage', 'both');

        $this->postJson('/api/products', $this->payload('Sale only') + ['usage' => 'sale'])
            ->assertCreated()
            ->assertJsonPath('data.usage', 'sale');
    }

    public function test_usage_can_be_changed_and_is_kept_when_an_update_does_not_mention_it(): void
    {
        $this->signIn();

        $id = (int) $this->postJson('/api/products', $this->payload('Switching') + ['usage' => 'purchase'])
            ->assertCreated()
            ->assertJsonPath('data.usage', 'purchase')
            ->json('data.id');

        $this->patchJson("/api/products/{$id}", $this->payload('Switching renamed'))
            ->assertOk()
            ->assertJsonPath('data.name', 'Switching renamed')
            ->assertJsonPath('data.usage', 'purchase');

        $this->patchJson("/api/products/{$id}", $this->payload('Switching renamed') + ['usage' => 'both'])
            ->assertOk()
            ->assertJsonPath('data.usage', 'both');
    }

    public function test_an_unknown_usage_is_rejected(): void
    {
        $this->signIn();

        $this->postJson('/api/products', $this->payload('Bad usage') + ['usage' => 'rent'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('usage');
    }

    public function test_invoice_lookups_tell_each_item_s_usage(): void
    {
        $this->signIn();

        $this->postJson('/api/products', $this->payload('Bought only') + ['usage' => 'purchase'])->assertCreated();

        $usages = collect($this->getJson('/api/finance/lookups')->assertOk()->json('products'))->pluck('usage', 'name');

        $this->assertSame('purchase', $usages['Bought only']);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(string $name): array
    {
        return [
            'type' => 'product',
            'name' => $name,
            'sku' => null,
            'unit' => 'unit',
            'unit_price' => '100.0000',
            'cost_price' => '50.0000',
            'tax_rate' => '0',
        ];
    }

    private function signIn(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Usage workspace']);
        $organization->users()->attach($user->id, ['role' => 'owner']);

        $this->actingAs($user)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);
    }
}
