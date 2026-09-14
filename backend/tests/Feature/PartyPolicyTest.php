<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\Party;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

class PartyPolicyTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    public function test_owner_has_full_party_access(): void
    {
        [$user, $party] = $this->createUserWithParty(OrganizationRole::Owner);

        $gate = Gate::forUser($user);

        $this->assertTrue($gate->allows('viewAny', Party::class));
        $this->assertTrue($gate->allows('view', $party));
        $this->assertTrue($gate->allows('create', Party::class));
        $this->assertTrue($gate->allows('update', $party));
        $this->assertTrue($gate->allows('delete', $party));
        $this->assertTrue($gate->allows('restore', $party));
        $this->assertFalse($gate->allows('forceDelete', $party));
    }

    public function test_admin_has_full_party_access_except_force_delete(): void
    {
        [$user, $party] = $this->createUserWithParty(OrganizationRole::Admin);

        $gate = Gate::forUser($user);

        $this->assertTrue($gate->allows('viewAny', Party::class));
        $this->assertTrue($gate->allows('view', $party));
        $this->assertTrue($gate->allows('create', Party::class));
        $this->assertTrue($gate->allows('update', $party));
        $this->assertTrue($gate->allows('delete', $party));
        $this->assertTrue($gate->allows('restore', $party));
        $this->assertFalse($gate->allows('forceDelete', $party));
    }

    public function test_manager_has_full_party_access_except_force_delete(): void
    {
        [$user, $party] = $this->createUserWithParty(OrganizationRole::Manager);

        $gate = Gate::forUser($user);

        $this->assertTrue($gate->allows('viewAny', Party::class));
        $this->assertTrue($gate->allows('view', $party));
        $this->assertTrue($gate->allows('create', Party::class));
        $this->assertTrue($gate->allows('update', $party));
        $this->assertTrue($gate->allows('delete', $party));
        $this->assertTrue($gate->allows('restore', $party));
        $this->assertFalse($gate->allows('forceDelete', $party));
    }

    public function test_accountant_can_manage_party_but_cannot_delete_it(): void
    {
        [$user, $party] = $this->createUserWithParty(OrganizationRole::Accountant);

        $gate = Gate::forUser($user);

        $this->assertTrue($gate->allows('viewAny', Party::class));
        $this->assertTrue($gate->allows('view', $party));
        $this->assertTrue($gate->allows('create', Party::class));
        $this->assertTrue($gate->allows('update', $party));
        $this->assertFalse($gate->allows('delete', $party));
        $this->assertFalse($gate->allows('restore', $party));
        $this->assertFalse($gate->allows('forceDelete', $party));
    }

    public function test_employee_can_only_view_parties(): void
    {
        [$user, $party] = $this->createUserWithParty(OrganizationRole::Employee);

        $gate = Gate::forUser($user);

        $this->assertTrue($gate->allows('viewAny', Party::class));
        $this->assertTrue($gate->allows('view', $party));
        $this->assertFalse($gate->allows('create', Party::class));
        $this->assertFalse($gate->allows('update', $party));
        $this->assertFalse($gate->allows('delete', $party));
        $this->assertFalse($gate->allows('restore', $party));
        $this->assertFalse($gate->allows('forceDelete', $party));
    }

    public function test_party_access_is_denied_without_tenant_context(): void
    {
        $user = User::factory()->create();

        app(TenantContext::class)->clear();

        $gate = Gate::forUser($user);

        $this->assertFalse($gate->allows('viewAny', Party::class));
        $this->assertFalse($gate->allows('create', Party::class));
    }

    public function test_party_from_another_organization_cannot_be_managed(): void
    {
        [$user, $party] = $this->createUserWithParty(OrganizationRole::Owner);

        $otherOrganization = Organization::create([
            'name' => 'Other Organization',
        ]);

        $otherUser = User::factory()->create();

        $otherOrganization->users()->attach($otherUser->id, [
            'role' => OrganizationRole::Owner->value,
        ]);

        $context = app(TenantContext::class);
        $context->clear();

        app(OrganizationAccess::class)->resolve(
            $otherUser,
            $otherOrganization->id,
            $context,
        );

        $gate = Gate::forUser($otherUser);

        $this->assertFalse($gate->allows('view', $party));
        $this->assertFalse($gate->allows('update', $party));
        $this->assertFalse($gate->allows('delete', $party));
        $this->assertFalse($gate->allows('restore', $party));
    }

    /**
     * @return array{User, Party}
     */
    private function createUserWithParty(OrganizationRole $role): array
    {
        $user = User::factory()->create();

        $organization = Organization::create([
            'name' => fake()->company(),
        ]);

        $organization->users()->attach($user->id, [
            'role' => $role->value,
        ]);

        $context = app(TenantContext::class);

        app(OrganizationAccess::class)->resolve(
            $user,
            $organization->id,
            $context,
        );

        $party = Party::factory()->create();

        return [$user, $party];
    }
}
