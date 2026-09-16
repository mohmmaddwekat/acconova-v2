<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\Party;
use App\Models\Product;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ModelRelationshipTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify users can discover their organization access graph before an
     * active tenant has been selected.
     */
    public function test_user_can_resolve_organization_memberships_without_active_tenant(): void
    {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => 'Relationship Workspace',
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        $resolvedOrganization =
            $user
                ->organizations()
                ->firstOrFail();

        $this->assertTrue(
            $resolvedOrganization->is(
                $organization,
            ),
        );

        $this->assertSame(
            'owner',
            $resolvedOrganization
                ->pivot
                ->getAttribute(
                    'role',
                ),
        );

        $membership =
            $user
                ->memberships()
                ->firstOrFail();

        $this->assertTrue(
            $membership
                ->user
                ->is(
                    $user,
                ),
        );

        $this->assertTrue(
            $membership
                ->organization
                ->is(
                    $organization,
                ),
        );

        $this->assertTrue(
            $organization
                ->memberships()
                ->firstOrFail()
                ->is(
                    $membership,
                ),
        );
    }

    /**
     * Verify Party and Product ownership can be navigated through the active
     * Organization while tenant isolation remains enabled.
     */
    public function test_business_models_are_connected_to_active_organization(): void
    {
        $organization =
            Organization::create([
                'name' => 'Business Workspace',
            ]);

        $context =
            app(
                TenantContext::class,
            );

        $context->set(
            $organization,
            OrganizationRole::Owner,
        );

        try {
            $party =
                Party::factory()
                    ->create();

            $product =
                Product::factory()
                    ->create();

            $this->assertTrue(
                $party
                    ->organization
                    ->is(
                        $organization,
                    ),
            );

            $this->assertTrue(
                $product
                    ->organization
                    ->is(
                        $organization,
                    ),
            );

            $this->assertTrue(
                $organization
                    ->parties()
                    ->whereKey(
                        $party->id,
                    )
                    ->exists(),
            );

            $this->assertTrue(
                $organization
                    ->products()
                    ->whereKey(
                        $product->id,
                    )
                    ->exists(),
            );
        } finally {
            $context->clear();
        }
    }

    /**
     * Verify the tenant global scope still prevents records from another
     * organization appearing in normal business queries.
     */
    public function test_product_queries_remain_isolated_between_organizations(): void
    {
        $first =
            Organization::create([
                'name' => 'First Workspace',
            ]);

        $second =
            Organization::create([
                'name' => 'Second Workspace',
            ]);

        $context =
            app(
                TenantContext::class,
            );

        $context->set(
            $first,
            OrganizationRole::Owner,
        );

        Product::factory()
            ->create([
                'name' => 'First Product',
            ]);

        $context->clear();

        $context->set(
            $second,
            OrganizationRole::Owner,
        );

        Product::factory()
            ->create([
                'name' => 'Second Product',
            ]);

        $context->clear();

        $context->set(
            $first,
            OrganizationRole::Owner,
        );

        try {
            $this->assertSame(
                [
                    'First Product',
                ],
                Product::query()
                    ->pluck(
                        'name',
                    )
                    ->all(),
            );
        } finally {
            $context->clear();
        }
    }
}
