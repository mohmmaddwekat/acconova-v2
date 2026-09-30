<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class StaffPayBasisCalculationTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Organization $organization;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Pay basis test']);
        $this->organization->users()->attach($this->user->id, ['role' => 'owner']);
        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
        $this->actingAs($this->user)->withSession([
            OrganizationAccess::SESSION_KEY => $this->organization->id,
        ]);
    }

    public function test_daily_attendance_counts_one_day_and_absence_earns_nothing(): void
    {
        $staffId = $this->employee('day', '100');

        $presentId = $this->attendance($staffId, '2026-01-01', 'present', '8.0000');
        $absentId = $this->attendance($staffId, '2026-01-02', 'absent', '8.0000');

        // Legacy data may contain a stale work row for an absence. Repair must
        // remove it, while a daily present row is always one day regardless of
        // an old quantity such as 8.
        $this->legacyWork($staffId, $absentId, '2026-01-02', '8.0000', '100', '800');

        $this
            ->getJson('/api/staff/'.$staffId.'/ledger')
            ->assertOk()
            ->assertJsonPath('totals.work', '100.0000')
            ->assertJsonPath('balance', '100.0000')
            ->assertJsonPath('member.payroll_summary.attendance.present_count', 1)
            ->assertJsonPath('member.payroll_summary.attendance.absent_count', 1);

        $this->assertDatabaseHas('staff_entries', [
            'staff_member_id' => $staffId,
            'kind' => 'work',
            'terms->attendance_id' => $presentId,
            'quantity' => 1,
            'rate' => 100,
            'amount' => 100,
        ]);

        $this->assertSoftDeleted('staff_entries', [
            'staff_member_id' => $staffId,
            'kind' => 'work',
            'terms->attendance_id' => $absentId,
        ]);
    }

    public function test_piece_attendance_multiplies_quantity_by_piece_rate(): void
    {
        $staffId = $this->employee('piece', '2.5');
        $this->attendance($staffId, '2026-01-01', 'present', '12.0000');

        $this
            ->getJson('/api/staff/'.$staffId.'/ledger')
            ->assertOk()
            ->assertJsonPath('totals.work', '30.0000')
            ->assertJsonPath('member.payroll_summary.work_earned', '30.0000')
            ->assertJsonPath('member.payroll_summary.remaining_due', '30.0000');
    }

    public function test_monthly_salary_only_deducts_explicit_absence_and_missing_days_are_neutral(): void
    {
        $staffId = $this->employee('month', '2600');
        $this->attendance($staffId, '2026-01-05', 'present', '1.0000');
        $this->attendance($staffId, '2026-01-06', 'absent', '0.0000');

        // January 2026 has 26 non-Friday workdays. One explicit absence leaves
        // 25 payable days: 2600 * 25 / 26 = 2500. Missing days do not deduct.
        $this
            ->getJson('/api/staff/'.$staffId.'/ledger')
            ->assertOk()
            ->assertJsonPath('totals.work', '2500.0000')
            ->assertJsonPath('member.payroll_summary.net_entitlement', '2500.0000')
            ->assertJsonPath('member.payroll_summary.remaining_due', '2500.0000');
    }

    private function employee(string $basis, string $rate): int
    {
        return $this
            ->postJson('/api/staff', [
                'name' => strtoupper($basis).' worker',
                'basis' => $basis,
                'unit' => $basis === 'piece' ? 'Piece' : null,
                'rate' => $rate,
                'monthly_allowance' => '0',
                'currency' => 'ILS',
                'started_on' => '2026-01-01',
            ])
            ->assertCreated()
            ->json('data.id');
    }

    private function attendance(
        int $staffId,
        string $date,
        string $status,
        string $quantity,
    ): int {
        return DB::table('staff_attendances')->insertGetId([
            'organization_id' => $this->organization->id,
            'staff_member_id' => $staffId,
            'created_by' => $this->user->id,
            'occurred_on' => $date,
            'status' => $status,
            'quantity' => $quantity,
            'overtime_hours' => '0.0000',
            'overtime_rate' => '0.0000',
            'notes' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function legacyWork(
        int $staffId,
        int $attendanceId,
        string $date,
        string $quantity,
        string $rate,
        string $amount,
    ): void {
        DB::table('staff_entries')->insert([
            'organization_id' => $this->organization->id,
            'staff_member_id' => $staffId,
            'created_by' => $this->user->id,
            'request_id' => 'legacy-'.$attendanceId,
            'kind' => 'work',
            'occurred_on' => $date,
            'quantity' => $quantity,
            'rate' => $rate,
            'amount' => $amount,
            'notes' => 'Legacy work',
            'terms' => json_encode([
                'attendance_id' => $attendanceId,
                'basis' => 'day',
                'currency' => 'ILS',
            ]),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
