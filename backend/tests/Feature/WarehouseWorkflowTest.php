<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class WarehouseWorkflowTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify default selection happens after creation, codes remain monotonic,
     * and client input cannot make every newly created warehouse default.
     */
    public function test_owner_can_manage_warehouse_lifecycle_without_reusing_codes(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace(
                'owner',
                'Inventory Workspace',
            );

        $this
            ->actingAs(
                $owner,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $first =
            $this->postJson(
                '/api/warehouses',
                [
                    'name' => 'Main Warehouse',
                ],
            )
                ->assertCreated()
                ->assertJsonPath(
                    'data.code',
                    'WH-001',
                )
                ->assertJsonPath(
                    'data.is_default',
                    true,
                );

        $second =
            $this->postJson(
                '/api/warehouses',
                [
                    'name' => 'Branch Warehouse',

                    /*
                     * Unknown client input must not silently change default
                     * lifecycle behavior.
                     */
                    'is_default' => true,
                ],
            )
                ->assertCreated()
                ->assertJsonPath(
                    'data.code',
                    'WH-002',
                )
                ->assertJsonPath(
                    'data.is_default',
                    false,
                );

        $firstId =
            $first->json(
                'data.id',
            );

        $secondId =
            $second->json(
                'data.id',
            );

        $this->postJson(
            "/api/warehouses/{$secondId}/default",
        )
            ->assertOk()
            ->assertJsonPath(
                'data.is_default',
                true,
            );

        $this->assertDatabaseHas(
            'warehouses',
            [
                'id' => $firstId,

                'is_default' => false,
            ],
        );

        $this->deleteJson(
            "/api/warehouses/{$firstId}",
        )->assertNoContent();

        $this->postJson(
            '/api/warehouses',
            [
                'name' => 'Second Branch',
            ],
        )
            ->assertCreated()
            ->assertJsonPath(
                'data.code',
                'WH-003',
            );
    }

    /**
     * Verify a current default warehouse cannot be archived.
     */
    public function test_default_warehouse_cannot_be_archived(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace(
                'owner',
                'Protected Warehouse Workspace',
            );

        $this
            ->actingAs(
                $owner,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $warehouse =
            $this->postJson(
                '/api/warehouses',
                [
                    'name' => 'Main Warehouse',
                ],
            )->assertCreated();

        $warehouseId =
            $warehouse->json(
                'data.id',
            );

        $this->deleteJson(
            "/api/warehouses/{$warehouseId}",
        )
            ->assertUnprocessable()
            ->assertJsonPath(
                'error_codes.warehouse.0',
                'warehouse_default_archive_blocked',
            );
    }

    /**
     * Verify Accountants can read Inventory but cannot mutate warehouses.
     */
    public function test_accountant_can_view_but_cannot_manage_warehouses(): void
    {
        [
            $accountant,
            $organization,
        ] =
            $this->workspace(
                'accountant',
                'Accounting Workspace',
            );

        $this
            ->actingAs(
                $accountant,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $this->getJson(
            '/api/warehouses',
        )->assertOk();

        $this->postJson(
            '/api/warehouses',
            [
                'name' => 'Restricted Warehouse',
            ],
        )->assertForbidden();
    }

    /**
     * Verify warehouse lists remain isolated between workspaces.
     */
    public function test_warehouse_index_is_tenant_isolated(): void
    {
        [
            $ownerA,
            $organizationA,
        ] =
            $this->workspace(
                'owner',
                'Workspace A',
            );

        [
            $ownerB,
            $organizationB,
        ] =
            $this->workspace(
                'owner',
                'Workspace B',
            );

        $this
            ->actingAs(
                $ownerA,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organizationA->id,
            ]);

        $warehouseA =
            $this->postJson(
                '/api/warehouses',
                [
                    'name' => 'Warehouse A',
                ],
            )->assertCreated();

        $this
            ->actingAs(
                $ownerB,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organizationB->id,
            ]);

        $this->postJson(
            '/api/warehouses',
            [
                'name' => 'Warehouse B',
            ],
        )->assertCreated();

        $response =
            $this->getJson(
                '/api/warehouses',
            )
                ->assertOk()
                ->assertJsonCount(
                    1,
                    'data',
                );

        $this->assertNotSame(
            $warehouseA->json(
                'data.id',
            ),
            $response->json(
                'data.0.id',
            ),
        );
    }

    /**
     * Verify Manager may restore archived warehouses but cannot permanently
     * delete them.
     */
    public function test_manager_can_restore_but_cannot_permanently_delete_warehouses(): void
    {
        [
            $manager,
            $organization,
        ] =
            $this->workspace(
                'manager',
                'Operations Workspace',
            );

        $this
            ->actingAs(
                $manager,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $this->postJson(
            '/api/warehouses',
            [
                'name' => 'Primary',
            ],
        )->assertCreated();

        $second =
            $this->postJson(
                '/api/warehouses',
                [
                    'name' => 'Overflow',
                ],
            )->assertCreated();

        $secondId =
            $second->json(
                'data.id',
            );

        $this->deleteJson(
            "/api/warehouses/{$secondId}",
        )->assertNoContent();

        $this->deleteJson(
            "/api/warehouses/{$secondId}/permanent",
        )->assertForbidden();

        $this->postJson(
            "/api/warehouses/{$secondId}/restore",
        )
            ->assertOk()
            ->assertJsonPath(
                'data.code',
                'WH-002',
            );
    }

    /**
     * Verify Owner can permanently remove an empty archived warehouse.
     */
    public function test_owner_can_permanently_delete_empty_archived_warehouse(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace(
                'owner',
                'Deletion Workspace',
            );

        $this
            ->actingAs(
                $owner,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $this->postJson(
            '/api/warehouses',
            [
                'name' => 'Primary',
            ],
        )->assertCreated();

        $second =
            $this->postJson(
                '/api/warehouses',
                [
                    'name' => 'Disposable',
                ],
            )->assertCreated();

        $secondId =
            $second->json(
                'data.id',
            );

        $this->deleteJson(
            "/api/warehouses/{$secondId}",
        )->assertNoContent();

        $this->deleteJson(
            "/api/warehouses/{$secondId}/permanent",
        )->assertNoContent();

        $this->assertDatabaseMissing(
            'warehouses',
            [
                'id' => $secondId,
            ],
        );
    }

    /**
     * Verify immutable stock history blocks permanent warehouse deletion even
     * when the warehouse currently contains zero stock.
     */
    public function test_stock_history_blocks_permanent_warehouse_deletion(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace(
                'owner',
                'Historical Warehouse Workspace',
            );

        $this
            ->actingAs(
                $owner,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $this->postJson(
            '/api/warehouses',
            [
                'name' => 'Primary',
            ],
        )->assertCreated();

        $warehouse =
            $this->postJson(
                '/api/warehouses',
                [
                    'name' => 'Historical',
                ],
            )->assertCreated();

        $warehouseId =
            $warehouse->json(
                'data.id',
            );

        $productId =
            DB::table(
                'products',
            )->insertGetId([
                'organization_id' => $organization->id,

                'type' => 'product',

                'name' => 'Historical Product',

                'sku' => 'HIST-001',

                'unit' => 'unit',

                'unit_price' => '10.0000',

                'cost_price' => '4.0000',

                'tax_rate' => '0.00',

                'track_inventory' => true,

                'created_at' => now(),

                'updated_at' => now(),
            ]);

        DB::table(
            'stock_movements',
        )->insert([
            'organization_id' => $organization->id,

            'warehouse_id' => $warehouseId,

            'product_id' => $productId,

            'created_by' => $owner->id,

            'type' => 'adjustment',

            'quantity' => '0.0000',

            'balance_after' => '0.0000',

            'note' => 'Historical audit event',

            'created_at' => now(),

            'updated_at' => now(),
        ]);

        $this->deleteJson(
            "/api/warehouses/{$warehouseId}",
        )->assertNoContent();

        $this->deleteJson(
            "/api/warehouses/{$warehouseId}/permanent",
        )
            ->assertUnprocessable()
            ->assertJsonPath(
                'error_codes.warehouse.0',
                'permanent_delete_blocked',
            );

        $this->assertDatabaseHas(
            'warehouses',
            [
                'id' => $warehouseId,
            ],
        );
    }

    /**
     * Create one organization membership for Inventory API tests.
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
}
