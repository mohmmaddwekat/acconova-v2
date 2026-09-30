<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class StaffPayrollCalculationTest extends TestCase
{
    use RefreshDatabase;

    public function test_hourly_attendance_deductions_advances_and_payments_produce_correct_remaining_due(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Payroll calculation']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);

        $this->actingAs($user)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);

        $staffId = $this
            ->postJson('/api/staff', [
                'name' => 'Hourly worker',
                'basis' => 'hour',
                'rate' => '9',
                'monthly_allowance' => '0',
                'currency' => 'ILS',
                'started_on' => '2026-01-01',
            ])
            ->assertCreated()
            ->json('data.id');

        $attendanceIds = [];

        for ($day = 1; $day <= 20; $day++) {
            $date = sprintf('2026-01-%02d', $day);
            $attendanceIds[] = DB::table('staff_attendances')->insertGetId([
                'organization_id' => $organization->id,
                'staff_member_id' => $staffId,
                'created_by' => $user->id,
                'occurred_on' => $date,
                'status' => 'present',
                'quantity' => '8.0000',
                'overtime_hours' => '0.0000',
                'overtime_rate' => '0.0000',
                'notes' => 'Imported attendance',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Reproduce the broken legacy state: attendance exists but its generated
        // earning row was stored with a zero rate/amount. Opening the employee
        // must repair this row instead of treating the payment ledger alone as
        // the employee balance.
        DB::table('staff_entries')->insert([
            'organization_id' => $organization->id,
            'staff_member_id' => $staffId,
            'created_by' => $user->id,
            'request_id' => (string) Str::uuid(),
            'kind' => 'work',
            'occurred_on' => '2026-01-01',
            'quantity' => '8.0000',
            'rate' => '0.0000',
            'amount' => '0.0000',
            'notes' => 'Legacy zero work entry',
            'terms' => json_encode([
                'attendance_id' => $attendanceIds[0],
                'basis' => 'hour',
                'currency' => 'ILS',
                'imported' => true,
            ]),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        foreach ([
            ['kind' => 'bonus', 'amount' => '200', 'notes' => 'Bonus'],
            ['kind' => 'deduction', 'amount' => '40', 'notes' => 'Deduction'],
            ['kind' => 'advance', 'amount' => '300', 'notes' => 'Advance'],
            ['kind' => 'payment', 'amount' => '900', 'notes' => 'Payment'],
        ] as $entry) {
            $this
                ->postJson('/api/staff/'.$staffId.'/entries', [
                    'request_id' => (string) Str::uuid(),
                    'occurred_on' => '2026-01-20',
                    ...$entry,
                ])
                ->assertCreated();
        }

        $response = $this
            ->getJson('/api/staff/'.$staffId.'/ledger')
            ->assertOk()
            ->assertJsonPath('totals.work', '1440.0000')
            ->assertJsonPath('balance', '400.0000')
            ->assertJsonPath('member.payroll_summary.work_earned', '1440.0000')
            ->assertJsonPath('member.payroll_summary.gross_earned', '1640.0000')
            ->assertJsonPath('member.payroll_summary.deductions', '40.0000')
            ->assertJsonPath('member.payroll_summary.advances', '300.0000')
            ->assertJsonPath('member.payroll_summary.net_entitlement', '1300.0000')
            ->assertJsonPath('member.payroll_summary.paid', '900.0000')
            ->assertJsonPath('member.payroll_summary.remaining_due', '400.0000')
            ->assertJsonPath('member.payroll_summary.attendance.present_count', 20)
            ->assertJsonPath('member.payroll_summary.attendance.present_quantity', '160.0000');

        $this->assertSame('400.0000', $response->json('member.payroll_summary.remaining'));

        $this->assertDatabaseHas('staff_entries', [
            'staff_member_id' => $staffId,
            'kind' => 'work',
            'occurred_on' => '2026-01-01',
            'quantity' => 8,
            'rate' => 9,
            'amount' => 72,
        ]);
    }
}
