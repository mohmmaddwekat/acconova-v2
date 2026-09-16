<?php

namespace Tests\Feature;

use App\Events\InventoryTrackingChanged;
use App\Events\LowStockReached;
use App\Events\OpeningStockRecorded;
use App\Events\OutOfStockReached;
use App\Events\StockMovementRecorded;
use App\Events\StockTransferred;
use App\Listeners\EvaluateStockLevelAlerts;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class InventoryStockWorkflowTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify an Owner can enable tracking and record opening stock.
     */
    public function test_owner_can_enable_tracking_and_record_opening_stock(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace(
                'owner',
                'Inventory Workflow',
            );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $productId =
            $this->createProduct();

        $warehouseId =
            $this->createWarehouse(
                'Main Warehouse',
            );

        Event::fake([
            InventoryTrackingChanged::class,
            OpeningStockRecorded::class,
            StockMovementRecorded::class,
        ]);

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

        $this->postJson(
            "/api/inventory/products/{$productId}/opening-stock",
            [
                'warehouse_id' => $warehouseId,

                'quantity' => '10',

                'note' => 'Opening count',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.on_hand',
                '10.0000',
            )
            ->assertJsonPath(
                'data.available',
                '10.0000',
            );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $productId,

                'warehouse_id' => $warehouseId,

                'on_hand' => '10.0000',
            ],
        );

        $this->assertDatabaseHas(
            'stock_movements',
            [
                'product_id' => $productId,

                'warehouse_id' => $warehouseId,

                'type' => 'opening',

                'quantity' => '10.0000',
            ],
        );

        Event::assertDispatched(
            InventoryTrackingChanged::class,
        );

        Event::assertDispatched(
            OpeningStockRecorded::class,
        );

        Event::assertDispatched(
            StockMovementRecorded::class,
        );
    }

    /**
     * Verify stock adjustments can never create negative physical stock.
     */
    public function test_adjustment_cannot_reduce_stock_below_zero(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace(
                'owner',
                'Adjustment Workspace',
            );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $productId =
            $this->createProduct();

        $warehouseId =
            $this->createWarehouse(
                'Main Warehouse',
            );

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

                'quantity' => '-6',
            ],
        )
            ->assertUnprocessable()
            ->assertJsonPath(
                'error_codes.inventory.0',
                'inventory_insufficient_stock',
            );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $productId,

                'warehouse_id' => $warehouseId,

                'on_hand' => '5.0000',
            ],
        );
    }

    /**
     * Verify transfers update both warehouses atomically.
     */
    public function test_stock_can_be_transferred_between_warehouses(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace(
                'owner',
                'Transfer Workspace',
            );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $productId =
            $this->createProduct();

        $sourceId =
            $this->createWarehouse(
                'Main Warehouse',
            );

        $destinationId =
            $this->createWarehouse(
                'Branch Warehouse',
            );

        $this->enableTracking(
            $productId,
        );

        $this->postJson(
            "/api/inventory/products/{$productId}/opening-stock",
            [
                'warehouse_id' => $sourceId,

                'quantity' => '10',
            ],
        )->assertOk();

        Event::fake([
            StockTransferred::class,
            StockMovementRecorded::class,
        ]);

        $this->postJson(
            "/api/inventory/products/{$productId}/transfer",
            [
                'source_warehouse_id' => $sourceId,

                'destination_warehouse_id' => $destinationId,

                'quantity' => '4',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.on_hand',
                '10.0000',
            );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $productId,

                'warehouse_id' => $sourceId,

                'on_hand' => '6.0000',
            ],
        );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $productId,

                'warehouse_id' => $destinationId,

                'on_hand' => '4.0000',
            ],
        );

        Event::assertDispatched(
            StockTransferred::class,
        );

        Event::assertDispatchedTimes(
            StockMovementRecorded::class,
            2,
        );
    }

    /**
     * Verify Accountants may inspect stock but cannot mutate it.
     */
    public function test_accountant_can_view_inventory_but_cannot_mutate_stock(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace(
                'owner',
                'Read Only Inventory',
            );

        $accountant =
            User::factory()
                ->create();

        $organization
            ->users()
            ->attach(
                $accountant->id,
                [
                    'role' => 'accountant',
                ],
            );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $productId =
            $this->createProduct();

        $this->actingInWorkspace(
            $accountant,
            $organization,
        );

        $this->getJson(
            "/api/inventory/products/{$productId}",
        )->assertOk();

        $this->patchJson(
            "/api/inventory/products/{$productId}/settings",
            [
                'track_inventory' => true,
            ],
        )->assertForbidden();
    }

    /**
     * Verify committed balance transitions produce low/out-of-stock domain
     * events suitable for future notification listeners.
     */
    public function test_stock_level_listener_emits_business_alert_events(): void
    {
        Event::fake([
            LowStockReached::class,
            OutOfStockReached::class,
        ]);

        $listener =
            app(
                EvaluateStockLevelAlerts::class,
            );

        $listener->handle(
            new StockMovementRecorded(
                organizationId: 1,

                productId: 10,

                warehouseId: 20,

                movementId: 30,

                movementType: 'adjustment',

                previousAvailable: '10.0000',

                currentAvailable: '4.0000',

                lowStockThreshold: '5.0000',

                actorId: 99,
            ),
        );

        Event::assertDispatched(
            LowStockReached::class,
        );

        $listener->handle(
            new StockMovementRecorded(
                organizationId: 1,

                productId: 10,

                warehouseId: 20,

                movementId: 31,

                movementType: 'adjustment',

                previousAvailable: '4.0000',

                currentAvailable: '0.0000',

                lowStockThreshold: '5.0000',

                actorId: 99,
            ),
        );

        Event::assertDispatched(
            OutOfStockReached::class,
        );
    }

    /**
     * Create one Product through the real catalog API.
     */
    private function createProduct(): int
    {
        $response =
            $this->postJson(
                '/api/products',
                [
                    'type' => 'product',

                    'name' => 'Tracked Product',

                    'sku' => null,

                    'description' => null,

                    'unit' => 'unit',

                    'unit_price' => '20.0000',

                    'cost_price' => '10.0000',

                    'tax_rate' => '0',
                ],
            )->assertCreated();

        return (int) $response->json(
            'data.id',
        );
    }

    /**
     * Create one warehouse through the real Inventory API.
     */
    private function createWarehouse(
        string $name,
    ): int {
        $response =
            $this->postJson(
                '/api/warehouses',
                [
                    'name' => $name,
                ],
            )->assertCreated();

        return (int) $response->json(
            'data.id',
        );
    }

    /**
     * Enable Product inventory tracking.
     */
    private function enableTracking(
        int $productId,
    ): void {
        $this->patchJson(
            "/api/inventory/products/{$productId}/settings",
            [
                'track_inventory' => true,

                'low_stock_threshold' => '5',
            ],
        )->assertOk();
    }

    /**
     * Create one workspace and membership.
     *
     * @return array{0: User, 1: Organization}
     */
    private function workspace(
        string $role,
        string $name,
    ): array {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => $name,
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => $role,
                ],
            );

        return [
            $user,
            $organization,
        ];
    }

    /**
     * Authenticate one user against a specific active workspace.
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
