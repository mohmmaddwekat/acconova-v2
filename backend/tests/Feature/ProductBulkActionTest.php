<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\Product;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductBulkActionTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify an owner can archive and restore multiple catalog items together.
     */
    public function test_owner_can_bulk_archive_and_restore_products(): void
    {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => 'Bulk Product Workspace',
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        $this
            ->actingAs(
                $user,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $first =
            $this->postJson(
                '/api/products',
                $this->productPayload(
                    'Bulk Product One',
                    'BULK-001',
                ),
            )
                ->assertCreated()
                ->json(
                    'data.id',
                );

        $second =
            $this->postJson(
                '/api/products',
                $this->productPayload(
                    'Bulk Product Two',
                    'BULK-002',
                ),
            )
                ->assertCreated()
                ->json(
                    'data.id',
                );

        $ids = [
            $first,
            $second,
        ];

        $this->postJson(
            '/api/products/bulk-action',
            [
                'action' => 'archive',

                'product_ids' => $ids,
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.affected',
                2,
            );

        foreach (
            $ids as $id
        ) {
            $product =
                Product::query()
                    ->withoutGlobalScopes()
                    ->withTrashed()
                    ->findOrFail(
                        $id,
                    );

            $this->assertTrue(
                $product->trashed(),
            );
        }

        $this->postJson(
            '/api/products/bulk-action',
            [
                'action' => 'restore',

                'product_ids' => $ids,
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.affected',
                2,
            );

        foreach (
            $ids as $id
        ) {
            $product =
                Product::query()
                    ->withoutGlobalScopes()
                    ->withTrashed()
                    ->findOrFail(
                        $id,
                    );

            $this->assertFalse(
                $product->trashed(),
            );
        }
    }

    /**
     * Verify accountants retain Product editing access but cannot control the
     * catalog archive lifecycle.
     */
    public function test_accountant_cannot_bulk_archive_products(): void
    {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => 'Accountant Product Workspace',
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'accountant',
                ],
            );

        $this
            ->actingAs(
                $user,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $productId =
            $this->postJson(
                '/api/products',
                $this->productPayload(
                    'Accountant Product',
                    'ACCOUNT-001',
                ),
            )
                ->assertCreated()
                ->json(
                    'data.id',
                );

        $this->postJson(
            '/api/products/bulk-action',
            [
                'action' => 'archive',

                'product_ids' => [
                    $productId,
                ],
            ],
        )->assertForbidden();

        $product =
            Product::query()
                ->withoutGlobalScopes()
                ->withTrashed()
                ->findOrFail(
                    $productId,
                );

        $this->assertFalse(
            $product->trashed(),
        );
    }

    /**
     * Verify one foreign Product ID rejects the entire bulk selection without
     * mutating valid current-tenant Products.
     */
    public function test_bulk_product_action_rejects_cross_tenant_selection(): void
    {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => 'Current Workspace',
            ]);

        $foreignOrganization =
            Organization::create([
                'name' => 'Foreign Workspace',
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        $context =
            app(
                TenantContext::class,
            );

        $context->set(
            $foreignOrganization,
            OrganizationRole::Owner,
        );

        $foreignProduct =
            Product::factory()
                ->create([
                    'name' => 'Foreign Product',

                    'sku' => 'FOREIGN-001',
                ]);

        $context->clear();

        $this
            ->actingAs(
                $user,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $currentProductId =
            $this->postJson(
                '/api/products',
                $this->productPayload(
                    'Current Product',
                    'CURRENT-001',
                ),
            )
                ->assertCreated()
                ->json(
                    'data.id',
                );

        $this->postJson(
            '/api/products/bulk-action',
            [
                'action' => 'archive',

                'product_ids' => [
                    $currentProductId,
                    $foreignProduct->id,
                ],
            ],
        )->assertNotFound();

        $currentProduct =
            Product::query()
                ->withoutGlobalScopes()
                ->withTrashed()
                ->findOrFail(
                    $currentProductId,
                );

        $this->assertFalse(
            $currentProduct->trashed(),
        );
    }

    /**
     * Build a valid Product API payload for bulk lifecycle tests.
     *
     * @return array<string, mixed>
     */
    private function productPayload(
        string $name,
        string $sku,
    ): array {
        return [
            'type' => 'product',

            'name' => $name,

            'sku' => $sku,

            'description' => null,

            'unit' => 'unit',

            'unit_price' => '25.0000',

            'cost_price' => '10.0000',

            'tax_rate' => '16',
        ];
    }
}
