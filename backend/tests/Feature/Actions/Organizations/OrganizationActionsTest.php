<?php

namespace Tests\Feature\Actions\Organizations;

use App\Actions\Organizations\CreateOrganization;
use App\Actions\Organizations\DeleteOrganization;
use App\Actions\Organizations\RestoreOrganization;
use App\Actions\Organizations\UpdateOrganization;
use App\Events\OrganizationCreated;
use App\Events\OrganizationDeleted;
use App\Events\OrganizationRestored;
use App\Events\OrganizationUpdated;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class OrganizationActionsTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify that organization creation produces exactly one Owner and emits
     * the domain event after the transaction succeeds.
     */
    public function test_create_organization_creates_owner_and_dispatches_event(): void
    {
        Event::fake([OrganizationCreated::class]);

        $owner = User::factory()->create();

        $organization = app(CreateOrganization::class)->execute(
            $owner,
            ['name' => 'Acme Inc'],
        );

        $this->assertDatabaseHas('organizations', [
            'id' => $organization->id,
            'name' => 'Acme Inc',
        ]);

        $this->assertDatabaseHas('memberships', [
            'organization_id' => $organization->id,
            'user_id' => $owner->id,
            'role' => 'owner',
        ]);

        $this->assertSame(
            1,
            $organization->users()->wherePivot('role', 'owner')->count(),
        );

        Event::assertDispatched(
            OrganizationCreated::class,
            fn (OrganizationCreated $event): bool => $event->organization->is($organization)
                && $event->owner->is($owner),
        );
    }

    /**
     * Verify atomicity: if owner membership cannot be inserted, the new
     * organization and its event must both disappear.
     */
    public function test_create_organization_rolls_back_when_owner_insert_fails(): void
    {
        Event::fake([OrganizationCreated::class]);

        $missingOwner = User::factory()->make();
        $missingOwner->id = 999999;

        try {
            app(CreateOrganization::class)->execute(
                $missingOwner,
                ['name' => 'Must Roll Back'],
            );

            $this->fail('Expected owner membership insertion to fail.');
        } catch (QueryException) {
            // Expected: the foreign key rejects the missing owner.
        }

        $this->assertDatabaseMissing('organizations', [
            'name' => 'Must Roll Back',
        ]);

        Event::assertNotDispatched(OrganizationCreated::class);
    }

    /**
     * Verify that updating an organization persists the change and emits the
     * corresponding domain event with the acting user.
     */
    public function test_update_organization_updates_name_and_dispatches_event(): void
    {
        Event::fake([
            OrganizationCreated::class,
            OrganizationUpdated::class,
        ]);

        $owner = User::factory()->create();

        $organization = app(CreateOrganization::class)->execute(
            $owner,
            ['name' => 'Old Name'],
        );

        $organization = app(UpdateOrganization::class)->execute(
            $owner,
            $organization,
            ['name' => 'New Name'],
        );

        $this->assertSame('New Name', $organization->name);

        $this->assertDatabaseHas('organizations', [
            'id' => $organization->id,
            'name' => 'New Name',
        ]);

        Event::assertDispatched(
            OrganizationUpdated::class,
            fn (OrganizationUpdated $event): bool => $event->organization->is($organization)
                && $event->actor->is($owner),
        );
    }

    /**
     * Verify that deletion soft-deletes the organization, preserves ownership,
     * and dispatches the corresponding domain event.
     */
    public function test_delete_organization_preserves_data_and_dispatches_event(): void
    {
        Event::fake([
            OrganizationCreated::class,
            OrganizationDeleted::class,
        ]);

        $owner = User::factory()->create();

        $organization = app(CreateOrganization::class)->execute(
            $owner,
            ['name' => 'Delete Me'],
        );

        app(DeleteOrganization::class)->execute(
            $owner,
            $organization,
        );

        $this->assertSoftDeleted('organizations', [
            'id' => $organization->id,
        ]);

        $this->assertDatabaseHas('memberships', [
            'organization_id' => $organization->id,
            'user_id' => $owner->id,
            'role' => 'owner',
        ]);

        Event::assertDispatched(
            OrganizationDeleted::class,
            fn (OrganizationDeleted $event): bool => $event->organization->is($organization)
                && $event->actor->is($owner),
        );
    }

    /**
     * Verify that restoration reactivates the same organization instead of
     * creating replacement tenant or membership records.
     */
    public function test_restore_organization_restores_same_record_and_dispatches_event(): void
    {
        Event::fake([
            OrganizationCreated::class,
            OrganizationDeleted::class,
            OrganizationRestored::class,
        ]);

        $owner = User::factory()->create();

        $organization = app(CreateOrganization::class)->execute(
            $owner,
            ['name' => 'Restore Me'],
        );

        app(DeleteOrganization::class)->execute(
            $owner,
            $organization,
        );

        $restored = app(RestoreOrganization::class)->execute(
            $owner,
            $organization,
        );

        $this->assertSame(
            $organization->id,
            $restored->id,
        );

        $this->assertDatabaseHas('organizations', [
            'id' => $organization->id,
            'deleted_at' => null,
        ]);

        $this->assertDatabaseHas('memberships', [
            'organization_id' => $organization->id,
            'user_id' => $owner->id,
            'role' => 'owner',
        ]);

        Event::assertDispatched(
            OrganizationRestored::class,
            fn (OrganizationRestored $event): bool => $event->organization->is($restored)
                && $event->actor->is($owner),
        );
    }
}
