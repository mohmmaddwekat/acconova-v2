<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PettyExpenseTest extends TestCase
{
    use RefreshDatabase;

    private function signIn(): Organization
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Petty Co']);
        $organization->users()->attach($user->id, ['role' => OrganizationRole::Owner->value]);
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        return $organization;
    }

    public function test_several_entries_for_one_day_become_separate_posted_payments(): void
    {
        $this->signIn();

        $this->postJson('/api/finance/petty-expenses', [
            'movement_date' => '2026-05-10',
            'entries' => [
                ['category' => 'operating_expense', 'amount' => 25, 'notes' => 'قهوة'],
                ['category' => 'operating_expense', 'amount' => 25, 'notes' => 'ماء'],
                ['category' => 'maintenance', 'amount' => 80],
            ],
        ])->assertCreated()->assertJsonPath('data.posted', 3);

        $movements = DB::table('cash_movements')->where('direction', 'outgoing')->get();

        $this->assertCount(3, $movements);
        $this->assertSame(['posted'], $movements->pluck('status')->unique()->all());
        $this->assertNull($movements->first()->party_id);
        $this->assertSame('PETTY-20260510-operating_expense', $movements->first()->reference);
    }

    public function test_date_range_repeats_every_entry_on_each_day(): void
    {
        $this->signIn();

        $this->postJson('/api/finance/petty-expenses', [
            'movement_date' => '2026-05-10',
            'movement_date_to' => '2026-05-12',
            'entries' => [
                ['category' => 'operating_expense', 'amount' => 13, 'notes' => 'فطور'],
                ['category' => 'operating_expense', 'amount' => 14, 'notes' => 'مواصلات'],
            ],
        ])->assertCreated()->assertJsonPath('data.posted', 6);

        $this->assertSame(
            ['2026-05-10', '2026-05-11', '2026-05-12'],
            DB::table('cash_movements')->where('direction', 'outgoing')->orderBy('movement_date')->pluck('movement_date')->unique()->map(fn ($date) => substr((string) $date, 0, 10))->values()->all(),
        );
    }

    public function test_date_range_before_start_date_is_rejected(): void
    {
        $this->signIn();

        $this->postJson('/api/finance/petty-expenses', [
            'movement_date' => '2026-05-10',
            'movement_date_to' => '2026-05-01',
            'entries' => [['category' => 'other', 'amount' => 5]],
        ])->assertUnprocessable();
    }

    public function test_petty_expenses_can_be_deleted_and_leave_the_log(): void
    {
        $this->signIn();

        $this->postJson('/api/finance/petty-expenses', [
            'movement_date' => '2026-05-10',
            'entries' => [
                ['category' => 'operating_expense', 'amount' => 13],
                ['category' => 'operating_expense', 'amount' => 14],
            ],
        ])->assertCreated();

        $ids = DB::table('cash_movements')->where('category', 'operating_expense')->pluck('id')->all();

        $this->postJson('/api/finance/petty-expenses/delete', ['ids' => $ids])
            ->assertOk()
            ->assertJsonPath('data.deleted', 2);

        $this->assertSame(['reversed'], DB::table('cash_movements')->whereIn('id', $ids)->pluck('status')->unique()->all());

        $this->getJson('/api/finance/cash-movements?petty=1&direction=outgoing')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_petty_expense_date_can_be_changed_through_a_correction(): void
    {
        $this->signIn();

        $this->postJson('/api/finance/petty-expenses', [
            'movement_date' => '2026-05-10',
            'entries' => [['category' => 'operating_expense', 'amount' => 13, 'notes' => 'فطور']],
        ])->assertCreated();

        $original = DB::table('cash_movements')->where('category', 'operating_expense')->value('id');

        $this->patchJson('/api/finance/petty-expenses/'.$original, ['movement_date' => '2026-05-12'])
            ->assertOk()
            ->assertJsonPath('data.awaiting_approval', false);

        $this->getJson('/api/finance/cash-movements?petty=1&direction=outgoing')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.movement_date', '2026-05-12')
            ->assertJsonPath('data.0.notes', 'فطور');

        $this->assertSame('reversed', DB::table('cash_movements')->where('id', $original)->value('status'));
    }

    public function test_supplier_payment_category_is_rejected(): void
    {
        $this->signIn();

        $this->postJson('/api/finance/petty-expenses', [
            'movement_date' => '2026-05-10',
            'entries' => [['category' => 'supplier_payment', 'amount' => 25]],
        ])->assertUnprocessable();
    }

    public function test_summary_groups_payments_by_category_and_month(): void
    {
        $organization = $this->signIn();

        foreach ([['utilities', '300', '2026-03-01'], ['utilities', '200', '2026-04-02'], ['maintenance', '50', '2026-04-03']] as $i => [$category, $amount, $date]) {
            DB::table('cash_movements')->insert([
                'organization_id' => $organization->id, 'number' => 'P-'.$i, 'direction' => 'outgoing', 'status' => 'posted',
                'category' => $category, 'amount' => $amount, 'currency' => 'ILS', 'movement_date' => $date,
                'method' => 'cash', 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        $data = $this->getJson('/api/finance/petty-expenses/summary')->assertOk()->json('data');

        $this->assertSame(3, $data['count']);
        $this->assertSame('550.0000', $data['total']);
        $this->assertSame(['2026-04', '2026-03'], array_column($data['by_month'], 'month'));
        $this->assertSame('250.0000', $data['by_month'][0]['total']);
        $this->assertSame(['utilities', 'maintenance'], array_column($data['by_category'], 'category'));
        $this->assertSame('500.0000', $data['by_category'][0]['total']);
    }

    public function test_cash_list_can_be_limited_to_payments_without_a_payee(): void
    {
        $organization = $this->signIn();

        foreach (['P-1', 'P-2'] as $number) {
            DB::table('cash_movements')->insert([
                'organization_id' => $organization->id, 'number' => $number, 'direction' => 'outgoing', 'status' => 'posted',
                'category' => 'utilities', 'amount' => '10', 'currency' => 'ILS', 'movement_date' => '2026-03-01',
                'method' => 'cash', 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        $this->getJson('/api/finance/cash-movements?direction=outgoing&petty=1')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_payments_list_hides_petty_and_government_payments_are_filterable(): void
    {
        $organization = $this->signIn();

        foreach ([['P-1', 'utilities'], ['P-2', 'tax_payment'], ['P-3', 'government_fee']] as [$number, $category]) {
            DB::table('cash_movements')->insert([
                'organization_id' => $organization->id, 'number' => $number, 'direction' => 'outgoing', 'status' => 'posted',
                'category' => $category, 'amount' => '10', 'currency' => 'ILS', 'movement_date' => '2026-03-01',
                'method' => 'cash', 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        $numbers = fn (string $query): array => collect($this->getJson('/api/finance/cash-movements?direction=outgoing&'.$query)->assertOk()->json('data'))
            ->pluck('number')->sort()->values()->all();

        $this->assertSame(['P-2', 'P-3'], $numbers('exclude_petty=1'));
        $this->assertSame(['P-1'], $numbers('petty=1'));
        $this->assertSame(['P-2', 'P-3'], $numbers('government=1'));
    }
}
