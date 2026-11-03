<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MiscSalesTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_walk_in_sale_is_issued_and_paid_in_cash_at_once(): void
    {
        $this->signIn();

        $response = $this->postJson('/api/finance/misc-sales', $this->sale('100', 3))->assertCreated();

        $response->assertJsonPath('data.total', '300.0000');

        $invoice = $this->getJson('/api/finance/documents/'.$response->json('data.id'))
            ->assertOk()
            ->json('data');

        $this->assertSame('paid', $invoice['status']);
        $this->assertSame('300.0000', $invoice['paid_total']);
        $this->assertSame('0.0000', $invoice['balance_due']);
    }

    public function test_several_walk_in_sales_can_be_recorded_on_the_same_day(): void
    {
        $this->signIn();

        $this->postJson('/api/finance/misc-sales', $this->sale('10', 1))->assertCreated();
        $this->postJson('/api/finance/misc-sales', $this->sale('20', 1))->assertCreated();
        $this->postJson('/api/finance/misc-sales', $this->sale('30', 1))->assertCreated();

        $this->getJson('/api/finance/documents?kind=sale_invoice&misc=1')
            ->assertOk()
            ->assertJsonCount(3, 'data');
    }

    public function test_walk_in_sales_and_receipts_stay_out_of_the_normal_lists(): void
    {
        $this->signIn();

        $this->postJson('/api/finance/misc-sales', $this->sale('50', 2))->assertCreated();

        $this->getJson('/api/finance/documents?kind=sale_invoice')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->getJson('/api/finance/cash-movements?direction=incoming')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->getJson('/api/finance/cash-movements?direction=incoming&misc=1')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_the_whole_invoice_discount_applies_to_a_walk_in_sale(): void
    {
        $this->signIn();

        $this->postJson('/api/finance/misc-sales', [
            ...$this->sale('100', 2),
            'document_discount_type' => 'percent',
            'document_discount_value' => '10',
        ])
            ->assertCreated()
            ->assertJsonPath('data.discount_total', '20.0000')
            ->assertJsonPath('data.total', '180.0000');
    }

    private function signIn(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Misc sales workspace']);
        $organization->users()->attach($user->id, ['role' => 'owner']);

        $this->actingAs($user)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);
    }

    /** @return array<string, mixed> */
    private function sale(string $price, int $quantity): array
    {
        return [
            'issue_date' => today()->toDateString(),
            'lines' => [[
                'description' => 'Soap',
                'unit' => 'unit',
                'quantity' => (string) $quantity,
                'unit_price' => $price,
            ]],
        ];
    }
}
