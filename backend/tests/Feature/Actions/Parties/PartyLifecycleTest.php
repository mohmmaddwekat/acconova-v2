<?php

namespace Tests\Feature\Actions\Parties;

use App\Actions\Parties\CreateParty;
use App\Actions\Parties\DeleteParty;
use App\Actions\Parties\RestoreParty;
use App\Actions\Parties\UpdateParty;
use App\Enums\OrganizationRole;
use App\Events\PartyDeleted;
use App\Events\PartyRestored;
use App\Events\PartyUpdated;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class PartyLifecycleTest extends TestCase
{
    use DatabaseMigrations;

    /**
     * Clear tenant state after every direct Action test.
     */
    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    /**
     * Verify a Party may change from person to company, synchronize roles,
     * clear stale identity fields, and dispatch PartyUpdated.
     */
    public function test_update_party_changes_type_roles_and_dispatches_event(): void
    {
        Event::fake([
            PartyUpdated::class,
        ]);

        $this->activateOrganization();

        $party = app(CreateParty::class)->execute([
            'type' => 'person',
            'name' => 'Alice',
            'email' => 'alice@example.com',
            'roles' => [
                'customer',
            ],
        ]);

        $updated = app(UpdateParty::class)->execute(
            $party,
            [
                'type' => 'company',
                'company_name' => 'Alice Consulting',
                'roles' => [
                    'supplier',
                ],
            ],
        );

        $this->assertNull(
            $updated->name,
        );

        $this->assertSame(
            'Alice Consulting',
            $updated->company_name,
        );

        $this->assertSame(
            ['supplier'],
            $updated->roles
                ->pluck('role')
                ->map(
                    fn ($role): string => $role->value,
                )
                ->sort()
                ->values()
                ->all(),
        );

        Event::assertDispatched(
            PartyUpdated::class,
            fn (PartyUpdated $event): bool => $event->partyId === $party->id,
        );
    }

    /**
     * Verify Party soft deletion preserves role rows and dispatches the
     * committed PartyDeleted domain event.
     */
    public function test_delete_party_preserves_roles_and_dispatches_event(): void
    {
        Event::fake([
            PartyDeleted::class,
        ]);

        $this->activateOrganization();

        $party = app(CreateParty::class)->execute([
            'type' => 'company',
            'company_name' => 'Acme',
            'roles' => [
                'customer',
                'supplier',
            ],
        ]);

        app(DeleteParty::class)->execute(
            $party,
        );

        $this->assertSoftDeleted('parties', [
            'id' => $party->id,
        ]);

        $this->assertDatabaseCount(
            'party_roles',
            2,
        );

        Event::assertDispatched(
            PartyDeleted::class,
            fn (PartyDeleted $event): bool => $event->partyId === $party->id,
        );
    }

    /**
     * Verify restoring a Party revives the same database record and preserved
     * roles instead of creating replacement records.
     */
    public function test_restore_party_restores_same_record_and_roles(): void
    {
        Event::fake([
            PartyDeleted::class,
            PartyRestored::class,
        ]);

        $this->activateOrganization();

        $party = app(CreateParty::class)->execute([
            'type' => 'person',
            'name' => 'Alice',
            'roles' => [
                'customer',
                'supplier',
            ],
        ]);

        app(DeleteParty::class)->execute(
            $party,
        );

        $restored = app(RestoreParty::class)->execute(
            $party,
        );

        $this->assertSame(
            $party->id,
            $restored->id,
        );

        $this->assertDatabaseHas('parties', [
            'id' => $party->id,
            'deleted_at' => null,
        ]);

        $this->assertCount(
            2,
            $restored->roles,
        );

        Event::assertDispatched(
            PartyRestored::class,
            fn (PartyRestored $event): bool => $event->partyId === $party->id,
        );
    }

    /**
     * Create and activate one Owner organization for direct Party Action
     * tests.
     */
    private function activateOrganization(): Organization
    {
        $owner = User::factory()->create();

        $organization = Organization::create([
            'name' => 'Party Lifecycle Organization',
        ]);

        $organization->users()->attach(
            $owner->id,
            [
                'role' => OrganizationRole::Owner->value,
            ],
        );

        app(TenantContext::class)->set(
            $organization,
            OrganizationRole::Owner,
        );

        return $organization;
    }
}
