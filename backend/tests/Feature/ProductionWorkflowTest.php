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

class ProductionWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_production_consumes_multiple_materials_and_records_linked_history(): void
    {
        [$product, $raw, $other, $warehouse] = $this->workspace();
        $response = $this->postJson($this->endpoint($product), $this->payload($raw, $other, $warehouse))
            ->assertCreated()->assertJsonPath('data.quantity', '2.0000')->assertJsonCount(2, 'data.materials');
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $raw->id, 'on_hand' => '6.7500', 'reserved' => '2.0000']);
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $other->id, 'on_hand' => '3.5000']);
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $product->id, 'on_hand' => '2.0000']);
        $this->assertDatabaseCount('stock_movements', 3);
        $this->assertDatabaseHas('stock_movements', ['product_id' => $raw->id, 'type' => 'production_out', 'quantity' => '-3.2500', 'reference_type' => 'production', 'reference_id' => $response->json('data.id')]);
        $this->getJson($this->endpoint($product))->assertOk()->assertJsonCount(1, 'data')->assertJsonCount(2, 'data.0.materials');
    }

    public function test_insufficient_or_reserved_material_rolls_back_the_whole_batch(): void
    {
        [$product, $raw, $other, $warehouse] = $this->workspace();
        $payload = $this->payload($raw, $other, $warehouse);
        $payload['materials'][1]['quantity'] = '6';
        $this->postJson($this->endpoint($product), $payload)->assertUnprocessable();
        $payload['materials'][1]['quantity'] = '1';
        $payload['materials'][0]['quantity'] = '9';
        $this->postJson($this->endpoint($product), $payload)->assertUnprocessable();
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $raw->id, 'on_hand' => '10.0000']);
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $other->id, 'on_hand' => '5.0000']);
        $this->assertDatabaseMissing('inventory_balances', ['product_id' => $product->id]);
        $this->assertDatabaseCount('stock_movements', 0);
    }

    public function test_invalid_quantities_duplicates_and_wrong_types_are_rejected(): void
    {
        [$product, $raw, $other, $warehouse] = $this->workspace();
        $service = Product::factory()->create(['type' => 'service']);
        $payload = $this->payload($raw, $other, $warehouse);
        $this->postJson($this->endpoint($product), [...$payload, 'quantity' => '0'])->assertUnprocessable();
        $this->postJson($this->endpoint($product), [...$payload, 'materials' => []])->assertUnprocessable();
        $this->postJson($this->endpoint($product), [...$payload, 'materials' => [$payload['materials'][0], $payload['materials'][0]]])->assertUnprocessable();
        $payload['materials'][0]['quantity'] = '-1';
        $this->postJson($this->endpoint($product), $payload)->assertUnprocessable();
        $payload['materials'][0] = ['product_id' => $product->id, 'quantity' => '1'];
        $this->postJson($this->endpoint($product), $payload)->assertNotFound();
        $this->postJson($this->endpoint($service), $payload)->assertNotFound();
        $this->postJson($this->endpoint($raw), $payload)->assertNotFound();
        $this->assertDatabaseCount('stock_movements', 0);
    }

    public function test_accountants_cannot_produce_and_foreign_tenant_inputs_are_hidden(): void
    {
        [$product, $raw, $other, $warehouse] = $this->workspace(OrganizationRole::Accountant);
        $this->postJson($this->endpoint($product), $this->payload($raw, $other, $warehouse))->assertForbidden();
        [$ownProduct, $ownRaw, $ownOther, $ownWarehouse] = $this->workspace();
        $this->getJson($this->endpoint($product))->assertNotFound();
        $this->postJson($this->endpoint($ownProduct), $this->payload($raw, $ownOther, $ownWarehouse))->assertNotFound();
        $this->postJson($this->endpoint($ownProduct), $this->payload($ownRaw, $ownOther, $warehouse))->assertNotFound();
        $this->assertDatabaseCount('stock_movements', 0);
    }

    public function test_untracked_and_archived_materials_cannot_be_consumed(): void
    {
        [$product, $raw, $other, $warehouse] = $this->workspace();
        $raw->update(['track_inventory' => false]);
        $other->delete();
        $payload = $this->payload($raw, $other, $warehouse);
        $this->postJson($this->endpoint($product), [...$payload, 'materials' => [$payload['materials'][0]]])->assertUnprocessable();
        $this->postJson($this->endpoint($product), [...$payload, 'materials' => [$payload['materials'][1]]])->assertNotFound();
        $this->assertDatabaseCount('stock_movements', 0);
    }

    public function test_raw_material_catalog_and_inventory_workflows_are_available(): void
    {
        [, , , $warehouse] = $this->workspace();
        $payload = ['type' => 'raw_material', 'name' => 'Flour', 'unit' => 'kg', 'unit_price' => '2', 'tax_rate' => '0'];
        $rawId = $this->postJson('/api/products', $payload)->assertCreated()->assertJsonPath('data.inventory_eligible', true)->json('data.id');
        $this->patchJson('/api/inventory/products/'.$rawId.'/settings', ['track_inventory' => true])->assertOk();
        $this->postJson('/api/inventory/products/'.$rawId.'/opening-stock', ['warehouse_id' => $warehouse->id, 'quantity' => '20'])->assertOk();
        $this->getJson('/api/inventory/products/'.$rawId)->assertOk();
        $this->getJson('/api/products?type=raw_material')->assertOk()->assertJsonCount(3, 'data');
        $this->patchJson('/api/products/'.$rawId, [...$payload, 'type' => 'service'])->assertUnprocessable();
        $this->patchJson('/api/products/'.$rawId, [...$payload, 'type' => 'product'])->assertUnprocessable();
        $this->getJson('/api/warehouses/'.$warehouse->id.'/inventory-products')->assertOk();
    }

    private function endpoint(Product $product): string
    {
        return '/api/products/'.$product->id.'/production';
    }

    /** @return array{warehouse_id: int, quantity: string, materials: list<array{product_id: int, quantity: string}>} */
    private function payload(Product $raw, Product $other, Warehouse $warehouse): array
    {
        return ['warehouse_id' => $warehouse->id, 'quantity' => '2', 'materials' => [
            ['product_id' => $raw->id, 'quantity' => '3.25'],
            ['product_id' => $other->id, 'quantity' => '1.5'],
        ]];
    }

    /** @return array{Product, Product, Product, Warehouse} */
    private function workspace(OrganizationRole $role = OrganizationRole::Owner): array
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Production workspace']);
        $organization->users()->attach($user->id, ['role' => $role->value]);
        app(TenantContext::class)->set($organization, $role);
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);
        $product = Product::factory()->create(['type' => 'product', 'track_inventory' => true]);
        $raw = Product::factory()->create(['type' => 'raw_material', 'track_inventory' => true, 'unit' => 'kg']);
        $other = Product::factory()->create(['type' => 'raw_material', 'track_inventory' => true, 'unit' => 'liter']);
        $warehouse = Warehouse::create(['code' => 'WH-001', 'name' => 'Factory']);
        InventoryBalance::create(['product_id' => $raw->id, 'warehouse_id' => $warehouse->id, 'on_hand' => '10', 'reserved' => '2']);
        InventoryBalance::create(['product_id' => $other->id, 'warehouse_id' => $warehouse->id, 'on_hand' => '5', 'reserved' => '0']);

        return [$product, $raw, $other, $warehouse];
    }
}
