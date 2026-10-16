<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * A typed amount for a day wins over the automatic one (salary shared over the
 * working days, or the day rate); with nothing typed the automatic amount stays.
 */
class StaffDayAmountOverrideTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $owner = User::factory()->create();
        $org = Organization::create(['name' => 'Factory']);
        $org->users()->attach($owner->id, ['role' => 'owner']);
        app(TenantContext::class)->set($org, OrganizationRole::Owner);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $org->id]);
        $this->travelTo(now()->setDate(2026, 9, 17));
    }

    private function staff(string $basis, string $rate): int
    {
        return $this->postJson('/api/staff', ['name' => 'Worker '.$basis, 'basis' => $basis, 'rate' => $rate, 'monthly_allowance' => '0', 'started_on' => '2026-09-16'])->assertCreated()->json('data.id');
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function attendance(int $staff, array $extra = []): TestResponse
    {
        return $this->postJson('/api/staff/'.$staff.'/attendance', [...['occurred_on' => '2026-09-16', 'status' => 'present', 'quantity' => '1', 'overtime_hours' => '0', 'overtime_rate' => '0'], ...$extra]);
    }

    private function balance(int $staff): string
    {
        return $this->getJson('/api/staff/'.$staff.'/ledger')->assertOk()->json('balance');
    }

    public function test_a_monthly_salary_day_uses_the_typed_amount_or_the_automatic_share(): void
    {
        $automatic = $this->staff('month', '3000');
        $this->attendance($automatic)->assertCreated();
        $this->assertSame('230.7692', $this->balance($automatic), 'two payable days, each 3000 over 26 working days');

        $typed = $this->staff('month', '3000');
        $this->attendance($typed, ['day_amount_override' => '50'])->assertCreated();
        $this->assertSame('165.3846', $this->balance($typed), 'the 16th earns the typed 50, the 17th keeps its share');

        $above = $this->staff('month', '3000');
        $this->attendance($above, ['day_amount_override' => '400'])->assertCreated();
        $this->assertSame('515.3846', $this->balance($above), 'a typed amount may exceed the daily share');
    }

    public function test_a_daily_worker_uses_the_typed_amount_or_the_day_rate(): void
    {
        $automatic = $this->staff('day', '100');
        $this->attendance($automatic)->assertCreated();
        $this->assertSame('100.0000', $this->balance($automatic));

        $typed = $this->staff('day', '100');
        $this->attendance($typed, ['day_amount_override' => '50'])->assertCreated();
        $this->assertDatabaseHas('staff_attendances', ['staff_member_id' => $typed, 'day_amount_override' => '50.0000']);
        $this->assertSame('50.0000', $this->balance($typed));

        $above = $this->staff('day', '100');
        $this->attendance($above, ['day_amount_override' => '150'])->assertCreated();
        $this->assertSame('150.0000', $this->balance($above));
    }

    public function test_an_absent_day_ignores_a_typed_amount(): void
    {
        $worker = $this->staff('day', '100');
        $this->attendance($worker, ['status' => 'absent', 'day_amount_override' => '80'])->assertCreated();

        $this->assertSame('0.0000', $this->balance($worker));
    }

    public function test_bulk_attendance_applies_the_typed_amount_and_shows_the_automatic_one(): void
    {
        $monthly = $this->staff('month', '3000');
        $daily = $this->staff('day', '100');

        $roster = collect($this->getJson('/api/staff-attendance/bulk?date=2026-09-16')->assertOk()->json('data'));
        $this->assertSame('115.38', $roster->firstWhere('id', $monthly)['auto_day_amount']);
        $this->assertSame('100.00', $roster->firstWhere('id', $daily)['auto_day_amount']);

        $this->postJson('/api/staff-attendance/bulk', [
            'scope' => 'selected', 'occurred_on' => '2026-09-16', 'status' => 'present', 'quantity' => '1',
            'overtime_hours' => '0', 'overtime_rate' => '0', 'staff_ids' => [$monthly, $daily],
            'overrides' => [
                ['staff_id' => $monthly, 'day_amount_override' => '50'],
                ['staff_id' => $daily, 'day_amount_override' => '150'],
            ],
        ])->assertOk()->assertJsonPath('processed', 2);

        $this->assertSame('165.3846', $this->balance($monthly));
        $this->assertSame('150.0000', $this->balance($daily));

        $again = collect($this->getJson('/api/staff-attendance/bulk?date=2026-09-16')->json('data'));
        $this->assertSame('50.0000', $again->firstWhere('id', $monthly)['attendance']['day_amount_override']);

        $this->postJson('/api/staff-attendance/bulk', [
            'scope' => 'selected', 'occurred_on' => '2026-09-16', 'status' => 'present', 'quantity' => '1',
            'overtime_hours' => '0', 'overtime_rate' => '0', 'staff_ids' => [$monthly, $daily],
        ])->assertOk();

        $this->assertSame('230.7692', $this->balance($monthly), 'clearing the typed amount goes back to automatic');
        $this->assertSame('100.0000', $this->balance($daily));
    }
}
