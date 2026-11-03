<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CashMovementAmountFilterTest extends TestCase
{
    use RefreshDatabase;

    public function test_cash_movements_can_be_filtered_by_amount_range(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Cash Filter Co']);
        $organization->users()->attach($user->id, ['role' => OrganizationRole::Owner->value]);

        foreach ([['P-1', '100', '2026-03-01'], ['P-2', '900', '2026-03-02'], ['P-3', '2500', '2026-03-03']] as [$number, $amount, $date]) {
            DB::table('cash_movements')->insert([
                'organization_id' => $organization->id, 'number' => $number, 'direction' => 'outgoing', 'status' => 'posted',
                'category' => 'utilities', 'amount' => $amount, 'currency' => 'ILS', 'movement_date' => $date,
                'method' => 'cash', 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        $numbers = fn (string $query): array => collect($this->getJson('/api/finance/cash-movements?direction=outgoing&'.$query)->assertOk()->json('data'))
            ->pluck('number')->sort()->values()->all();

        $this->assertSame(['P-2', 'P-3'], $numbers('min_amount=500'));
        $this->assertSame(['P-1', 'P-2'], $numbers('max_amount=900'));
        $this->assertSame(['P-2'], $numbers('min_amount=500&max_amount=1000'));
        $this->assertSame(['P-2', 'P-3'], $numbers('date_from=2026-03-02'));
    }
}
