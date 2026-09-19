<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Department;
use App\Models\Organization;
use App\Models\StaffMember;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
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

    public function test_staff_overview_returns_scoped_people_attendance_and_payroll_metrics(): void
    {
        $this->workspace();

        $department = Department::create([
            'name' => 'Sales',
        ]);

        $active =
            $this->employee([
                'name' => 'Active Worker',
                'basis' => 'month',
                'rate' => '1200',
                'monthly_allowance' => '100',
                'department_id' => $department->id,
            ]);

        $this->employee([
            'name' => 'Inactive Worker',
            'department_id' => $department->id,
            'active' => false,
        ]);

        $this
            ->postJson(
                '/api/staff/'.$active.'/attendance',
                [
                    'occurred_on' => today()->toDateString(),
                    'status' => 'present',
                    'quantity' => '1',
                    'overtime_hours' => '2',
                    'overtime_rate' => '10',
                    'notes' => 'Overview test',
                ],
            )
            ->assertCreated();

        $this
            ->getJson(
                '/api/staff-overview',
            )
            ->assertOk()
            ->assertJsonPath(
                'totals.employees',
                2,
            )
            ->assertJsonPath(
                'totals.active',
                1,
            )
            ->assertJsonPath(
                'totals.inactive',
                1,
            )
            ->assertJsonPath(
                'attendance.present_today',
                1,
            )
            ->assertJsonPath(
                'attendance.month_overtime_hours',
                2,
            )
            ->assertJsonPath(
                'permissions.can_pay',
                true,
            )
            ->assertJsonPath(
                'payroll.0.monthly_commitment',
                1300,
            );
    }

    public function test_staff_migration_center_imports_employees_attendance_and_payroll_from_csv(): void
    {
        $this->workspace();

        $employeePreview =
            $this
                ->post(
                    '/api/staff-import/preview',
                    [
                        'file' => UploadedFile::fake()->createWithContent(
                            'employees.csv',
                            "Full Name,Phone,Department,Pay Basis,Rate,Allowance,Start Date,Active\n"
                            ."Imported One,0599000001,Sales,Monthly,1200,100,2026-01-01,Yes\n"
                            ."Imported Two,0599000002,Sales,Hourly,12,0,2026-02-01,Yes\n",
                        ),
                    ],
                )
                ->assertOk()
                ->json();

        $this
            ->postJson(
                '/api/staff-import/commit',
                [
                    'token' => $employeePreview['token'],
                    'sheet' => $employeePreview['sheets'][0]['name'],
                    'type' => 'employees',
                    'match_by' => 'phone',
                    'duplicate_strategy' => 'skip',
                    'create_departments' => true,
                    'mapping' => [
                        'name' => 'Full Name',
                        'phone' => 'Phone',
                        'department' => 'Department',
                        'basis' => 'Pay Basis',
                        'rate' => 'Rate',
                        'monthly_allowance' => 'Allowance',
                        'started_on' => 'Start Date',
                        'active' => 'Active',
                    ],
                ],
            )
            ->assertOk()
            ->assertJsonPath(
                'created',
                2,
            );

        $this->assertDatabaseHas(
            'departments',
            [
                'name' => 'Sales',
            ],
        );

        $this->assertDatabaseHas(
            'staff_members',
            [
                'name' => 'Imported One',
                'phone' => '0599000001',
                'basis' => 'month',
            ],
        );

        $attendancePreview =
            $this
                ->post(
                    '/api/staff-import/preview',
                    [
                        'file' => UploadedFile::fake()->createWithContent(
                            'attendance.csv',
                            "Employee,Date,Status,Hours,Overtime\n"
                            ."Imported One,2026-09-18,Present,1,2\n",
                        ),
                    ],
                )
                ->assertOk()
                ->json();

        $this
            ->postJson(
                '/api/staff-import/commit',
                [
                    'token' => $attendancePreview['token'],
                    'sheet' => $attendancePreview['sheets'][0]['name'],
                    'type' => 'attendance',
                    'match_by' => 'name',
                    'duplicate_strategy' => 'skip',
                    'mapping' => [
                        'employee' => 'Employee',
                        'occurred_on' => 'Date',
                        'status' => 'Status',
                        'quantity' => 'Hours',
                        'overtime_hours' => 'Overtime',
                    ],
                ],
            )
            ->assertOk()
            ->assertJsonPath(
                'created',
                1,
            );

        $staffId =
            StaffMember::where(
                'name',
                'Imported One',
            )->value(
                'id',
            );

        $this->assertDatabaseHas(
            'staff_attendances',
            [
                'staff_member_id' => $staffId,
                'status' => 'present',
            ],
        );

        $payrollPreview =
            $this
                ->post(
                    '/api/staff-import/preview',
                    [
                        'file' => UploadedFile::fake()->createWithContent(
                            'payroll.csv',
                            "Employee,Type,Date,Amount,Notes\n"
                            ."Imported One,Payment,2026-09-18,250,Legacy payment\n",
                        ),
                    ],
                )
                ->assertOk()
                ->json();

        $this
            ->postJson(
                '/api/staff-import/commit',
                [
                    'token' => $payrollPreview['token'],
                    'sheet' => $payrollPreview['sheets'][0]['name'],
                    'type' => 'payroll',
                    'match_by' => 'name',
                    'mapping' => [
                        'employee' => 'Employee',
                        'kind' => 'Type',
                        'occurred_on' => 'Date',
                        'amount' => 'Amount',
                        'notes' => 'Notes',
                    ],
                ],
            )
            ->assertOk()
            ->assertJsonPath(
                'created',
                1,
            );

        $this->assertDatabaseHas(
            'staff_entries',
            [
                'staff_member_id' => $staffId,
                'kind' => 'payment',
                'amount' => -250,
                'notes' => 'Legacy payment',
            ],
        );
    }
}
