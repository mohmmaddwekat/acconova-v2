<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductServiceInventoryRulesTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify a Service is commercial-only and never appears as warehouse
     * inventory.
     */
    public function test_service_never_becomes_warehouse_inventory(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace();

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $warehouseId =
            $this->createWarehouse();

        $service =
            $this->postJson(
                '/api/products',
                $this->catalogPayload(
                    type: 'service',

                    name: 'Transport',

                    unit: 'trip',
                ),
            )
                ->assertCreated()
                ->assertJsonPath(
                    'data.type',
                    'service',
                )
                ->assertJsonPath(
                    'data.inventory_eligible',
                    false,
                )
                ->assertJsonPath(
                    'data.track_inventory',
                    false,
                )
                ->assertJsonPath(
                    'data.low_stock_threshold',
                    null,
                );

        $serviceId =
            (int) $service->json(
                'data.id',
            );

        /*
         * Inventory Product endpoints deliberately do not treat Services as
         * physical stock entities.
         */
        $this->getJson(
            "/api/inventory/products/{$serviceId}",
        )->assertNotFound();

        $warehouse =
            $this->getJson(
                "/api/warehouses/{$warehouseId}/inventory-products",
            )->assertOk();

        $ids =
            collect(
                $warehouse->json(
                    'data.products',
                ),
            )->pluck(
                'id',
            );

        $this->assertFalse(
            $ids->contains(
                $serviceId,
            ),
        );
    }

    /**
     * Verify Product-to-Service conversion is allowed before inventory history
     * exists and automatically disables tracking.
     */
    public function test_clean_product_can_be_changed_to_service(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace();

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $product =
            $this->postJson(
                '/api/products',
                $this->catalogPayload(
                    type: 'product',

                    name: 'Physical Item',

                    unit: 'piece',
                ),
            )->assertCreated();

        $productId =
            (int) $product->json(
                'data.id',
            );

        $this->patchJson(
            "/api/inventory/products/{$productId}/settings",
            [
                'track_inventory' => true,

                'low_stock_threshold' => '5',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.track_inventory',
                true,
            );

        $sku =
            $product->json(
                'data.sku',
            );

        $this->patchJson(
            "/api/products/{$productId}",
            $this->catalogPayload(
                type: 'service',

                name: 'Installation',

                unit: 'job',

                sku: $sku,
            ),
        )
            ->assertOk()
            ->assertJsonPath(
                'data.type',
                'service',
            )
            ->assertJsonPath(
                'data.inventory_eligible',
                false,
            )
            ->assertJsonPath(
                'data.track_inventory',
                false,
            )
            ->assertJsonPath(
                'data.low_stock_threshold',
                null,
            );

        $this->assertDatabaseHas(
            'products',
            [
                'id' => $productId,

                'type' => 'service',

                'track_inventory' => false,

                'low_stock_threshold' => null,
            ],
        );
    }

    /**
     * Verify a Product carrying stock cannot be reclassified as a Service.
     */
    public function test_product_with_stock_cannot_be_changed_to_service(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace();

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $product =
            $this->postJson(
                '/api/products',
                $this->catalogPayload(
                    type: 'product',

                    name: 'Stocked Item',

                    unit: 'piece',
                ),
            )->assertCreated();

        $productId =
            (int) $product->json(
                'data.id',
            );

        $warehouseId =
            $this->createWarehouse();

        $this->enableTracking(
            $productId,
        );

        $this->postJson(
            "/api/inventory/products/{$productId}/opening-stock",
            [
                'warehouse_id' => $warehouseId,

                'quantity' => '10',
            ],
        )->assertOk();

        $this->patchJson(
            "/api/products/{$productId}",
            $this->catalogPayload(
                type: 'service',

                name: 'Stocked Item',

                unit: 'job',

                sku: $product->json(
                    'data.sku',
                ),
            ),
        )
            ->assertUnprocessable()
            ->assertJsonPath(
                'error_codes.type.0',
                'product_to_service_stock_blocked',
            );

        $this->assertDatabaseHas(
            'products',
            [
                'id' => $productId,

                'type' => 'product',
            ],
        );
    }

    /**
     * Verify zero current stock does not erase the meaning of historical stock
     * movements.
     */
    public function test_product_with_stock_history_cannot_be_changed_to_service(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace();

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $product =
            $this->postJson(
                '/api/products',
                $this->catalogPayload(
                    type: 'product',

                    name: 'Historical Item',

                    unit: 'piece',
                ),
            )->assertCreated();

        $productId =
            (int) $product->json(
                'data.id',
            );

        $warehouseId =
            $this->createWarehouse();

        $this->enableTracking(
            $productId,
        );

        $this->postJson(
            "/api/inventory/products/{$productId}/opening-stock",
            [
                'warehouse_id' => $warehouseId,

                'quantity' => '5',
            ],
        )->assertOk();

        $this->postJson(
            "/api/inventory/products/{$productId}/adjust",
            [
                'warehouse_id' => $warehouseId,

                'quantity' => '-5',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.on_hand',
                '0.0000',
            );

        $this->patchJson(
            "/api/products/{$productId}",
            $this->catalogPayload(
                type: 'service',

                name: 'Historical Item',

                unit: 'job',

                sku: $product->json(
                    'data.sku',
                ),
            ),
        )
            ->assertUnprocessable()
            ->assertJsonPath(
                'error_codes.type.0',
                'product_to_service_history_blocked',
            );
    }

    /**
     * Verify a Service may become a Product but starts without inventory
     * tracking or inherited warehouse quantity.
     */
    public function test_service_can_be_changed_to_product_but_starts_untracked(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace();

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $service =
            $this->postJson(
                '/api/products',
                $this->catalogPayload(
                    type: 'service',

                    name: 'Maintenance',

                    unit: 'hour',
                ),
            )->assertCreated();

        $serviceId =
            (int) $service->json(
                'data.id',
            );

        $this->patchJson(
            "/api/products/{$serviceId}",
            $this->catalogPayload(
                type: 'product',

                name: 'Maintenance Kit',

                unit: 'piece',

                sku: $service->json(
                    'data.sku',
                ),
            ),
        )
            ->assertOk()
            ->assertJsonPath(
                'data.type',
                'product',
            )
            ->assertJsonPath(
                'data.inventory_eligible',
                true,
            )
            ->assertJsonPath(
                'data.track_inventory',
                false,
            )
            ->assertJsonPath(
                'data.low_stock_threshold',
                null,
            );
    }

    /**
     * Build a valid catalog API payload.
     *
     * @return array<string, mixed>
     */
    private function catalogPayload(
        string $type,
        string $name,
        string $unit,
        ?string $sku = null,
    ): array {
        return [
            'type' => $type,

            'name' => $name,

            'sku' => $sku,

            'description' => null,

            'unit' => $unit,

            'unit_price' => '50.0000',

            'cost_price' => null,

            'tax_rate' => '0',
        ];
    }

    /**
     * Enable Inventory for one physical Product.
     */
    private function enableTracking(
        int $productId,
    ): void {
        $this->patchJson(
            "/api/inventory/products/{$productId}/settings",
            [
                'track_inventory' => true,

                'low_stock_threshold' => '2',
            ],
        )->assertOk();
    }

    /**
     * Create one active warehouse and return its identifier.
     */
    private function createWarehouse(): int
    {
        $response =
            $this->postJson(
                '/api/warehouses',
                [
                    'name' => 'Main Warehouse',
                ],
            )->assertCreated();

        return (int) $response->json(
            'data.id',
        );
    }

    /**
     * Create one Owner workspace.
     *
     * @return array{0: User, 1: Organization}
     */
    private function workspace(): array
    {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => 'Service Semantics Workspace',
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        return [
            $user,
            $organization,
        ];
    }

    /**
     * Authenticate one user against the selected active workspace.
     */
    private function actingInWorkspace(
        User $user,
        Organization $organization,
    ): void {
        $this
            ->actingAs(
                $user,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);
    }
}
