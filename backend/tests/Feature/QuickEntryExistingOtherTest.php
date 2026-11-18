<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\Product;
use App\Models\User;
use App\Models\Warehouse;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuickEntryExistingOtherTest extends TestCase
{
    use RefreshDatabase;

    public function test_petty_entries_of_the_same_day_and_category_are_reported(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Existing petty workspace']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        $this->postJson('/api/quick-entry', ['rows' => [
            ['type' => 'petty', 'date' => '2026-03-02', 'category' => 'operating_expense', 'amount' => '40'],
        ]])->assertOk();

        $found = $this->getJson('/api/quick-entry/existing?type=petty&date=2026-03-02&category=operating_expense')->assertOk()->json('data');

        $this->assertCount(1, $found);
        $this->assertSame('40.0000', $found[0]['amount']);

        $this->getJson('/api/quick-entry/existing?type=petty&date=2026-03-03&category=operating_expense')->assertOk()->assertJson(['data' => []]);
        $this->getJson('/api/quick-entry/existing?type=prod&date=2026-03-02')->assertUnprocessable();
        $this->getJson('/api/quick-entry/existing?type=staff&date=2026-03-02')->assertUnprocessable();
    }

    public function test_a_production_run_of_the_same_product_and_day_is_reported(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Existing production workspace']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);

        Warehouse::create(['code' => 'MAIN', 'name' => 'Main', 'is_default' => true]);
        $resin = Product::factory()->create(['type' => 'raw_material', 'name' => 'Existing Resin', 'unit' => 'kg', 'track_inventory' => true]);
        $box = Product::factory()->create(['type' => 'product', 'name' => 'Existing Box', 'unit' => 'piece', 'track_inventory' => true]);
        $supplierId = (int) $this->postJson('/api/parties', ['type' => 'company', 'company_name' => 'Resin Co', 'roles' => ['supplier']])->assertCreated()->json('data.id');

        $this->postJson("/api/products/{$box->id}/production-recipe", [
            'components' => [['name' => 'Resin', 'options' => [['raw_material_id' => $resin->id, 'quantity_per_unit' => '0.2500', 'is_default' => true]]]],
        ])->assertCreated();

        $this->postJson('/api/quick-entry', ['rows' => [
            ['type' => 'purchase', 'date' => '2026-05-10', 'party_id' => $supplierId, 'affects_stock' => true, 'lines' => [['product_id' => $resin->id, 'quantity' => '100', 'unit_price' => '3']]],
            ['type' => 'prod', 'date' => '2026-05-10', 'product_id' => $box->id, 'quantity' => '100'],
        ]])->assertOk();

        $found = $this->getJson("/api/quick-entry/existing?type=prod&date=2026-05-10&product_id={$box->id}")->assertOk()->json('data');

        $this->assertCount(1, $found);
        $this->assertEqualsWithDelta(100.0, (float) $found[0]['amount'], 0.0001);

        $this->getJson("/api/quick-entry/existing?type=prod&date=2026-05-11&product_id={$box->id}")->assertOk()->assertJson(['data' => []]);

        $same = $this->postJson('/api/quick-entry', ['rows' => [
            ['type' => 'prod', 'date' => '2026-05-10', 'product_id' => $box->id, 'quantity' => '100'],
        ]])->assertOk()->json('data.0');

        $this->assertFalse($same['ok']);
        $this->assertStringContainsString('PR-', $same['message']);

        $other = $this->postJson('/api/quick-entry', ['rows' => [
            ['type' => 'prod', 'date' => '2026-05-10', 'product_id' => $box->id, 'quantity' => '40'],
        ]])->assertOk()->json('data.0');

        $this->assertTrue($other['ok'], json_encode($other));
    }
}
