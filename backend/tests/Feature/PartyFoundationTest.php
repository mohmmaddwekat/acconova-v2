<?php

namespace Tests\Feature;

use App\Enums\PartyRole;
use App\Enums\PartyType;
use App\Models\Organization;
use App\Models\Party;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use LogicException;
use Tests\TestCase;

class PartyFoundationTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Test Organization']);
        $this->organization->users()->attach($this->user->id, ['role' => 'owner']);

        // Simulate being in the organization context
        $access = app(OrganizationAccess::class);
        $context = app(TenantContext::class);
        $access->resolve($this->user, $this->organization->id, $context);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    public function test_create_person_party(): void
    {
        $party = Party::factory()->person()->create();

        $this->assertEquals(PartyType::Person, $party->type);
        $this->assertNotNull($party->name);
        $this->assertNull($party->company_name);
        $this->assertEquals($this->organization->id, $party->organization_id);
    }

    public function test_create_company_party(): void
    {
        $party = Party::factory()->company()->create();

        $this->assertEquals(PartyType::Company, $party->type);
        $this->assertNull($party->name);
        $this->assertNotNull($party->company_name);
        $this->assertEquals($this->organization->id, $party->organization_id);
    }

    public function test_customer_only_party(): void
    {
        $party = Party::factory()->create();
        $party->roles()->create(['role' => PartyRole::Customer]);

        $this->assertCount(1, $party->roles);
        $this->assertEquals(PartyRole::Customer, $party->roles->first()->role);
    }

    public function test_supplier_only_party(): void
    {
        $party = Party::factory()->create();
        $party->roles()->create(['role' => PartyRole::Supplier]);

        $this->assertCount(1, $party->roles);
        $this->assertEquals(PartyRole::Supplier, $party->roles->first()->role);
    }

    public function test_customer_and_supplier_party(): void
    {
        $party = Party::factory()->create();
        $party->roles()->create(['role' => PartyRole::Customer]);
        $party->roles()->create(['role' => PartyRole::Supplier]);

        $this->assertCount(2, $party->roles);
        $roles = $party->roles->pluck('role')->toArray();
        $this->assertContains(PartyRole::Customer, $roles);
        $this->assertContains(PartyRole::Supplier, $roles);
    }

    public function test_party_data_exists_only_once_with_multiple_roles(): void
    {
        $partyData = [
            'type' => PartyType::Company,
            'company_name' => 'Smart Tech',
            'email' => 'contact@smarttech.com',
            'phone' => '+1234567890',
            'tax_number' => '12345678901',
        ];

        $party = Party::create($partyData);
        $party->roles()->create(['role' => PartyRole::Customer]);
        $party->roles()->create(['role' => PartyRole::Supplier]);

        // Verify only one Party record exists
        $this->assertCount(1, Party::where('company_name', 'Smart Tech')->get());

        // Verify two role records exist
        $this->assertCount(2, $party->roles);

        // Verify party data is identical
        $retrieved = Party::find($party->id);
        $this->assertEquals('Smart Tech', $retrieved->company_name);
        $this->assertEquals('contact@smarttech.com', $retrieved->email);
    }

    public function test_duplicate_role_assignment_is_rejected(): void
    {
        $party = Party::factory()->create();
        $party->roles()->create(['role' => PartyRole::Customer]);

        $this->expectException(QueryException::class);
        $party->roles()->create(['role' => PartyRole::Customer]);
    }

    public function test_party_belongs_to_correct_organization(): void
    {
        $org1 = Organization::create(['name' => 'Org 1']);
        $org2 = Organization::create(['name' => 'Org 2']);

        $user1 = User::factory()->create();
        $user2 = User::factory()->create();
        $org1->users()->attach($user1->id, ['role' => 'owner']);
        $org2->users()->attach($user2->id, ['role' => 'owner']);

        // Create party in org1 context
        $context1 = app(TenantContext::class);
        $access1 = app(OrganizationAccess::class);
        $access1->resolve($user1, $org1->id, $context1);

        $party1 = Party::factory()->create(['organization_id' => $org1->id]);

        // Verify org1 can read party1
        $this->assertCount(1, Party::all());
        $this->assertEquals($party1->id, Party::first()->id);

        // Switch to org2 context
        $context1->clear();
        $context2 = app(TenantContext::class);
        $access2 = app(OrganizationAccess::class);
        $access2->resolve($user2, $org2->id, $context2);

        // Verify org2 cannot read party1
        $this->assertCount(0, Party::all());
    }

    public function test_cross_tenant_reads_are_blocked(): void
    {
        $org1 = Organization::create(['name' => 'Org 1']);
        $org2 = Organization::create(['name' => 'Org 2']);

        $user1 = User::factory()->create();
        $user2 = User::factory()->create();
        $org1->users()->attach($user1->id, ['role' => 'owner']);
        $org2->users()->attach($user2->id, ['role' => 'owner']);

        // Create party in org1
        $context1 = app(TenantContext::class);
        $access1 = app(OrganizationAccess::class);
        $access1->resolve($user1, $org1->id, $context1);
        $party = Party::factory()->create();

        // Try to read from org2 context
        $context1->clear();
        $context2 = app(TenantContext::class);
        $access2 = app(OrganizationAccess::class);
        $access2->resolve($user2, $org2->id, $context2);

        // Should be blocked
        $retrieved = Party::find($party->id);
        $this->assertNull($retrieved);
    }

    public function test_cross_tenant_updates_are_blocked(): void
    {
        $org1 = Organization::create(['name' => 'Org 1']);
        $org2 = Organization::create(['name' => 'Org 2']);

        $user1 = User::factory()->create();
        $user2 = User::factory()->create();
        $org1->users()->attach($user1->id, ['role' => 'owner']);
        $org2->users()->attach($user2->id, ['role' => 'owner']);

        // Create party in org1
        $context1 = app(TenantContext::class);
        $access1 = app(OrganizationAccess::class);
        $access1->resolve($user1, $org1->id, $context1);
        $party = Party::factory()->create();

        // Try to update from org2 context
        $context1->clear();
        $context2 = app(TenantContext::class);
        $access2 = app(OrganizationAccess::class);
        $access2->resolve($user2, $org2->id, $context2);

        $party->name = 'Hacked';
        $this->expectException(LogicException::class);
        $party->save();
    }

    public function test_cross_tenant_deletes_are_blocked(): void
    {
        $org1 = Organization::create(['name' => 'Org 1']);
        $org2 = Organization::create(['name' => 'Org 2']);

        $user1 = User::factory()->create();
        $user2 = User::factory()->create();
        $org1->users()->attach($user1->id, ['role' => 'owner']);
        $org2->users()->attach($user2->id, ['role' => 'owner']);

        // Create party in org1
        $context1 = app(TenantContext::class);
        $access1 = app(OrganizationAccess::class);
        $access1->resolve($user1, $org1->id, $context1);
        $party = Party::factory()->create();

        // Try to delete from org2 context
        $context1->clear();
        $context2 = app(TenantContext::class);
        $access2 = app(OrganizationAccess::class);
        $access2->resolve($user2, $org2->id, $context2);

        $this->expectException(LogicException::class);
        $party->delete();
    }

    public function test_creating_without_tenant_context_fails_closed(): void
    {
        // Clear the context
        app(TenantContext::class)->clear();

        $this->expectException(LogicException::class);
        Party::create(['type' => PartyType::Person, 'name' => 'Test']);
    }

    public function test_explicit_foreign_organization_assignment_is_rejected(): void
    {
        $org1 = Organization::create(['name' => 'Org 1']);
        $org2 = Organization::create(['name' => 'Org 2']);

        $user = User::factory()->create();
        $org1->users()->attach($user->id, ['role' => 'owner']);

        $context = app(TenantContext::class);
        $access = app(OrganizationAccess::class);
        $access->resolve($user, $org1->id, $context);

        $party = Party::factory()->make(['organization_id' => $org2->id]);

        $this->expectException(LogicException::class);
        $party->save();
    }

    public function test_soft_delete_works(): void
    {
        $party = Party::factory()->create();
        $id = $party->id;

        // Soft delete
        $party->delete();

        // Should not appear in normal queries
        $this->assertNull(Party::find($id));

        // Should appear in withTrashed
        $this->assertNotNull(Party::withTrashed()->find($id));

        // Should be marked as deleted
        $this->assertNotNull(Party::withTrashed()->find($id)->deleted_at);
    }

    public function test_party_role_integrity_is_preserved(): void
    {
        $party = Party::factory()->create();
        $party->roles()->create(['role' => PartyRole::Customer]);

        // Soft delete the party (preserves history)
        $party->delete();

        // Roles remain (party roles are not soft deleted, just associated)
        $this->assertCount(1, DB::table('party_roles')->where('party_id', $party->id)->get());

        // Hard delete the party
        $party->forceDelete();

        // Now roles should be hard deleted via cascade
        $this->assertCount(0, DB::table('party_roles')->where('party_id', $party->id)->get());
    }

    public function test_foreign_key_behavior_cascade_on_delete(): void
    {
        $party = Party::factory()->create();
        $party->roles()->create(['role' => PartyRole::Customer]);
        $party->roles()->create(['role' => PartyRole::Supplier]);

        // Delete party
        $party->forceDelete();

        // Verify roles were deleted
        $this->assertCount(0, DB::table('party_roles')->where('party_id', $party->id)->get());
    }

    public function test_party_relationships(): void
    {
        $party = Party::factory()->create();
        $party->roles()->create(['role' => PartyRole::Customer]);

        // Test accessing roles through relationship
        $this->assertCount(1, $party->roles);
        $this->assertInstanceOf(\App\Models\PartyRole::class, $party->roles->first());
    }

    public function test_party_type_enum_casting(): void
    {
        $party = Party::factory()->person()->create();

        // Verify enum is properly cast
        $this->assertInstanceOf(PartyType::class, $party->type);
        $this->assertEquals(PartyType::Person, $party->type);
    }

    public function test_party_role_enum_casting(): void
    {
        $party = Party::factory()->create();
        $role = $party->roles()->create(['role' => PartyRole::Customer]);

        // Verify enum is properly cast
        $this->assertInstanceOf(PartyRole::class, $role->role);
        $this->assertEquals(PartyRole::Customer, $role->role);
    }

    public function test_direct_party_role_queries_are_tenant_scoped(): void
    {
        $org1 = Organization::create(['name' => 'Org 1']);
        $org2 = Organization::create(['name' => 'Org 2']);

        $user1 = User::factory()->create();
        $user2 = User::factory()->create();

        $org1->users()->attach($user1->id, ['role' => 'owner']);
        $org2->users()->attach($user2->id, ['role' => 'owner']);

        $context = app(TenantContext::class);
        $access = app(OrganizationAccess::class);

        $access->resolve($user1, $org1->id, $context);

        $party = Party::factory()->create();
        $role = $party->roles()->create(['role' => PartyRole::Customer]);

        $this->assertNotNull(\App\Models\PartyRole::find($role->id));

        $context->clear();
        $access->resolve($user2, $org2->id, $context);

        $this->assertNull(\App\Models\PartyRole::find($role->id));
        $this->assertCount(0, \App\Models\PartyRole::all());
    }

    public function test_stale_party_role_cannot_be_updated_from_another_tenant(): void
    {
        $org1 = Organization::create(['name' => 'Org 1']);
        $org2 = Organization::create(['name' => 'Org 2']);

        $user1 = User::factory()->create();
        $user2 = User::factory()->create();

        $org1->users()->attach($user1->id, ['role' => 'owner']);
        $org2->users()->attach($user2->id, ['role' => 'owner']);

        $context = app(TenantContext::class);
        $access = app(OrganizationAccess::class);

        $access->resolve($user1, $org1->id, $context);

        $party = Party::factory()->create();
        $role = $party->roles()->create(['role' => PartyRole::Customer]);

        $context->clear();
        $access->resolve($user2, $org2->id, $context);

        $role->role = PartyRole::Supplier;

        $this->expectException(LogicException::class);

        $role->save();
    }

    public function test_stale_party_role_cannot_be_deleted_from_another_tenant(): void
    {
        $org1 = Organization::create(['name' => 'Org 1']);
        $org2 = Organization::create(['name' => 'Org 2']);

        $user1 = User::factory()->create();
        $user2 = User::factory()->create();

        $org1->users()->attach($user1->id, ['role' => 'owner']);
        $org2->users()->attach($user2->id, ['role' => 'owner']);

        $context = app(TenantContext::class);
        $access = app(OrganizationAccess::class);

        $access->resolve($user1, $org1->id, $context);

        $party = Party::factory()->create();
        $role = $party->roles()->create(['role' => PartyRole::Customer]);

        $context->clear();
        $access->resolve($user2, $org2->id, $context);

        $this->expectException(LogicException::class);

        $role->delete();
    }
}
