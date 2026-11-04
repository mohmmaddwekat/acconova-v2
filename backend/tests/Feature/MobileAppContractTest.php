<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Database\Seeders\PassportMobileClientSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Passport\Passport;
use Tests\TestCase;

/**
 * The mobile app reads these exact response shapes. If one of them changes,
 * the matching screen in /mobile must change with it.
 */
class MobileAppContractTest extends TestCase
{
    use RefreshDatabase;

    /** @var array<string, string> */
    private array $headers;

    private int $customerId;

    private int $invoiceId;

    protected function setUp(): void
    {
        parent::setUp();

        if (! is_file(Passport::keyPath('oauth-private.key'))) {
            $this->artisan('passport:keys');
        }
        $this->seed(PassportMobileClientSeeder::class);

        $user = User::factory()->create();
        Organization::create(['name' => 'Contract Co'])->users()->attach($user->id, ['role' => 'owner']);
        $this->headers = ['Authorization' => 'Bearer '.$user->createToken('mobile')->accessToken];

        $this->customerId = $this->postJson('/api/parties', [
            'type' => 'company', 'company_name' => 'Customer Co', 'roles' => ['customer'],
        ], $this->headers)->assertCreated()->json('data.id');

        $this->invoiceId = $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice', 'party_id' => $this->customerId,
            'issue_date' => now()->toDateString(), 'due_date' => now()->addDays(10)->toDateString(),
            'activity_type' => 'services', 'market_type' => 'local', 'currency' => 'ILS', 'exchange_rate' => '1', 'shipping_total' => '0',
            'lines' => [['description' => 'Service', 'quantity' => '1', 'unit' => 'service', 'unit_price' => '500',
                'discount_percent' => '0', 'tax_rate' => '0', 'affects_inventory' => false]],
        ], $this->headers)->assertCreated()->json('data.id');

        $this->postJson("/api/finance/documents/{$this->invoiceId}/issue", ['acknowledge_warnings' => false], $this->headers)->assertOk();
    }

    public function test_documents_list_needs_a_kind_and_returns_rows_with_a_summary(): void
    {
        $this->getJson('/api/finance/documents?type=invoice', $this->headers)->assertUnprocessable();

        $this->getJson('/api/finance/documents?kind=sale_invoice&per_page=50', $this->headers)
            ->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'number', 'status', 'party', 'issue_date', 'due_date', 'currency', 'total', 'paid_total', 'balance_due']],
                'summary' => ['count', 'total', 'paid', 'outstanding', 'overdue', 'overdue_amount'],
            ])
            ->assertJsonPath('summary.outstanding', '500.0000');
    }

    public function test_parties_expose_roles_and_a_balance_summary(): void
    {
        $this->getJson('/api/parties?per_page=100', $this->headers)
            ->assertOk()
            ->assertJsonPath('data.0.roles', ['customer'])
            ->assertJsonPath('data.0.company_name', 'Customer Co')
            ->assertJsonStructure(['data' => [['id', 'name', 'company_name', 'phone', 'roles', 'balance_summary' => ['owed_to_us', 'we_owe']]]]);

        $this->getJson("/api/parties/{$this->customerId}/account", $this->headers)
            ->assertOk()
            ->assertJsonStructure([
                'party' => ['id', 'company_name', 'phone', 'email'],
                'summary' => ['closing_balance', 'transaction_count'],
                'positions' => ['customer', 'supplier'],
                'aging' => ['current', 'days_1_30', 'days_31_60', 'days_61_90', 'over_90'],
                'transactions' => [['id', 'type', 'date', 'reference', 'debit', 'credit', 'balance']],
            ]);
    }

    public function test_an_invoice_is_paid_through_an_allocated_cash_movement(): void
    {
        $this->getJson("/api/finance/documents/{$this->invoiceId}", $this->headers)
            ->assertOk()
            ->assertJsonStructure(['data' => ['id', 'number', 'kind', 'status', 'currency', 'subtotal', 'tax_total', 'total', 'paid_total', 'balance_due',
                'party', 'party_detail' => ['name', 'phone'], 'lines' => [['description', 'quantity', 'unit_price', 'line_total']], 'allocations']]);

        $movementId = $this->postJson('/api/finance/cash-movements', [
            'direction' => 'incoming', 'party_id' => $this->customerId, 'category' => 'customer_receipt', 'amount' => 200,
            'currency' => 'ILS', 'movement_date' => now()->toDateString(), 'method' => 'cash', 'reference' => 'INV',
            'allocations' => [['financial_document_id' => $this->invoiceId, 'amount' => 200]],
        ], $this->headers)->assertCreated()->json('data.id');

        $this->postJson("/api/finance/cash-movements/{$movementId}/post", [], $this->headers)->assertOk();

        $this->getJson("/api/finance/documents/{$this->invoiceId}", $this->headers)
            ->assertJsonPath('data.status', 'partially_paid')
            ->assertJsonPath('data.balance_due', '300.0000');
    }

    public function test_quick_entry_receipt_reports_a_per_row_result(): void
    {
        $this->postJson('/api/finance/quick-entry', ['rows' => [[
            'type' => 'receipt', 'date' => now()->toDateString(), 'party_id' => $this->customerId,
            'payment' => ['amount' => 50, 'method' => 'cash'],
        ]]], $this->headers)
            ->assertOk()
            ->assertJsonPath('data.0.ok', true);

        $this->postJson('/api/finance/quick-entry', ['rows' => [[
            'type' => 'receipt', 'date' => now()->toDateString(), 'payment' => ['amount' => 50, 'method' => 'cash'],
        ]]], $this->headers)
            ->assertOk()
            ->assertJsonPath('data.0.ok', false);
    }

    public function test_reference_price_prefers_a_saved_party_price_then_history_then_the_catalog(): void
    {
        $productId = $this->postJson('/api/products', [
            'type' => 'product', 'name' => 'Widget', 'unit' => 'piece', 'unit_price' => '100', 'cost_price' => '60',
            'tax_rate' => '0', 'track_inventory' => false,
        ], $this->headers)->assertCreated()->json('data.id');

        // Decimal formatting differs between MySQL ("80.0000") and SQLite (80), so compare numerically.
        $suggestion = function (string $kind) use ($productId): array {
            $response = $this->getJson(
                "/api/finance/reference-price?kind={$kind}&party_id={$this->customerId}&product_id={$productId}",
                $this->headers,
            )->assertOk();

            return [$response->json('source'), (float) $response->json('unit_price')];
        };

        // Nothing sold yet: the catalogue price (cost price for purchases).
        $this->assertSame(['catalog', 100.0], $suggestion('sale_invoice'));
        $this->assertSame(['catalog', 60.0], $suggestion('purchase_invoice'));

        // An issued invoice at a negotiated price becomes the party's next suggestion.
        $documentId = $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice', 'party_id' => $this->customerId,
            'issue_date' => now()->subDay()->toDateString(), 'due_date' => now()->addDays(10)->toDateString(),
            'activity_type' => 'trade', 'market_type' => 'local', 'currency' => 'ILS', 'exchange_rate' => '1', 'shipping_total' => '0',
            'lines' => [['product_id' => $productId, 'description' => 'Widget', 'quantity' => '1', 'unit' => 'piece', 'unit_price' => '90',
                'discount_percent' => '0', 'tax_rate' => '0', 'affects_inventory' => false]],
        ], $this->headers)->assertCreated()->json('data.id');
        $this->postJson("/api/finance/documents/{$documentId}/issue", ['acknowledge_warnings' => false], $this->headers)->assertOk();

        $this->assertSame(['party_history', 90.0], $suggestion('sale_invoice'));

        // A saved party price wins over history.
        $this->postJson("/api/parties/{$this->customerId}/prices", ['product_id' => $productId, 'unit_price' => 80], $this->headers)->assertSuccessful();
        $this->assertSame(['party_override', 80.0], $suggestion('sale_invoice'));
    }

    public function test_employee_screens_read_and_write_the_staff_endpoints(): void
    {
        $staffId = $this->postJson('/api/staff', [
            'name' => 'Ali Worker', 'job_title' => 'Clerk', 'basis' => 'month', 'rate' => '3000', 'monthly_allowance' => '0',
            'currency' => 'ILS', 'started_on' => now()->subMonths(2)->toDateString(),
        ], $this->headers)->assertCreated()->json('data.id');

        $this->postJson("/api/staff/{$staffId}/attendance", [
            'occurred_on' => now()->toDateString(), 'status' => 'present', 'overtime_hours' => 0, 'overtime_rate' => 0,
        ], $this->headers)->assertCreated();

        $this->postJson("/api/staff/{$staffId}/entries", [
            'request_id' => (string) Str::uuid(), 'kind' => 'bonus', 'occurred_on' => now()->toDateString(), 'amount' => 200,
        ], $this->headers)->assertCreated();

        // The batch endpoint the "pay everyone" button uses.
        $this->postJson('/api/staff-transactions/bulk', [
            'batch_id' => (string) Str::uuid(), 'kind' => 'payment', 'occurred_on' => now()->toDateString(),
            'rows' => [['staff_id' => $staffId, 'amount' => 100]],
        ], $this->headers)->assertSuccessful();

        $this->getJson('/api/staff-transactions/bulk?per_page=100', $this->headers)
            ->assertOk()
            ->assertJsonStructure(['data' => [['id', 'name', 'job_title', 'basis', 'currency', 'active', 'balance']]]);

        // The overview uses MySQL's TIMESTAMPDIFF, so it can only run against MySQL.
        if (DB::getDriverName() === 'mysql') {
            $this->getJson('/api/staff-overview', $this->headers)
                ->assertOk()
                ->assertJsonStructure([
                    'totals' => ['employees', 'active'],
                    'attendance' => ['present_today', 'absent_today', 'missing_today'],
                    'payroll' => [['currency', 'monthly_commitment', 'balance']],
                ]);
        }

        $this->getJson('/api/staff-attendance/bulk?per_page=100&date='.now()->toDateString(), $this->headers)
            ->assertOk()
            ->assertJsonPath('data.0.attendance.status', 'present');

        $this->getJson("/api/staff/{$staffId}/ledger", $this->headers)
            ->assertOk()
            ->assertJsonStructure([
                'balance',
                'member' => ['name', 'job_title', 'basis', 'rate', 'payroll_summary' => [
                    'work_earned', 'bonus', 'allowances', 'overtime', 'gross_earned', 'deductions', 'advances', 'net_entitlement', 'paid', 'remaining_due',
                ]],
                'entries' => ['data' => [['id', 'kind', 'occurred_on', 'amount', 'notes']]],
            ]);

        $this->getJson("/api/staff/{$staffId}/workforce", $this->headers)
            ->assertOk()
            ->assertJsonStructure([
                'attendance' => ['data' => [['id', 'occurred_on', 'status', 'overtime_hours', 'earned']]],
                'summary' => ['present', 'absent', 'overtime'],
                'payroll' => ['rows' => [['period', 'present', 'absent', 'gross_earnings', 'deductions', 'advances', 'net_entitlement', 'payments', 'remaining', 'status']]],
            ]);
    }

    public function test_report_screens_read_aging_profitability_inventory_and_movements(): void
    {
        $this->getJson('/api/operations/ar-aging', $this->headers)
            ->assertOk()
            ->assertJsonStructure(['data' => [['party_id', 'party', 'currency', 'current', '0_30', '31_60', '61_90', '90_plus', 'total']]]);
        $this->getJson('/api/operations/ap-aging', $this->headers)->assertOk()->assertJsonStructure(['data']);

        $this->getJson('/api/dashboard-intelligence', $this->headers)
            ->assertOk()
            ->assertJsonStructure(['data' => [
                'trends' => [['metric', 'current', 'previous_month', 'vs_previous_month_percent']],
                'profitability' => ['visible', 'period', 'revenue', 'cogs', 'gross_profit', 'margin_percent', 'top_customers', 'top_products'],
            ]]);

        $this->getJson('/api/inventory/overview', $this->headers)
            ->assertOk()
            ->assertJsonStructure(['data' => ['metrics' => [
                'active_warehouses', 'tracked_products', 'low_stock_products', 'out_of_stock_products', 'inventory_value',
            ]]]);

        $movementId = $this->postJson('/api/finance/cash-movements', [
            'direction' => 'incoming', 'party_id' => $this->customerId, 'category' => 'customer_receipt', 'amount' => 100,
            'currency' => 'ILS', 'movement_date' => now()->toDateString(), 'method' => 'cash',
            'allocations' => [['financial_document_id' => $this->invoiceId, 'amount' => 100]],
        ], $this->headers)->assertCreated()->json('data.id');
        $this->postJson("/api/finance/cash-movements/{$movementId}/post", [], $this->headers)->assertOk();

        $this->getJson('/api/finance/cash-movements?per_page=50&status=posted&sort=date&sort_direction=desc&direction=incoming', $this->headers)
            ->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'number', 'direction', 'status', 'category', 'party', 'amount', 'currency', 'movement_date', 'method', 'reference', 'notes']],
                'summary' => ['count', 'posted_incoming', 'posted_outgoing'],
            ]);

        $this->getJson('/api/notifications/count', $this->headers)->assertOk()->assertJsonStructure(['count', 'latest_id']);
        $this->getJson('/api/notifications?per_page=30', $this->headers)->assertOk()->assertJsonStructure(['data']);
    }

    public function test_the_other_screens_read_their_documented_shapes(): void
    {
        $this->getJson('/api/approval-requests?status=pending', $this->headers)->assertOk()->assertJsonStructure(['data']);
        $this->getJson('/api/collections/follow-ups', $this->headers)->assertOk()->assertJsonStructure(['data']);
        $this->getJson('/api/business-pulse/cashflow', $this->headers)->assertOk()->assertJsonStructure(['data' => ['month', 'days']]);
        $this->getJson('/api/staff-attendance/bulk?per_page=100', $this->headers)->assertOk()->assertJsonStructure(['date', 'data', 'pagination']);
        $this->getJson('/api/products?per_page=100', $this->headers)->assertOk()->assertJsonStructure(['data']);
        $this->getJson('/api/finance/cash-flow-forecast', $this->headers)->assertOk()->assertJsonStructure([
            'data' => ['horizon_days', 'opening' => ['confirmed_cash'], 'totals' => [
                'confirmed' => ['cash_today', 'outflows'],
                'expected' => ['gross_receipts', 'weighted_receipts'],
                'pending_cheques' => ['receivable_gross', 'payable'],
            ], 'timeline' => [['from', 'to', 'confirmed_outflows', 'expected_receipts', 'expected_balance']]],
        ]);
    }
}
