<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class StaffEntitlementSyncTest extends TestCase
{
    use RefreshDatabase;

    private function monthlyEmployee(): int
    {
        Carbon::setTestNow('2026-10-17 10:00:00');
        $owner = User::factory()->create(['email' => 'owner@gmail.com']);
        $org = Organization::create(['name' => 'Payroll workspace']);
        $org->users()->attach($owner->id, ['role' => 'owner']);
        app(TenantContext::class)->set($org, OrganizationRole::Owner);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $org->id]);

        $id = $this->postJson('/api/staff', ['name' => 'Monthly', 'basis' => 'month', 'rate' => '3000', 'monthly_allowance' => '0', 'started_on' => '2026-08-01'])->assertCreated()->json('data.id');
        DB::table('staff_attendances')->insert(['organization_id' => $org->id, 'staff_member_id' => $id, 'created_by' => $owner->id, 'occurred_on' => '2026-08-03', 'status' => 'present', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('staff_attendances')->insert(['organization_id' => $org->id, 'staff_member_id' => $id, 'created_by' => $owner->id, 'occurred_on' => '2026-10-05', 'status' => 'present', 'created_at' => now(), 'updated_at' => now()]);

        return $id;
    }

    private function listBalance(int $staff): float
    {
        $row = collect($this->getJson('/api/staff')->assertOk()->json('data.data'))->firstWhere('id', $staff);

        return (float) $row['balance'];
    }

    public function test_scheduled_sync_makes_the_directory_balance_match_the_ledger(): void
    {
        $staff = $this->monthlyEmployee();

        $this->artisan('staff:sync-entitlements')->assertSuccessful();
        app(TenantContext::class)->set(Organization::first(), OrganizationRole::Owner);

        $ledger = (float) $this->getJson('/api/staff/'.$staff.'/ledger')->assertOk()->json('balance');

        $this->assertGreaterThan(0, $ledger);
        $this->assertSame($ledger, $this->listBalance($staff));
    }

    public function test_changing_the_rate_updates_the_balance_without_opening_the_ledger(): void
    {
        $staff = $this->monthlyEmployee();
        $this->getJson('/api/staff/'.$staff.'/ledger')->assertOk();
        $before = $this->listBalance($staff);

        $this->patchJson('/api/staff/'.$staff, ['name' => 'Monthly', 'basis' => 'month', 'rate' => '4000', 'monthly_allowance' => '0', 'started_on' => '2026-08-01'])->assertOk();

        $this->assertGreaterThan($before, $this->listBalance($staff));
        $this->assertSame((float) $this->getJson('/api/staff/'.$staff.'/ledger')->json('balance'), $this->listBalance($staff));
    }
}
