<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Product;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductWorkflowTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify the complete Product lifecycle from creation through restoration.
     */
    public function test_owner_can_operate_product_catalog_workflow(): void
    {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => 'Catalog Workspace',
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

        $response =
            $this->postJson(
                '/api/products',
                [
                    'type' => 'service',

                    'name' => 'Monthly Consulting',

                    'sku' => 'consult-001',

                    'description' => 'Monthly advisory service.',

                    'unit' => 'hour',

                    'unit_price' => '125.5000',

                    'cost_price' => '50.0000',

                    'tax_rate' => '16',
                ],
            )
                ->assertCreated()
                ->assertJsonPath(
                    'data.name',
                    'Monthly Consulting',
                )
                ->assertJsonPath(
                    'data.sku',
                    'CONSULT-001',
                );

        $productId =
            $response->json(
                'data.id',
            );

        $this->getJson(
            '/api/products?search=Consulting&type=service',
        )
            ->assertOk()
            ->assertJsonCount(
                1,
                'data',
            );

        $this->patchJson(
            "/api/products/{$productId}",
            [
                'type' => 'service',

                'name' => 'Premium Consulting',

                'sku' => 'CONSULT-001',

                'description' => 'Premium advisory service.',

                'unit' => 'hour',

                'unit_price' => '150.0000',

                'cost_price' => '60.0000',

                'tax_rate' => '16',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.name',
                'Premium Consulting',
            );

        $this->deleteJson(
            "/api/products/{$productId}",
        )->assertNoContent();

        $archived =
            Product::query()
                ->withoutGlobalScopes()
                ->withTrashed()
                ->findOrFail(
                    $productId,
                );

        $this->assertTrue(
            $archived->trashed(),
        );

        $this->assertFalse(
            $archived
                ->isUsableForNewBusiness(),
        );

        $this->getJson(
            '/api/products?status=deleted',
        )
            ->assertOk()
            ->assertJsonCount(
                1,
                'data',
            );

        $this->postJson(
            "/api/products/{$productId}/restore",
        )
            ->assertOk()
            ->assertJsonPath(
                'data.usable_for_new_business',
                true,
            );
    }

    /**
     * Verify SKU values cannot be duplicated inside one organization.
     */
    public function test_product_sku_is_unique_inside_workspace(): void
    {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => 'SKU Workspace',
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

        $payload = [
            'type' => 'product',

            'name' => 'First Product',

            'sku' => 'ABC-001',

            'unit' => 'unit',

            'unit_price' => '10',

            'cost_price' => null,

            'tax_rate' => '0',
        ];

        $this->postJson(
            '/api/products',
            $payload,
        )->assertCreated();

        $payload['name'] =
            'Second Product';

        $this->postJson(
            '/api/products',
            $payload,
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'sku',
            ]);
    }
}
