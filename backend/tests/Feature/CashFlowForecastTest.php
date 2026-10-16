<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CashFlowForecastTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    protected function setUp(): void
    {
        parent::setUp();

        $owner = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Forecast Co']);
        $this->organization->users()->attach($owner->id, ['role' => 'owner']);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $this->organization->id]);
    }

    private function day(int $daysAgo): string
    {
        return now()->subDays($daysAgo)->toDateString();
    }

    /**
     * @param  list<string>  $roles
     */
    private function party(string $name, array $roles = ['customer']): int
    {
        return $this->postJson('/api/parties', ['type' => 'company', 'company_name' => $name, 'roles' => $roles])->assertCreated()->json('data.id');
    }

    private function invoice(int $party, int $amount, int $issuedDaysAgo, int $dueDaysAgo, string $kind = 'sale_invoice'): int
    {
        $id = $this->postJson('/api/finance/documents', [
            'kind' => $kind, 'party_id' => $party,
            'issue_date' => $this->day($issuedDaysAgo), 'due_date' => $this->day($dueDaysAgo),
            'activity_type' => 'services', 'market_type' => 'local', 'currency' => 'ILS', 'exchange_rate' => '1', 'shipping_total' => '0',
            'lines' => [['description' => 'Service', 'quantity' => '1', 'unit' => 'service', 'unit_price' => (string) $amount,
                'discount_percent' => '0', 'tax_rate' => '0', 'affects_inventory' => false]],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/documents/{$id}/issue", ['acknowledge_warnings' => false])->assertOk();

        return $id;
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function pay(int $party, int $document, int $amount, int $paidDaysAgo, string $method = 'cash', array $extra = []): int
    {
        $id = $this->postJson('/api/finance/cash-movements', [
            'direction' => 'incoming', 'party_id' => $party, 'category' => 'customer_receipt', 'amount' => (string) $amount,
            'currency' => 'ILS', 'movement_date' => $this->day($paidDaysAgo), 'method' => $method, 'account_label' => 'Main',
            'allocations' => [['financial_document_id' => $document, 'amount' => (string) $amount]], ...$extra,
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/cash-movements/{$id}/post")->assertOk();

        return $id;
    }

    /** A reliable customer: four invoices of 200 paid early, so 800 of cleared cash. */
    private function reliableCustomer(string $name): int
    {
        $party = $this->party($name);

        foreach ([100, 80, 60, 40] as $issued) {
            $this->pay($party, $this->invoice($party, 200, $issued, $issued - 30), 200, ($issued - 30) + 20);
        }

        return $party;
    }

    /**
     * @return array<string, mixed>
     */
    private function forecast(string $query = ''): array
    {
        return $this->getJson('/api/finance/cash-flow-forecast'.$query)->assertOk()->json('data');
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function item(array $data, string $kind, ?int $party = null): array
    {
        foreach ($data['items'] as $item) {
            if ($item['kind'] === $kind && ($party === null || $item['party_id'] === $party)) {
                return $item;
            }
        }

        $this->fail("No {$kind} item in the forecast.");
    }

    public function test_confirmed_expected_and_pending_cheques_are_kept_apart(): void
    {
        $reliable = $this->reliableCustomer('Reliable');
        $this->invoice($reliable, 400, 20, -10);

        $unknown = $this->party('Unknown');
        $this->invoice($unknown, 200, 25, -5);

        $cheque = $this->party('Cheque Payer');
        $chequeInvoice = $this->invoice($cheque, 300, 40, -20);
        $this->pay($cheque, $chequeInvoice, 300, 1, 'check', [
            'check_number' => 'CHK-1', 'check_bank' => 'Bank', 'check_due_date' => now()->addDays(20)->toDateString(),
        ]);

        $promiser = $this->party('Promiser');
        $promisedInvoice = $this->invoice($promiser, 500, 70, 40);
        DB::table('payment_promises')->insert([
            'organization_id' => $this->organization->id, 'party_id' => $promiser, 'financial_document_id' => $promisedInvoice,
            'amount' => '250', 'promised_on' => now()->addDays(7)->toDateString(), 'status' => 'open', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $supplier = $this->party('Supplier', ['supplier']);
        $this->invoice($supplier, 600, 15, -15, 'purchase_invoice');
        DB::table('government_obligations')->insert([
            'organization_id' => $this->organization->id, 'authority_name' => 'Tax', 'title' => 'VAT', 'obligation_type' => 'vat', 'country_code' => 'PS',
            'due_date' => now()->addDays(12)->toDateString(), 'amount' => '150', 'paid_total' => '0', 'balance_due' => '150', 'currency' => 'ILS',
            'status' => 'open', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->postJson('/api/payment-plans', [
            'title' => 'Rent', 'direction' => 'outgoing', 'amount' => '100', 'currency' => 'ILS', 'frequency' => 'monthly',
            'next_due_on' => now()->addDays(3)->toDateString(), 'reminder_days' => 3,
        ])->assertCreated();

        $data = $this->forecast('?horizon_days=60&delay_days=60');

        $this->assertSame('800.0000', $data['opening']['confirmed_cash'], 'only cleared cash');
        $this->assertSame('300.0000', $data['opening']['excluded_pending_cheques_in'], 'the cheque in hand is not cash');
        $this->assertSame('800.0000', $data['totals']['confirmed']['cash_today']);
        $this->assertSame('950.0000', $data['totals']['confirmed']['outflows'], 'supplier 600 + VAT 150 + rent 100 twice');

        $this->assertSame('700.0000', $data['totals']['expected']['weighted_receipts'], '380 + 100 + 95 + 125');
        $this->assertSame('300.0000', $data['totals']['pending_cheques']['receivable_gross']);
        $this->assertSame('255.0000', $data['totals']['pending_cheques']['receivable_weighted']);

        $chequeItem = $this->item($data, 'cheque_in');
        $this->assertSame('pending_cheque', $chequeItem['layer']);
        $this->assertSame(now()->addDays(20)->toDateString(), $chequeItem['expected_date']);
        $invoiceParties = array_column(array_filter($data['items'], fn (array $item): bool => $item['kind'] === 'customer_invoice'), 'party_id');
        $this->assertNotContains($cheque, $invoiceParties, 'a cheque invoice is not counted twice');

        $promise = $this->item($data, 'promise');
        $this->assertSame('expected', $promise['layer']);
        $this->assertSame('125.0000', $promise['weighted_amount']);
        $this->assertSame('250.0000', $this->item($data, 'customer_invoice', $promiser)['amount'], 'the promised part leaves the invoice');
        $this->assertSame('380.0000', $this->item($data, 'customer_invoice', $reliable)['weighted_amount']);
        $this->assertSame('100.0000', $this->item($data, 'customer_invoice', $unknown)['weighted_amount']);

        $confirmedOnly = $data['scenarios']['confirmed_only'];
        $this->assertSame('-150.0000', $confirmedOnly['ending_balance'], 'no receipt is assumed');
        $this->assertNotNull($confirmedOnly['first_negative_week_ending']);
        $this->assertSame('805.0000', $data['scenarios']['expected']['ending_balance']);
        $this->assertSame('-150.0000', $data['scenarios']['late_collection']['ending_balance'], 'every receipt slips past the horizon');
        $this->assertContains('Only cleared cash counts as confirmed. Cheques not yet cleared, promises and unpaid invoices are never confirmed cash.', $data['assumptions']);
    }

    public function test_a_missed_promise_is_not_counted_and_a_bounced_cheque_lowers_the_odds(): void
    {
        $customer = $this->party('Missed');
        $invoice = $this->invoice($customer, 500, 70, 40);
        DB::table('payment_promises')->insert([
            'organization_id' => $this->organization->id, 'party_id' => $customer, 'financial_document_id' => $invoice,
            'amount' => '500', 'promised_on' => $this->day(3), 'status' => 'open', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $bouncer = $this->party('Bouncer');
        $first = $this->invoice($bouncer, 100, 30, 10);
        $bounced = $this->pay($bouncer, $first, 100, 5, 'check', ['check_number' => 'B-1', 'check_bank' => 'Bank', 'check_due_date' => now()->addDays(2)->toDateString()]);
        $this->patchJson("/api/finance/cash-movements/{$bounced}/check-status", ['status' => 'bounced'])->assertOk();
        $second = $this->invoice($bouncer, 200, 5, -25);
        $this->pay($bouncer, $second, 200, 0, 'check', ['check_number' => 'B-2', 'check_bank' => 'Bank', 'check_due_date' => now()->addDays(10)->toDateString()]);

        $data = $this->forecast();

        $this->assertNotContains('promise', array_column($data['items'], 'kind'), 'a missed promise is not a receipt');
        $this->assertSame('500.0000', $this->item($data, 'customer_invoice', $customer)['amount'], 'its amount stays on the invoice');
        $this->assertSame(0.38, $this->item($data, 'customer_invoice', $customer)['probability'], '0.5 neutral x 0.75 for 30+ days late');
        $this->assertSame(0.4, $this->item($data, 'cheque_in', $bouncer)['probability']);
    }

    public function test_the_forecast_needs_cash_visibility(): void
    {
        $outsider = User::factory()->create();
        $this->organization->users()->attach($outsider->id, ['role' => 'employee']);
        $this->actingAs($outsider)->withSession([OrganizationAccess::SESSION_KEY => $this->organization->id]);

        $this->getJson('/api/finance/cash-flow-forecast')->assertForbidden();
    }
}
