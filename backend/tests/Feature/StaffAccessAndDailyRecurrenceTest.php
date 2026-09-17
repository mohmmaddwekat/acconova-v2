<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

class StaffAccessAndDailyRecurrenceTest extends TestCase
{
    use RefreshDatabase;

    private function workspace(): array
    {
        $owner = User::factory()->create();
        $org = Organization::create(['name' => 'Access']);
        $org->users()->attach($owner->id, ['role' => 'owner']);
        app(TenantContext::class)->set($org, OrganizationRole::Owner);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $org->id]);

        return [$owner, $org];
    }

    private function staff(array $extra = []): int
    {
        return $this->postJson('/api/staff', [...['name' => 'Employee', 'basis' => 'day', 'rate' => '100', 'monthly_allowance' => '0', 'started_on' => '2026-01-01'], ...$extra])->assertCreated()->json('data.id');
    }

    private function role(array $permissions): int
    {
        return $this->postJson('/api/workspace-roles', ['name' => Str::random(10), 'base_role' => 'employee', 'is_custom' => true, 'permissions' => $permissions])->assertCreated()->json('data.id');
    }

    public function test_daily_and_multiple_day_recurrence(): void
    {
        $this->workspace();
        foreach ([1 => '2026-02-01', 3 => '2026-02-03'] as $interval => $date) {
            $id = $this->postJson('/api/payment-plans', ['title' => 'Daily', 'direction' => 'outgoing', 'amount' => '10', 'frequency' => 'daily', 'interval_count' => $interval, 'next_due_on' => '2026-01-31', 'reminder_days' => 0])->assertCreated()->json('data.id');
            $this->postJson('/api/payment-plans/'.$id.'/record', ['due_on' => '2026-01-31', 'paid_on' => '2026-01-31', 'amount' => '10', 'method' => 'cash'])->assertCreated();
            $this->getJson('/api/payment-plans')->assertJsonFragment(['next_due_on' => $date]);
        }
    }

    public function test_create_permission_does_not_grant_edit_or_payroll_access(): void
    {
        [$owner] = $this->workspace();
        $id = $this->role(['parties.create']);
        $user = User::factory()->create();
        $this->postJson('/api/workspace-roles/assign', ['email' => $user->email, 'workspace_role_id' => $id])->assertOk();
        $party = $this->postJson('/api/parties', ['name' => 'Customer', 'type' => 'person', 'roles' => ['customer']])->assertCreated()->json('data.id');
        $this->actingAs($user);
        $this->getJson('/api/parties')->assertOk();
        $this->postJson('/api/parties', ['name' => 'New', 'type' => 'person', 'roles' => ['customer']])->assertCreated();
        $this->patchJson('/api/parties/'.$party, ['name' => 'Changed'])->assertForbidden();
        $this->getJson('/api/payment-plans')->assertForbidden();
    }

    public function test_department_permissions_are_scoped_to_actual_managed_department(): void
    {
        [$owner,$org] = $this->workspace();
        $user = User::factory()->create();
        $org->users()->attach($user->id, ['role' => 'employee']);
        $dept = $this->postJson('/api/departments', ['name' => 'Packing'])->assertCreated()->json('data.id');
        $manager = $this->staff(['user_id' => $user->id, 'department_id' => $dept]);
        $worker = $this->staff(['department_id' => $dept]);
        $other = $this->staff();
        $this->patchJson('/api/departments/'.$dept, ['name' => 'Packing', 'manager_id' => $manager])->assertOk();
        $role = $this->role(['staff.team_pay']);
        $this->postJson('/api/workspace-roles/assign', ['email' => $user->email, 'workspace_role_id' => $role])->assertOk();
        $this->actingAs($user);
        $this->getJson('/api/staff')->assertOk()->assertJsonCount(2, 'data.data');
        $this->getJson('/api/staff/'.$worker.'/ledger')->assertOk()->assertJsonPath('can_pay', true);
        $this->getJson('/api/staff/'.$other.'/ledger')->assertForbidden();
        $entry = ['request_id' => (string) Str::uuid(), 'kind' => 'payment', 'amount' => '5', 'occurred_on' => '2026-01-01', 'notes' => 'Payment'];
        $this->postJson('/api/staff/'.$other.'/entries', $entry)->assertForbidden();
        $this->postJson('/api/staff/'.$worker.'/entries', $entry)->assertCreated();
        $this->actingAs($owner);
        $this->patchJson('/api/departments/'.$dept, ['name' => 'Packing', 'manager_id' => null])->assertOk();
        $this->actingAs($user);
        $this->getJson('/api/staff/'.$worker.'/ledger')->assertForbidden();
    }

    public function test_invitation_requires_matching_verified_email_and_links_once(): void
    {
        Notification::fake();
        [$owner,$org] = $this->workspace();
        $staff = $this->staff();
        $response = $this->postJson('/api/staff/'.$staff.'/invitation', ['email' => 'new@example.com'])->assertCreated();
        $token = basename($response->json('url'));
        $this->assertDatabaseMissing('staff_invitations', ['token_hash' => $token]);
        $wrong = User::factory()->create();
        $this->actingAs($wrong);
        $this->postJson('/api/staff-invitations/'.$token.'/accept')->assertForbidden();
        $this->postJson('/api/logout')->assertNoContent();
        $this->postJson('/api/register', ['name' => 'New', 'email' => 'new@example.com', 'password' => 'StrongPassword123!', 'password_confirmation' => 'StrongPassword123!'])->assertCreated();
        $this->postJson('/api/staff-invitations/'.$token.'/accept')->assertForbidden();
        $user = User::where('email', 'new@example.com')->firstOrFail();
        $user->markEmailAsVerified();
        $this->actingAs($user);
        $this->postJson('/api/staff-invitations/'.$token.'/accept')->assertOk();
        $this->assertDatabaseHas('staff_members', ['id' => $staff, 'user_id' => $user->id]);
        $this->getJson('/api/staff')->assertOk()->assertJsonCount(1, 'data.data');
        $this->postJson('/api/staff-invitations/'.$token.'/accept')->assertNotFound();
    }

    public function test_reissuing_and_expiring_invitation_invalidates_old_links(): void
    {
        $this->workspace();
        $staff = $this->staff();
        $old = $this->postJson('/api/staff/'.$staff.'/invitation', ['email' => 'a@example.com'])->assertCreated()->json('url');
        $new = $this->postJson('/api/staff/'.$staff.'/invitation', ['email' => 'b@example.com'])->assertCreated()->json('url');
        $this->get($old)->assertNotFound();
        $this->travel(8)->days();
        $this->get($new)->assertNotFound();
    }
}
