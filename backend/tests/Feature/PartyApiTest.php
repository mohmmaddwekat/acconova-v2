<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartyApiTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Clear any tenant state left in the application container after a test.
     */
    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    /**
     * Verify that an authorized user can create one company Party with both
     * customer and supplier roles through the complete HTTP API flow.
     */
    public function test_owner_can_create_company_party_with_both_roles(): void
    {
        [$user, $organization] = $this->createOrganizationUser(
            OrganizationRole::Owner,
        );

        $response = $this
            ->actingAs($user)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/parties', [
                'type' => 'company',
                'company_name' => 'Smart Tech',
                'email' => 'info@smarttech.com',
                'country_code' => 'ps',
                'roles' => [
                    'customer',
                    'supplier',
                ],
            ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.type', 'company')
            ->assertJsonPath('data.company_name', 'Smart Tech')
            ->assertJsonPath('data.email', 'info@smarttech.com')
            ->assertJsonPath('data.country_code', 'PS')
            ->assertJsonPath('data.roles.0', 'customer')
            ->assertJsonPath('data.roles.1', 'supplier')
            ->assertJsonMissingPath('data.organization_id');

        $this->assertDatabaseHas('parties', [
            'organization_id' => $organization->id,
            'company_name' => 'Smart Tech',
            'email' => 'info@smarttech.com',
            'country_code' => 'PS',
        ]);

        /*
         * Smart Tech must exist once in parties even though it has two roles.
         */
        $this->assertDatabaseCount('parties', 1);

        $this->assertDatabaseHas('party_roles', [
            'role' => 'customer',
        ]);

        $this->assertDatabaseHas('party_roles', [
            'role' => 'supplier',
        ]);

        $this->assertDatabaseCount('party_roles', 2);
    }

    /**
     * Verify that a normal Employee cannot create Party records even when
     * they belong to the active organization.
     */
    public function test_employee_cannot_create_party(): void
    {
        [$user, $organization] = $this->createOrganizationUser(
            OrganizationRole::Employee,
        );

        $this
            ->actingAs($user)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/parties', [
                'type' => 'person',
                'name' => 'Test Customer',
                'roles' => ['customer'],
            ])
            ->assertForbidden();

        $this->assertDatabaseCount('parties', 0);
    }

    /**
     * Verify that Party creation fails closed when the authenticated user has
     * no active organization selected in the server-side session.
     */
    public function test_party_creation_requires_active_organization(): void
    {
        $user = User::factory()->create();

        $this
            ->actingAs($user)
            ->postJson('/api/parties', [
                'type' => 'person',
                'name' => 'No Tenant',
                'roles' => ['customer'],
            ])
            ->assertNotFound();

        $this->assertDatabaseCount('parties', 0);
    }

    /**
     * Verify that invalid or duplicate Party roles are rejected before any
     * Party data reaches the business action.
     */
    public function test_duplicate_party_roles_are_rejected_by_validation(): void
    {
        [$user, $organization] = $this->createOrganizationUser(
            OrganizationRole::Owner,
        );

        $this
            ->actingAs($user)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/parties', [
                'type' => 'company',
                'company_name' => 'Duplicate Role Company',
                'roles' => [
                    'customer',
                    'customer',
                ],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('roles.1');

        $this->assertDatabaseCount('parties', 0);
    }

    /**
     * Create a user, organization, and organization-specific role for API
     * tests without bypassing the real membership model.
     *
     * @return array{User, Organization}
     */
    private function createOrganizationUser(
        OrganizationRole $role,
    ): array {
        $user = User::factory()->create();

        $organization = Organization::create([
            'name' => fake()->company(),
        ]);

        $organization->users()->attach($user->id, [
            'role' => $role->value,
        ]);

        return [$user, $organization];
    }
}
