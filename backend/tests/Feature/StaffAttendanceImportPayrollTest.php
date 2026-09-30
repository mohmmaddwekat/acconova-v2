<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class StaffAttendanceImportPayrollTest extends TestCase
{
    use RefreshDatabase;

    public function test_attendance_import_backfills_payroll_accepts_holidays_and_matches_arabic_name_variants(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Attendance import test']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $this->actingAs($user)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);

        $staffId = $this
            ->postJson('/api/staff', [
                'name' => 'عبد الرحمان',
                'basis' => 'hour',
                'rate' => '14.42',
                'monthly_allowance' => '0',
                'currency' => 'ILS',
                'started_on' => '2021-01-01',
            ])
            ->assertCreated()
            ->json('data.id');

        $attendanceId = DB::table('staff_attendances')->insertGetId([
            'organization_id' => $organization->id,
            'staff_member_id' => $staffId,
            'created_by' => $user->id,
            'occurred_on' => '2026-09-01',
            'status' => 'present',
            'quantity' => '8.0000',
            'overtime_hours' => '0.0000',
            'overtime_rate' => '0.0000',
            'notes' => 'Legacy imported attendance',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $preview = $this
            ->post('/api/staff-import/preview', [
                'file' => UploadedFile::fake()->createWithContent(
                    'attendance.csv',
                    "Employee,Date,Status,Hours\n"
                    ."عبد الرحمن,2026-09-01,present,8\n"
                    ."عبد الرحمن,2026-09-04,holiday,0\n",
                ),
            ])
            ->assertOk()
            ->json();

        $payload = [
            'token' => $preview['token'],
            'sheet' => $preview['sheets'][0]['name'],
            'type' => 'attendance',
            'match_by' => 'name',
            'duplicate_strategy' => 'skip',
            'mapping' => [
                'employee' => 'Employee',
                'occurred_on' => 'Date',
                'status' => 'Status',
                'quantity' => 'Hours',
            ],
        ];

        $this
            ->postJson('/api/staff-import/commit', $payload)
            ->assertOk()
            ->assertJsonPath('created', 1)
            ->assertJsonPath('skipped', 1);

        $this->assertDatabaseHas('staff_attendances', [
            'id' => $attendanceId,
            'staff_member_id' => $staffId,
            'status' => 'present',
            'quantity' => 8,
        ]);

        $this->assertDatabaseHas('staff_attendances', [
            'staff_member_id' => $staffId,
            'occurred_on' => '2026-09-04',
            'status' => 'holiday',
            'quantity' => 0,
        ]);

        $this->assertDatabaseHas('staff_entries', [
            'staff_member_id' => $staffId,
            'kind' => 'work',
            'occurred_on' => '2026-09-01',
            'quantity' => 8,
            'rate' => 14.42,
            'amount' => 115.36,
        ]);

        $this->assertSame(
            1,
            StaffEntry::where('staff_member_id', $staffId)
                ->where('kind', 'work')
                ->whereDate('occurred_on', '2026-09-01')
                ->count(),
        );

        $holiday = DB::table('staff_attendances')
            ->where('staff_member_id', $staffId)
            ->whereDate('occurred_on', '2026-09-04')
            ->first();

        $this->assertNotNull($holiday);
        $this->assertFalse(
            StaffEntry::where('staff_member_id', $staffId)
                ->where('kind', 'work')
                ->where('terms->attendance_id', $holiday->id)
                ->exists(),
        );

        $member = StaffMember::findOrFail($staffId);
        $this->assertSame('عبد الرحمان', $member->name);
    }

    public function test_attendance_import_immediately_updates_monthly_salary_entitlement(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Monthly attendance import test']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $this->actingAs($user)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);

        $staffId = $this
            ->postJson('/api/staff', [
                'name' => 'Monthly worker',
                'basis' => 'month',
                'rate' => '2600',
                'monthly_allowance' => '0',
                'currency' => 'ILS',
                'started_on' => '2026-01-01',
            ])
            ->assertCreated()
            ->json('data.id');

        $preview = $this
            ->post('/api/staff-import/preview', [
                'file' => UploadedFile::fake()->createWithContent(
                    'monthly-attendance.csv',
                    "Employee,Date,Status\n"
                    ."Monthly worker,2026-09-16,present\n",
                ),
            ])
            ->assertOk()
            ->json();

        $this
            ->postJson('/api/staff-import/commit', [
                'token' => $preview['token'],
                'sheet' => $preview['sheets'][0]['name'],
                'type' => 'attendance',
                'match_by' => 'name',
                'duplicate_strategy' => 'skip',
                'mapping' => [
                    'employee' => 'Employee',
                    'occurred_on' => 'Date',
                    'status' => 'Status',
                ],
            ])
            ->assertOk()
            ->assertJsonPath('created', 1);

        $this->assertDatabaseHas('staff_entries', [
            'staff_member_id' => $staffId,
            'kind' => 'work',
            'occurred_on' => '2026-09-01',
            'quantity' => '1.0000',
            'amount' => '100.0000',
        ]);
    }
}
