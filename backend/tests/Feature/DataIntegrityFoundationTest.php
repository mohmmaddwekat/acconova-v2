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

class DataIntegrityFoundationTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify generated Product identifiers are organization-local, monotonic,
     * and never reuse a permanently deleted number.
     */
    public function test_product_skus_are_monotonic_and_never_reused(): void
    {
        [
            $user,
            $organization,
        ] = $this->workspaceMember(
            'owner',
            'First Workspace',
        );

        $this
            ->actingAs(
                $user,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $fourthId =
            null;

        foreach (
            range(
                1,
                4,
            ) as $number
        ) {
            $response =
                $this->postJson(
                    '/api/products',
                    $this->productPayload(
                        "Product {$number}",
                    ),
                )
                    ->assertCreated()
                    ->assertJsonPath(
                        'data.sku',
                        sprintf(
                            'SKU-%03d',
                            $number,
                        ),
                    );

            if (
                $number ===
                4
            ) {
                $fourthId =
                    $response->json(
                        'data.id',
                    );
            }
        }

        $this->assertNotNull(
            $fourthId,
        );

        $this->deleteJson(
            "/api/products/{$fourthId}",
        )->assertNoContent();

        $this->deleteJson(
            "/api/products/{$fourthId}/permanent",
        )->assertNoContent();

        /*
         * SKU-004 must remain retired even though its Product row no longer
         * exists physically.
         */
        $this->postJson(
            '/api/products',
            $this->productPayload(
                'After deletion',
            ),
        )
            ->assertCreated()
            ->assertJsonPath(
                'data.sku',
                'SKU-005',
            );

        /*
         * Legacy/imported standard SKUs advance the generator instead of
         * allowing future generated identifiers to collide with them.
         */
        $this->postJson(
            '/api/products',
            $this->productPayload(
                'Imported Product',
                'SKU-050',
            ),
        )
            ->assertCreated()
            ->assertJsonPath(
                'data.sku',
                'SKU-050',
            );

        $this->postJson(
            '/api/products',
            $this->productPayload(
                'After import',
            ),
        )
            ->assertCreated()
            ->assertJsonPath(
                'data.sku',
                'SKU-051',
            );

        [
            $otherUser,
            $otherOrganization,
        ] = $this->workspaceMember(
            'owner',
            'Second Workspace',
        );

        /*
         * A different SaaS tenant owns an independent sequence and therefore
         * legitimately begins from SKU-001.
         */
        $this
            ->actingAs(
                $otherUser,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $otherOrganization->id,
            ])
            ->postJson(
                '/api/products',
                $this->productPayload(
                    'Other tenant product',
                ),
            )
            ->assertCreated()
            ->assertJsonPath(
                'data.sku',
                'SKU-001',
            );
    }

    /**
     * Verify permanent deletion is stronger than archival and remains limited
     * to Owner/Admin authority.
     */
    public function test_manager_cannot_permanently_delete_archived_product(): void
    {
        [
            $manager,
            $organization,
        ] = $this->workspaceMember(
            'manager',
            'Managed Workspace',
        );

        $this
            ->actingAs(
                $manager,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $response =
            $this->postJson(
                '/api/products',
                $this->productPayload(
                    'Managed Product',
                ),
            )
                ->assertCreated();

        $productId =
            $response->json(
                'data.id',
            );

        $this->deleteJson(
            "/api/products/{$productId}",
        )->assertNoContent();

        $this->deleteJson(
            "/api/products/{$productId}/permanent",
        )->assertForbidden();

        $admin =
            User::factory()
                ->create();

        $organization
            ->users()
            ->attach(
                $admin->id,
                [
                    'role' => 'admin',
                ],
            );

        $this
            ->actingAs(
                $admin,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->deleteJson(
                "/api/products/{$productId}/permanent",
            )
            ->assertNoContent();

        $this->assertDatabaseMissing(
            'products',
            [
                'id' => $productId,
            ],
        );
    }

    /**
     * Verify the Index never needs the entire Product dataset and that every
     * entered search term must match one searchable field.
     */
    public function test_product_index_is_paginated_and_supports_multi_term_search(): void
    {
        [
            $user,
            $organization,
        ] = $this->workspaceMember(
            'owner',
            'Search Workspace',
        );

        $context =
            app(
                TenantContext::class,
            );

        $context->set(
            $organization,
            OrganizationRole::Owner,
        );

        try {
            Product::factory()
                ->count(
                    30,
                )
                ->create();

            Product::factory()
                ->create([
                    'name' => 'Ultraviolet Premium Chair',

                    'description' => 'Distinct search target',

                    'unit' => 'crate',
                ]);
        } finally {
            $context->clear();
        }

        $this
            ->actingAs(
                $user,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->getJson(
                '/api/products?per_page=25',
            )
            ->assertOk()
            ->assertJsonCount(
                25,
                'data',
            )
            ->assertJsonPath(
                'meta.total',
                31,
            );

        /*
         * Different terms can match different fields on the same Product.
         */
        $this->getJson(
            '/api/products?search=Ultraviolet%20crate',
        )
            ->assertOk()
            ->assertJsonCount(
                1,
                'data',
            )
            ->assertJsonPath(
                'data.0.name',
                'Ultraviolet Premium Chair',
            );

        /*
         * Removing one search word immediately removes that requirement on the
         * next debounced request from the React Index.
         */
        $this->getJson(
            '/api/products?search=Ultraviolet',
        )
            ->assertOk()
            ->assertJsonCount(
                1,
                'data',
            );

        $this->getJson(
            '/api/products?search=Ultraviolet%20impossibleword',
        )
            ->assertOk()
            ->assertJsonCount(
                0,
                'data',
            );
    }

    /**
     * Create one authenticated workspace membership for a test scenario.
     *
     * @return array{0: User, 1: Organization}
     */
    private function workspaceMember(
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
     * Return a valid Product request payload with an optional legacy SKU.
     *
     * @return array<string, mixed>
     */
    private function productPayload(
        string $name,
        ?string $sku = null,
    ): array {
        $payload = [
            'type' => 'product',

            'name' => $name,

            'unit' => 'unit',

            'unit_price' => '10.0000',

            'cost_price' => null,

            'tax_rate' => '0',
        ];

        if (
            $sku !==
            null
        ) {
            $payload['sku'] =
                $sku;
        }

        return $payload;
    }
}
