<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WorkspaceOrganizationControlsTest extends TestCase
{
    use RefreshDatabase;

    private function workspace(): array
    {
        $owner = User::factory()->create();
        $org = Organization::create(['name' => 'Controls']);
        $org->users()->attach($owner->id, ['role' => 'owner']);
        app(TenantContext::class)->set($org, OrganizationRole::Owner);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $org->id]);

        return [$owner, $org];
    }

    private function staff(array $extra = []): array
    {
        return [...['name' => 'Employee', 'basis' => 'month', 'rate' => '100', 'monthly_allowance' => '10', 'started_on' => '2026-01-01'], ...$extra];
    }

    public function test_currency_is_enforced_for_new_items_and_preserved_for_existing_staff(): void
    {
        $this->workspace();
        $this->patchJson('/api/workspace-settings', ['currency' => 'JOD', 'reminder_days' => 3])->assertOk();
        $id = $this->postJson('/api/staff', $this->staff(['currency' => 'USD']))->assertCreated()->assertJsonPath('data.currency', 'JOD')->json('data.id');
        $this->postJson('/api/payment-plans', ['title' => 'Rent', 'direction' => 'outgoing', 'amount' => '10', 'currency' => 'USD', 'frequency' => 'monthly', 'next_due_on' => '2026-01-01', 'reminder_days' => 3])->assertCreated()->assertJsonPath('data.currency', 'JOD');
        $this->patchJson('/api/workspace-settings', ['currency' => 'EUR', 'reminder_days' => 3])->assertOk();
        $this->patchJson('/api/staff/'.$id, $this->staff(['currency' => 'USD']))->assertOk()->assertJsonPath('data.currency', 'JOD');
        $this->postJson('/api/staff', $this->staff())->assertCreated()->assertJsonPath('data.currency', 'EUR');
    }

    public function test_custom_roles_are_exact_and_permission_edits_apply_immediately(): void
    {
        [$owner,$org] = $this->workspace();
        $user = User::factory()->create();
        $org->users()->attach($user->id, ['role' => 'employee']);
        $role = $this->postJson('/api/workspace-roles', ['name' => 'Catalog reader', 'base_role' => 'manager', 'is_custom' => true, 'permissions' => ['products.view']])->assertCreated()->assertJsonPath('data.base_role', 'employee')->json('data.id');
        $confirmedUserId = (int) $this->postJson('/api/workspace-roles/preview', ['email' => $user->email])
            ->assertOk()
            ->assertJsonPath('email', $user->email)
            ->json('id');
        $this->postJson('/api/workspace-roles/assign', [
            'confirmed_user_id' => $confirmedUserId,
            'email' => $user->email,
            'workspace_role_id' => $role,
            'current_password' => 'password',
        ])->assertOk();
        $this->actingAs($user);
        $this->getJson('/api/products')->assertOk();
        $this->postJson('/api/products', [])->assertForbidden();
        $this->getJson('/api/parties')->assertForbidden();
        $this->getJson('/api/inventory/overview')->assertForbidden();
        $this->getJson('/api/payment-plans')->assertForbidden();
        $this->actingAs($owner);
        $this->patchJson('/api/workspace-roles/'.$role, ['name' => 'Catalog editor', 'base_role' => 'employee', 'is_custom' => true, 'permissions' => ['products.manage']])->assertOk();
        $this->actingAs($user);
        $this->postJson('/api/products', [])->assertUnprocessable();
        $this->getJson('/api/parties')->assertForbidden();
        $this->actingAs($owner);
        $this->patchJson('/api/workspace-roles/'.$role, ['name' => 'No access', 'base_role' => 'employee', 'is_custom' => true, 'permissions' => []])->assertOk();
        $this->actingAs($user);
        $this->getJson('/api/products')->assertForbidden();
    }

    public function test_department_manager_must_belong_to_department_and_transfer_clears_manager(): void
    {
        $this->workspace();
        $department = $this->postJson('/api/departments', ['name' => 'Packing'])->assertCreated()->json('data.id');
        $id = $this->postJson('/api/staff', $this->staff(['department_id' => $department]))->assertCreated()->json('data.id');
        $other = $this->postJson('/api/staff', $this->staff())->assertCreated()->json('data.id');
        $this->patchJson('/api/departments/'.$department, ['name' => 'Packing', 'manager_id' => $other])->assertUnprocessable();
        $this->patchJson('/api/departments/'.$department, ['name' => 'Packing', 'manager_id' => $id])->assertOk()->assertJsonPath('data.manager_id', $id);
        $this->patchJson('/api/staff/'.$id, $this->staff(['department_id' => null]))->assertOk();
        $this->assertDatabaseHas('departments', ['id' => $department, 'manager_id' => null]);
        $this->workspace();
        $this->patchJson('/api/departments/'.$department, ['name' => 'Foreign', 'manager_id' => null])->assertNotFound();
        $this->postJson('/api/staff', $this->staff(['department_id' => $department]))->assertUnprocessable();
    }

    public function test_department_management_does_not_grant_employees_payroll_access(): void
    {
        [$owner,$org] = $this->workspace();
        $user = User::factory()->create();
        $org->users()->attach($user->id, ['role' => 'employee']);
        $dept = $this->postJson('/api/departments', ['name' => 'Team'])->assertCreated()->json('data.id');
        $id = $this->postJson('/api/staff', $this->staff(['department_id' => $dept, 'user_id' => $user->id]))->assertCreated()->json('data.id');
        $other = $this->postJson('/api/staff', $this->staff(['department_id' => $dept]))->assertCreated()->json('data.id');
        $this->patchJson('/api/departments/'.$dept, ['name' => 'Team', 'manager_id' => $id])->assertOk();
        $this->actingAs($user);
        $this->getJson('/api/staff/'.$other.'/ledger')->assertForbidden();
        $this->postJson('/api/departments', ['name' => 'Unauthorized'])->assertForbidden();
    }
}
