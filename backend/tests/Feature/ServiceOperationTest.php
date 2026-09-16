<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\Party;
use App\Models\Product;
use App\Models\ServiceOperation;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ServiceOperationTest extends TestCase
{
    use RefreshDatabase;

    public function test_each_customer_operation_has_its_own_quantity_and_price_without_stock(): void
    {
        $this->workspace();
        $service = Product::factory()->create(['type' => 'service', 'unit' => 'trip', 'unit_price' => '100']);
        $first = $this->customer();
        $second = $this->customer();

        $this->postJson($this->endpoint($service), $this->payload($first))
            ->assertCreated()->assertJsonPath('data.subtotal', '300.0000');
        $this->postJson($this->endpoint($service), $this->payload($second, '2.5', '80.25'))
            ->assertCreated()->assertJsonPath('data.subtotal', '200.6250')
            ->assertJsonPath('data.unit', 'trip');

        $this->getJson($this->endpoint($service))->assertOk()->assertJsonCount(2, 'data');
        $this->assertDatabaseHas('products', ['id' => $service->id, 'unit_price' => '100.0000', 'track_inventory' => false]);
        $this->assertDatabaseCount('inventory_balances', 0);
        $this->assertDatabaseCount('stock_movements', 0);
    }

    public function test_price_and_quantity_validation_and_server_calculated_total(): void
    {
        $this->workspace();
        $service = Product::factory()->create(['type' => 'service']);
        $customer = $this->customer();
        foreach (['0', '-1', '0.00001', '1000000', '1e2'] as $quantity) {
            $this->postJson($this->endpoint($service), $this->payload($customer, $quantity))
                ->assertUnprocessable()->assertJsonValidationErrors('quantity');
        }
        foreach (['-1', '1.00001', '1000000'] as $price) {
            $this->postJson($this->endpoint($service), $this->payload($customer, '1', $price))
                ->assertUnprocessable()->assertJsonValidationErrors('unit_price');
        }
        $this->postJson($this->endpoint($service), [...$this->payload($customer, '0.3333', '0.3333'), 'subtotal' => '999'])
            ->assertCreated()->assertJsonPath('data.subtotal', '0.1111');
        $this->postJson($this->endpoint($service), $this->payload($customer, '1', '0'))
            ->assertCreated()->assertJsonPath('data.subtotal', '0.0000');
    }

    public function test_physical_products_archived_services_and_parties_without_roles_are_rejected(): void
    {
        $this->workspace();
        $physical = Product::factory()->create(['type' => 'product']);
        $archived = Product::factory()->create(['type' => 'service']);
        $archived->delete();
        $service = Product::factory()->create(['type' => 'service']);
        $customer = $this->customer();
        $supplier = Party::factory()->person()->create();
        $archivedCustomer = $this->customer();
        $archivedCustomer->delete();

        $this->postJson($this->endpoint($physical), $this->payload($customer))->assertNotFound();
        $this->postJson($this->endpoint($archived), $this->payload($customer))->assertNotFound();
        $this->postJson($this->endpoint($service), $this->payload($supplier))
            ->assertUnprocessable()->assertJsonValidationErrors('party_id');
        $this->postJson($this->endpoint($service), $this->payload($archivedCustomer))
            ->assertUnprocessable()->assertJsonValidationErrors('party_id');
        $this->assertDatabaseCount('service_operations', 0);
    }

    public function test_suppliers_can_have_operations_but_archived_and_foreign_suppliers_are_rejected(): void
    {
        $this->workspace();
        $foreignSupplier = Party::factory()->person()->create();
        $foreignSupplier->roles()->create(['role' => 'supplier']);
        $this->workspace();
        $service = Product::factory()->create(['type' => 'service']);
        $supplier = Party::factory()->company()->create();
        $supplier->roles()->create(['role' => 'supplier']);
        $this->postJson($this->endpoint($service), $this->payload($supplier))
            ->assertCreated()->assertJsonPath('data.customer_name', $supplier->company_name)
            ->assertJsonPath('data.subtotal', '300.0000');
        $this->postJson($this->endpoint($service), $this->payload($foreignSupplier))
            ->assertUnprocessable()->assertJsonValidationErrors('party_id');
        $this->deleteJson('/api/parties/'.$supplier->id)->assertNoContent();
        $this->postJson($this->endpoint($service), $this->payload($supplier))
            ->assertUnprocessable()->assertJsonValidationErrors('party_id');
        $this->assertDatabaseCount('service_operations', 1);
        $this->assertDatabaseCount('stock_movements', 0);
    }

    public function test_service_operations_are_tenant_isolated(): void
    {
        $this->workspace();
        $foreignService = Product::factory()->create(['type' => 'service']);
        $foreignCustomer = $this->customer();
        ServiceOperation::factory()->create(['product_id' => $foreignService->id, 'party_id' => $foreignCustomer->id]);

        $this->workspace();
        $service = Product::factory()->create(['type' => 'service']);
        $customer = $this->customer();
        $this->getJson($this->endpoint($foreignService))->assertNotFound();
        $this->postJson($this->endpoint($foreignService), $this->payload($customer))->assertNotFound();
        $this->postJson($this->endpoint($service), $this->payload($foreignCustomer))
            ->assertUnprocessable()->assertJsonValidationErrors('party_id');
        $this->getJson($this->endpoint($service))->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_employee_can_read_but_cannot_record_service_operations(): void
    {
        $this->workspace(OrganizationRole::Employee);
        $service = Product::factory()->create(['type' => 'service']);
        $customer = $this->customer();
        $this->getJson($this->endpoint($service))->assertOk();
        $this->postJson($this->endpoint($service), $this->payload($customer))->assertForbidden();
        $this->assertDatabaseCount('service_operations', 0);
    }

    public function test_history_preserves_original_details_and_survives_archiving(): void
    {
        $organization = $this->workspace(OrganizationRole::Accountant);
        $service = Product::factory()->create(['type' => 'service', 'name' => 'Transport', 'unit' => 'trip']);
        $customer = $this->customer();
        $customerName = $customer->name;
        $this->postJson($this->endpoint($service), $this->payload($customer))->assertCreated();

        app(TenantContext::class)->set($organization, OrganizationRole::Accountant);
        $service->update(['name' => 'Changed', 'unit' => 'hour', 'unit_price' => '900']);
        $service->delete();
        $customer->delete();
        $this->getJson($this->endpoint($service))->assertOk()
            ->assertJsonPath('data.0.service_name', 'Transport')
            ->assertJsonPath('data.0.customer_name', $customerName)
            ->assertJsonPath('data.0.unit', 'trip')
            ->assertJsonPath('data.0.unit_price', '100.0000');
    }

    public function test_recorded_operations_protect_service_and_customer_from_permanent_deletion(): void
    {
        $this->workspace();
        $service = Product::factory()->create(['type' => 'service']);
        $customer = $this->customer();
        $this->postJson($this->endpoint($service), $this->payload($customer))->assertCreated();
        $this->deleteJson('/api/products/'.$service->id)->assertNoContent();
        $this->deleteJson('/api/products/'.$service->id.'/permanent')->assertUnprocessable();
        $this->deleteJson('/api/parties/'.$customer->id)->assertNoContent();
        $this->deleteJson('/api/parties/'.$customer->id.'/permanent')->assertUnprocessable();
        $this->getJson($this->endpoint($service))->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_history_is_paginated_and_remains_readable_after_service_type_changes(): void
    {
        $this->workspace();
        $service = Product::factory()->create(['type' => 'service']);
        $customer = $this->customer();
        ServiceOperation::factory()->count(11)->create(['product_id' => $service->id, 'party_id' => $customer->id]);
        $service->update(['type' => 'product']);
        $this->getJson($this->endpoint($service))->assertOk()->assertJsonCount(10, 'data')->assertJsonPath('meta.last_page', 2);
        $this->getJson($this->endpoint($service).'?page=2')->assertOk()->assertJsonCount(1, 'data');
        $this->postJson($this->endpoint($service), $this->payload($customer))->assertNotFound();
    }

    /** @return array{party_id: int, performed_on: string, quantity: string, unit_price: string} */
    private function payload(Party $customer, string $quantity = '3', string $price = '100'): array
    {
        return ['party_id' => $customer->id, 'performed_on' => '2026-09-16', 'quantity' => $quantity, 'unit_price' => $price];
    }

    private function endpoint(Product $product): string
    {
        return '/api/products/'.$product->id.'/service-operations';
    }

    private function customer(): Party
    {
        $party = Party::factory()->person()->create();
        $party->roles()->create(['role' => 'customer']);

        return $party;
    }

    private function workspace(OrganizationRole $role = OrganizationRole::Owner): Organization
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Service Workspace']);
        $organization->users()->attach($user->id, ['role' => $role->value]);
        app(TenantContext::class)->set($organization, $role);
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        return $organization;
    }
}
