<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\InventoryBalance;
use App\Models\Organization;
use App\Models\Product;
use App\Models\User;
use App\Models\Warehouse;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuickEntryMiscStockTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_walk_in_sale_deducts_stock_when_asked_to(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Walk-in stock workspace']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);

        $warehouse = Warehouse::create(['code' => 'MAIN', 'name' => 'Main', 'is_default' => true]);
        $product = Product::factory()->create(['type' => 'product', 'name' => 'Walk-in Lid', 'unit' => 'piece', 'track_inventory' => true]);

        $this->postJson("/api/inventory/products/{$product->id}/opening-stock", ['warehouse_id' => $warehouse->id, 'quantity' => '5'])->assertOk();

        $this->postJson('/api/quick-entry', ['rows' => [[
            'type' => 'misc', 'date' => '2026-03-02', 'affects_stock' => true,
            'lines' => [['product_id' => $product->id, 'quantity' => '2', 'unit_price' => '10']],
        ]]])->assertOk();

        app(TenantContext::class)->set($organization, OrganizationRole::Owner);

        $this->assertSame('3.0000', (string) InventoryBalance::query()->where('product_id', $product->id)->value('on_hand'));
    }
}
