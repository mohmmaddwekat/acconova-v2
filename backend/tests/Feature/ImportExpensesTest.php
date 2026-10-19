<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\CashMovement;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ImportExpensesTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    public function test_bills_are_reconciled_by_month_and_small_expenses_are_merged_per_day(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Expense Co']);
        $organization->users()->attach($user->id, ['role' => OrganizationRole::Owner->value]);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);

        DB::table('cash_movements')->insert([
            'organization_id' => $organization->id, 'number' => 'OLD-1', 'direction' => 'outgoing', 'status' => 'posted',
            'category' => 'utilities', 'amount' => '300', 'currency' => 'ILS', 'movement_date' => '2025-01-10',
            'method' => 'cash', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $bills = tempnam(sys_get_temp_dir(), 'bills');
        file_put_contents($bills, implode("\n", [
            "INSERT INTO b VALUES('a1', '2025-01-05', 11111111, 'كهرباء', 0.00, 200.00);",
            "INSERT INTO b VALUES('a2', '2025-01-20', 22222222, 'كهرباء', 0.00, 250.00);",
            "INSERT INTO b VALUES('a3', '2025-02-03', 33333333, 'كهرباء', 0.00, 100.00);",
            "INSERT INTO b VALUES('a4', '2025-02-03', 44444444, 'رصيد سابق', 0.00, 999.00);",
        ]));

        $petty = tempnam(sys_get_temp_dir(), 'petty');
        file_put_contents($petty, implode("\n", [
            "('p1000001-0000-0000-0000-000000000000', 'فطور', '2025-03-01', 20.00, NULL, 'c', 'u', '2025-03-01 10:00:00', '2025-03-01 10:00:00'),",
            "('p2000002-0000-0000-0000-000000000000', 'فطور', '2025-03-01', 14.00, NULL, 'c', 'u', '2025-03-01 10:00:00', '2025-03-01 10:00:00'),",
            "('p3000003-0000-0000-0000-000000000000', 'صيانه', '2025-03-01', 200.00, NULL, 'c', 'u', '2025-03-01 10:00:00', '2025-03-01 10:00:00'),",
            "('p4000004-0000-0000-0000-000000000000', 'حسام ارباح من المصنع', '2025-03-02', 3000.00, NULL, 'c', 'u', '2025-03-02 10:00:00', '2025-03-02 10:00:00');",
        ]));

        $this->artisan('finance:import-expenses', ['--bills' => $bills, '--petty' => $petty, '--apply' => true])->assertSuccessful();

        $shortfall = CashMovement::where('reference', 'BILLDIFF-utilities-202501')->first();
        $this->assertEquals(150, (float) $shortfall->amount);
        $this->assertSame('2025-01-20', substr((string) $shortfall->movement_date, 0, 10));
        $this->assertEquals(100, (float) CashMovement::where('reference', 'BILL-33333333')->value('amount'));
        $this->assertSame(0, CashMovement::where('reference', 'BILL-44444444')->count());
        $this->assertEquals(34, (float) CashMovement::where('category', 'operating_expense')->value('amount'));
        $this->assertEquals(200, (float) CashMovement::where('category', 'maintenance')->value('amount'));
        $this->assertEquals(3000, (float) CashMovement::where('category', 'other')->value('amount'));
        $this->assertSame(1 + 1 + 1 + 1 + 1 + 1, CashMovement::count());

        $this->artisan('finance:import-expenses', ['--bills' => $bills, '--petty' => $petty, '--apply' => true])->assertSuccessful();
        $this->assertSame(6, CashMovement::count());

        unlink($bills);
        unlink($petty);
    }
}
