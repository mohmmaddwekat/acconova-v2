<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class StaffWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private function workspace(): Organization
    {
        $user = User::factory()->create();
        $org = Organization::create(['name' => 'Staff test']);
        $org->users()->attach($user->id, ['role' => 'owner']);
        app(TenantContext::class)->set($org, OrganizationRole::Owner);
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $org->id]);

        return $org;
    }

    private function employee(array $overrides = []): int
    {
        return $this->postJson('/api/staff', [...['name' => 'Worker', 'basis' => 'piece', 'unit' => 'Box', 'rate' => '2.5', 'monthly_allowance' => '100', 'currency' => 'SAR', 'started_on' => '2026-01-01'], ...$overrides])->assertCreated()->json('data.id');
    }

    private function entry(int $id, string $kind, array $extra = []): TestResponse
    {
        return $this->postJson('/api/staff/'.$id.'/entries', [...['request_id' => (string) Str::uuid(), 'kind' => $kind, 'occurred_on' => '2026-01-01', 'notes' => 'January entry', 'amount' => '10'], ...$extra]);
    }

    public function test_exact_earnings_adjustments_payments_and_duplicate_protection(): void
    {
        $this->workspace();
        $id = $this->employee();
        $key = (string) Str::uuid();
        $this->entry($id, 'work', ['quantity' => '3', 'amount' => '999', 'request_id' => $key])->assertCreated()->assertJsonPath('data.amount', '7.5000');
        $this->entry($id, 'work', ['quantity' => '3', 'request_id' => $key])->assertConflict();
        $this->entry($id, 'bonus')->assertCreated();
        $this->entry($id, 'deduction', ['amount' => '2'])->assertCreated();
        $this->entry($id, 'payment', ['amount' => '5'])->assertCreated();
        $this->getJson('/api/staff/'.$id.'/ledger')->assertOk()->assertJsonPath('balance', '10.5');
    }

    public function test_monthly_entries_are_unique_and_rate_changes_preserve_history(): void
    {
        $this->workspace();
        $id = $this->employee(['basis' => 'month', 'rate' => '1000']);
        $this->entry($id, 'work', ['quantity' => '2'])->assertUnprocessable();
        $this->entry($id, 'work', ['quantity' => '1'])->assertCreated();
        $this->entry($id, 'work', ['quantity' => '1'])->assertConflict();
        $this->entry($id, 'monthly_allowance')->assertCreated()->assertJsonPath('data.amount', '100.0000');
        $this->entry($id, 'monthly_allowance')->assertConflict();
        $this->patchJson('/api/staff/'.$id, ['name' => 'Worker', 'basis' => 'month', 'rate' => '1200', 'monthly_allowance' => '150', 'currency' => 'SAR', 'started_on' => '2026-01-01'])->assertOk();
        $this->assertDatabaseHas('staff_entries', ['staff_member_id' => $id, 'kind' => 'work', 'rate' => 1000]);
        $this->assertDatabaseHas('staff_entries', ['staff_member_id' => $id, 'kind' => 'terms']);
        $this->patchJson('/api/staff/'.$id, ['name' => 'Worker', 'basis' => 'month', 'rate' => '1200', 'monthly_allowance' => '150', 'currency' => 'USD', 'started_on' => '2026-01-01'])->assertOk()->assertJsonPath('data.currency', 'ILS');
    }

    public function test_employee_only_reads_own_statement_and_tenants_are_isolated(): void
    {
        $org = $this->workspace();
        $user = User::factory()->create();
        $org->users()->attach($user->id, ['role' => 'employee']);
        $mine = $this->employee(['user_id' => $user->id]);
        $other = $this->employee();
        $this->actingAs($user);
        $this->getJson('/api/staff')->assertOk()->assertJsonCount(1, 'data.data');
        $this->getJson('/api/staff/'.$mine.'/ledger')->assertOk();
        $this->getJson('/api/staff/'.$other.'/ledger')->assertForbidden();
        $this->entry($mine, 'payment')->assertForbidden();
        $this->postJson('/api/staff', [])->assertForbidden();
        $this->workspace();
        $this->getJson('/api/staff/'.$mine.'/ledger')->assertNotFound();
        $this->entry($mine, 'payment')->assertNotFound();
    }

    public function test_custom_roles_grant_only_explicit_payroll_permissions_and_protect_owner(): void
    {
        $org = $this->workspace();
        $owner = auth()->user();
        $id = $this->employee();
        $user = User::factory()->create();
        $role = $this->postJson('/api/workspace-roles', ['name' => 'Payroll reader', 'base_role' => 'employee', 'permissions' => ['staff.view']])->assertCreated()->json('data.id');
        $this->postJson('/api/workspace-roles/assign', ['email' => $user->email, 'workspace_role_id' => $role])->assertOk();
        $this->postJson('/api/workspace-roles/assign', ['email' => $owner->email, 'workspace_role_id' => $role])->assertForbidden();
        $this->actingAs($user);
        $this->getJson('/api/staff/'.$id.'/ledger')->assertOk();
        $this->entry($id, 'payment')->assertForbidden();
        $this->postJson('/api/workspace-roles', [])->assertForbidden();
        $this->actingAs($owner);
        $payRole = $this->postJson('/api/workspace-roles', ['name' => 'Payroll clerk', 'base_role' => 'employee', 'permissions' => ['staff.pay']])->assertCreated()->json('data.id');
        $this->postJson('/api/workspace-roles/assign', ['email' => $user->email, 'workspace_role_id' => $payRole])->assertOk();
        $this->actingAs($user);
        $this->entry($id, 'payment')->assertCreated();
        $this->postJson('/api/staff', [])->assertForbidden();
    }

    public function test_additional_currency_codes_work_for_settings_and_payment_plans(): void
    {
        $this->workspace();
        $this->patchJson('/api/workspace-settings', ['currency' => 'AED', 'reminder_days' => 3])->assertOk()->assertJsonPath('currency', 'AED');
        $this->postJson('/api/payment-plans', ['title' => 'Salary', 'direction' => 'outgoing', 'amount' => '100', 'currency' => 'AED', 'frequency' => 'monthly', 'interval_count' => 1, 'next_due_on' => '2026-01-01', 'reminder_days' => 3])->assertCreated();
        $this->patchJson('/api/workspace-settings', ['currency' => 'BADCODE', 'reminder_days' => 3])->assertUnprocessable();
    }
}
