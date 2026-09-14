<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\Party;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Tests\TestCase;

class PartyCrudTest extends TestCase
{
    use DatabaseMigrations;

    /**
     * Clear tenant state after every Party HTTP lifecycle test.
     */
    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    /**
     * Verify the complete Owner Party lifecycle from create through restore.
     */
    public function test_owner_can_complete_party_lifecycle(): void
    {
        $owner = User::factory()->create();
        $organization = $this->organization($owner);

        $this->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $createResponse = $this->postJson(
            '/api/parties',
            [
                'type' => 'person',
                'name' => 'Alice',
                'email' => 'alice@example.com',
                'roles' => [
                    'customer',
                ],
            ],
        );

        $createResponse
            ->assertCreated()
            ->assertJsonPath(
                'data.name',
                'Alice',
            )
            ->assertJsonMissingPath(
                'data.organization_id',
            );

        $partyId = $createResponse->json(
            'data.id',
        );

        $this->getJson(
            "/api/parties/{$partyId}",
        )
            ->assertOk()
            ->assertJsonPath(
                'data.roles.0',
                'customer',
            );

        $this->patchJson(
            "/api/parties/{$partyId}",
            [
                'type' => 'company',
                'company_name' => 'Alice Consulting',
                'roles' => [
                    'supplier',
                ],
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.company_name',
                'Alice Consulting',
            )
            ->assertJsonPath(
                'data.name',
                null,
            );

        $this->deleteJson(
            "/api/parties/{$partyId}",
        )->assertNoContent();

        $this->assertSoftDeleted('parties', [
            'id' => $partyId,
        ]);

        $this->getJson(
            "/api/parties/{$partyId}",
        )->assertNotFound();

        $this->getJson(
            '/api/parties?status=deleted',
        )
            ->assertOk()
            ->assertJsonPath(
                'data.0.id',
                $partyId,
            )
            ->assertJsonPath(
                'data.0.roles.0',
                'supplier',
            );

        $this->postJson(
            "/api/parties/{$partyId}/restore",
        )
            ->assertOk()
            ->assertJsonPath(
                'data.id',
                $partyId,
            );

        $this->assertDatabaseHas('parties', [
            'id' => $partyId,
            'deleted_at' => null,
        ]);
    }

    /**
     * Verify Party list search and role/type filters remain tenant-scoped.
     */
    public function test_party_list_supports_search_type_and_role_filters(): void
    {
        $owner = User::factory()->create();
        $organization = $this->organization($owner);

        $this->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $this->postJson('/api/parties', [
            'type' => 'person',
            'name' => 'Alice Smith',
            'roles' => [
                'customer',
            ],
        ])->assertCreated();

        $supplier = $this->postJson('/api/parties', [
            'type' => 'company',
            'company_name' => 'Acme Supplies',
            'roles' => [
                'supplier',
            ],
        ])->assertCreated();

        $supplierId = $supplier->json(
            'data.id',
        );

        $this->getJson(
            '/api/parties?search=Acme&type=company&role=supplier',
        )
            ->assertOk()
            ->assertJsonCount(
                1,
                'data',
            )
            ->assertJsonPath(
                'data.0.id',
                $supplierId,
            );
    }

    /**
     * Verify Accountant may maintain Party data but may not archive Parties.
     */
    public function test_accountant_can_create_and_update_but_cannot_delete_party(): void
    {
        $accountant = User::factory()->create();

        $organization = $this->organization(
            $accountant,
            OrganizationRole::Accountant,
        );

        $this->actingAs($accountant)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $response = $this->postJson('/api/parties', [
            'type' => 'person',
            'name' => 'Customer',
            'roles' => [
                'customer',
            ],
        ])->assertCreated();

        $partyId = $response->json(
            'data.id',
        );

        $this->patchJson(
            "/api/parties/{$partyId}",
            [
                'phone' => '123456',
            ],
        )->assertOk();

        $this->deleteJson(
            "/api/parties/{$partyId}",
        )->assertForbidden();
    }

    /**
     * Verify Employee access remains read-only for Party records.
     */
    public function test_employee_has_read_only_party_access(): void
    {
        $employee = User::factory()->create();

        $organization = $this->organization(
            $employee,
            OrganizationRole::Employee,
        );

        app(TenantContext::class)->set(
            $organization,
            OrganizationRole::Owner,
        );

        $party = Party::create([
            'type' => 'person',
            'name' => 'Visible Customer',
        ]);

        $party->roles()->create([
            'role' => 'customer',
        ]);

        app(TenantContext::class)->clear();

        $this->actingAs($employee)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $this->getJson('/api/parties')
            ->assertOk();

        $this->getJson(
            "/api/parties/{$party->id}",
        )->assertOk();

        $this->postJson('/api/parties', [
            'type' => 'person',
            'name' => 'Forbidden',
            'roles' => [
                'customer',
            ],
        ])->assertForbidden();

        $this->patchJson(
            "/api/parties/{$party->id}",
            [
                'phone' => '123',
            ],
        )->assertForbidden();

        $this->deleteJson(
            "/api/parties/{$party->id}",
        )->assertForbidden();
    }

    /**
     * Verify Party identifiers from another organization never become
     * readable or writable through the active tenant.
     */
    public function test_foreign_party_ids_fail_closed(): void
    {
        $firstOwner = User::factory()->create();
        $firstOrganization = $this->organization(
            $firstOwner,
        );

        $secondOwner = User::factory()->create();
        $secondOrganization = $this->organization(
            $secondOwner,
        );

        app(TenantContext::class)->set(
            $secondOrganization,
            OrganizationRole::Owner,
        );

        $foreignParty = Party::create([
            'type' => 'company',
            'company_name' => 'Foreign Company',
        ]);

        $foreignParty->roles()->create([
            'role' => 'customer',
        ]);

        app(TenantContext::class)->clear();

        $this->actingAs($firstOwner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $firstOrganization->id,
            ]);

        $this->getJson(
            "/api/parties/{$foreignParty->id}",
        )->assertNotFound();

        $this->patchJson(
            "/api/parties/{$foreignParty->id}",
            [
                'phone' => '123',
            ],
        )->assertNotFound();

        $this->deleteJson(
            "/api/parties/{$foreignParty->id}",
        )->assertNotFound();
    }

    /**
     * Create an organization with exactly one Owner and optionally attach the
     * supplied user with a different organization role.
     */
    private function organization(
        User $user,
        OrganizationRole $role = OrganizationRole::Owner,
    ): Organization {
        $organization = Organization::create([
            'name' => 'Party API Organization',
        ]);

        if ($role === OrganizationRole::Owner) {
            $organization->users()->attach(
                $user->id,
                [
                    'role' => OrganizationRole::Owner->value,
                ],
            );

            return $organization;
        }

        $owner = User::factory()->create();

        $organization->users()->attach(
            $owner->id,
            [
                'role' => OrganizationRole::Owner->value,
            ],
        );

        $organization->users()->attach(
            $user->id,
            [
                'role' => $role->value,
            ],
        );

        return $organization;
    }
}
