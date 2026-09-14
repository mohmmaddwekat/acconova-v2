<?php

namespace Tests\Feature\Actions\Memberships;

use App\Actions\Memberships\CreateMembership;
use App\Actions\Memberships\DeleteMembership;
use App\Actions\Memberships\UpdateMembership;
use App\Enums\OrganizationRole;
use App\Events\MembershipAdded;
use App\Events\MembershipRemoved;
use App\Events\MembershipRoleChanged;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class MembershipActionsTest extends TestCase
{
    use DatabaseMigrations;

    /**
     * Clear tenant state after every test to prevent cross-test leakage.
     */
    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    /**
     * Verify membership creation persists the active tenant and emits a
     * committed MembershipAdded event.
     */
    public function test_create_membership_dispatches_event(): void
    {
        Event::fake([MembershipAdded::class]);

        [$owner, $organization] = $this->activateOrganization();

        $member = User::factory()->create();

        $membership = app(CreateMembership::class)->execute(
            $owner,
            [
                'user_id' => $member->id,
                'role' => OrganizationRole::Employee->value,
            ],
        );

        $this->assertDatabaseHas('memberships', [
            'id' => $membership->id,
            'organization_id' => $organization->id,
            'user_id' => $member->id,
            'role' => OrganizationRole::Employee->value,
        ]);

        Event::assertDispatched(
            MembershipAdded::class,
            fn (MembershipAdded $event): bool => $event->organizationId === $organization->id
                && $event->memberUserId === $member->id
                && $event->actorUserId === $owner->id,
        );
    }

    /**
     * Verify role changes persist and record both old and new roles.
     */
    public function test_update_membership_dispatches_role_change_event(): void
    {
        Event::fake([
            MembershipAdded::class,
            MembershipRoleChanged::class,
        ]);

        [$owner] = $this->activateOrganization();
        $member = User::factory()->create();

        $membership = app(CreateMembership::class)->execute(
            $owner,
            [
                'user_id' => $member->id,
                'role' => OrganizationRole::Employee->value,
            ],
        );

        $membership = app(UpdateMembership::class)->execute(
            $owner,
            $membership,
            [
                'role' => OrganizationRole::Manager->value,
            ],
        );

        $this->assertSame(
            OrganizationRole::Manager,
            $membership->role,
        );

        Event::assertDispatched(
            MembershipRoleChanged::class,
            fn (MembershipRoleChanged $event): bool => $event->previousRole === OrganizationRole::Employee
                && $event->newRole === OrganizationRole::Manager,
        );
    }

    /**
     * Verify removing a membership deletes the row and emits a snapshot event.
     */
    public function test_delete_membership_dispatches_removed_event(): void
    {
        Event::fake([
            MembershipAdded::class,
            MembershipRemoved::class,
        ]);

        [$owner] = $this->activateOrganization();
        $member = User::factory()->create();

        $membership = app(CreateMembership::class)->execute(
            $owner,
            [
                'user_id' => $member->id,
                'role' => OrganizationRole::Accountant->value,
            ],
        );

        $membershipId = $membership->id;

        app(DeleteMembership::class)->execute(
            $owner,
            $membership,
        );

        $this->assertDatabaseMissing('memberships', [
            'id' => $membershipId,
        ]);

        Event::assertDispatched(
            MembershipRemoved::class,
            fn (MembershipRemoved $event): bool => $event->membershipId === $membershipId
                && $event->role === OrganizationRole::Accountant,
        );
    }

    /**
     * Create an Owner, organization, Owner membership, and active tenant
     * context for direct membership action tests.
     *
     * @return array{User, Organization}
     */
    private function activateOrganization(): array
    {
        $owner = User::factory()->create();

        $organization = Organization::create([
            'name' => 'Membership Test Organization',
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

        return [$owner, $organization];
    }
}
