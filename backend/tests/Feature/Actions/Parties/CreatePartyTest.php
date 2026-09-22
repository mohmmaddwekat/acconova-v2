<?php

namespace Tests\Feature\Actions\Parties;

use App\Actions\Parties\CreateParty;
use App\Enums\OrganizationRole;
use App\Events\PartyCreated;
use App\Models\Organization;
use App\Models\Party;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class CreatePartyTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Clear the tenant after every test so one test can never leak
     * organization context into the next test.
     */
    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    /**
     * Verify that the action creates exactly one Party, attaches both
     * customer and supplier roles, and dispatches PartyCreated.
     */
    public function test_it_creates_one_party_with_multiple_roles_and_dispatches_event(): void
    {
        $organization = $this->activateOrganization();

        Event::fake([PartyCreated::class]);

        $party = app(CreateParty::class)->execute([
            'type' => 'company',
            'company_name' => 'Smart Tech',
            'email' => 'contact@smarttech.com',
            'roles' => ['customer', 'supplier'],
        ]);

        $this->assertDatabaseHas('parties', [
            'id' => $party->id,
            'organization_id' => $organization->id,
            'company_name' => 'Smart Tech',
            'email' => 'contact@smarttech.com',
        ]);

        $this->assertDatabaseCount('parties', 1);

        $this->assertDatabaseHas('party_roles', [
            'party_id' => $party->id,
            'role' => 'customer',
        ]);

        $this->assertDatabaseHas('party_roles', [
            'party_id' => $party->id,
            'role' => 'supplier',
        ]);

        $this->assertCount(2, $party->roles);

        Event::assertDispatched(
            PartyCreated::class,
            fn (PartyCreated $event): bool => $event->party->is($party),
        );
    }

    /**
     * Verify transaction safety.
     *
     * Calling the Action internally with duplicate roles violates the
     * database unique constraint. When that happens, the Party itself
     * must also be rolled back instead of leaving partial data behind.
     */
    public function test_it_rolls_back_party_creation_when_role_creation_fails(): void
    {
        $this->activateOrganization();

        Event::fake([PartyCreated::class]);

        try {
            app(CreateParty::class)->execute([
                'type' => 'company',
                'company_name' => 'Broken Company',
                'roles' => ['customer', 'customer'],
            ]);

            $this->fail('Expected duplicate Party roles to fail.');
        } catch (QueryException) {
            // Expected: the database rejects the duplicate party role.
        }

        $this->assertDatabaseMissing('parties', [
            'company_name' => 'Broken Company',
        ]);

        Event::assertNotDispatched(PartyCreated::class);
    }

    /**
     * Create an organization, give a user owner membership, and activate
     * that organization in TenantContext for the current test.
     */
    private function activateOrganization(): Organization
    {
        $user = User::factory()->create();

        $organization = Organization::create([
            'name' => 'Test Organization',
        ]);

        $organization->users()->attach($user->id, [
            'role' => OrganizationRole::Owner->value,
        ]);

        app(OrganizationAccess::class)->resolve(
            $user,
            $organization->id,
            app(TenantContext::class),
        );

        return $organization;
    }
}
