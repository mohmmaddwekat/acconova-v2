<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class PayrollCarryForwardAndAssignmentTest extends TestCase
{
    use RefreshDatabase;

    private function workspace(): array
    {
        $owner = User::factory()->create();
        $org = Organization::create(['name' => 'Payroll']);
        $org->users()->attach($owner->id, ['role' => 'owner']);
        app(TenantContext::class)->set($org, OrganizationRole::Owner);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $org->id]);

        return [$owner, $org];
    }

    private function data(): array
    {
        return ['name' => 'Worker', 'basis' => 'month', 'rate' => '1000', 'monthly_allowance' => '100', 'started_on' => '2026-01-01'];
    }

    public function test_partial_payments_leave_a_cumulative_balance_and_accrual_is_idempotent(): void
    {
        $this->travelTo(now()->setDate(2026, 4, 1));
        $this->workspace();
        $id = $this->postJson('/api/staff', $this->data())->assertCreated()->json('data.id');
        $this->postJson('/api/staff/'.$id.'/accrue', ['through' => '2026-02'])->assertOk()->assertJsonPath('created', 4);
        $this->postJson('/api/staff/'.$id.'/entries', ['request_id' => (string) Str::uuid(), 'kind' => 'payment', 'amount' => '700', 'occurred_on' => '2026-02-28', 'notes' => 'Partial payment'])->assertCreated();
        $this->getJson('/api/staff/'.$id.'/ledger')->assertOk()->assertJsonPath('balance', '1500.0000');
        $this->postJson('/api/staff/'.$id.'/accrue', ['through' => '2026-02'])->assertOk()->assertJsonPath('created', 0);
        $this->postJson('/api/staff/'.$id.'/accrue', ['through' => '2026-03'])->assertOk()->assertJsonPath('created', 2);
        $this->getJson('/api/staff/'.$id.'/ledger')->assertOk()->assertJsonPath('balance', '2600.0000');
        $this->postJson('/api/staff/'.$id.'/accrue', ['through' => '2026-04'])->assertUnprocessable();
    }

    public function test_accrual_uses_historical_rates_and_denies_unauthorized_access(): void
    {
        $this->travelTo(now()->setDate(2026, 1, 15));
        [$owner,$org] = $this->workspace();
        $id = $this->postJson('/api/staff', $this->data())->assertCreated()->json('data.id');
        $this->travelTo(now()->setDate(2026, 2, 1));
        $this->patchJson('/api/staff/'.$id, [...$this->data(), 'rate' => '2000'])->assertOk();
        $this->travelTo(now()->setDate(2026, 3, 1));
        $this->postJson('/api/staff/'.$id.'/accrue', ['through' => '2026-02'])->assertOk();
        $this->getJson('/api/staff/'.$id.'/ledger')->assertJsonPath('balance', '3200.0000');
        $employee = User::factory()->create();
        $org->users()->attach($employee->id, ['role' => 'employee']);
        $this->actingAs($employee);
        $this->postJson('/api/staff/'.$id.'/accrue', ['through' => '2026-02'])->assertForbidden();
        $this->workspace();
        $this->postJson('/api/staff/'.$id.'/accrue', ['through' => '2026-02'])->assertNotFound();
    }

    public function test_assignment_preview_confirms_identity_and_access_can_be_revoked_without_deleting_payroll(): void
    {
        [$owner,$org] = $this->workspace();
        $user = User::factory()->create();
        $other = User::factory()->create();
        $org->users()->attach($user->id, ['role' => 'employee']);
        $role = $this->postJson('/api/workspace-roles', ['name' => 'Reader', 'base_role' => 'employee', 'is_custom' => true, 'permissions' => ['products.view']])->assertCreated()->json('data.id');
        $this->postJson('/api/workspace-roles/preview', ['email' => $user->email])->assertOk()->assertJsonPath('id', $user->id)->assertJsonPath('name', $user->name);
        $this->postJson('/api/workspace-roles/assign', ['email' => $user->email, 'workspace_role_id' => $role, 'confirmed_user_id' => $other->id, 'current_password' => 'password'])->assertConflict();
        $this->postJson('/api/workspace-roles/assign', ['email' => $user->email, 'workspace_role_id' => $role, 'confirmed_user_id' => $user->id, 'current_password' => 'password'])->assertOk();
        $staff = $this->postJson('/api/staff', [...$this->data(), 'user_id' => $user->id])->assertCreated()->json('data.id');
        $membership = Membership::withoutGlobalScopes()->where('organization_id', $org->id)->where('user_id', $user->id)->firstOrFail();
        $this->deleteJson('/api/organizations/'.$org->id.'/memberships/'.$membership->id)->assertNoContent();
        $this->assertDatabaseHas('staff_members', ['id' => $staff, 'user_id' => $user->id]);
        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $this->actingAs($user);
        $this->getJson('/api/products')->assertNotFound();
    }
}
