<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\Product;
use App\Models\User;
use App\Models\Warehouse;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class QuickEntryTest extends TestCase
{
    use RefreshDatabase;

    public function test_invoice_with_discount_and_overpayment_settles_an_older_invoice(): void
    {
        $this->signIn();
        $customerId = $this->party('customer', 'Quick Customer');
        $productId = $this->product('Quick Product A');
        $olderId = $this->issuedInvoice($customerId, $productId, '500', '2026-01-10');

        $result = $this->postJson('/api/quick-entry', [
            'rows' => [[
                'type' => 'sale',
                'date' => '2026-01-20',
                'reference' => 'PAPER-77',
                'party_id' => $customerId,
                'lines' => [['product_id' => $productId, 'quantity' => '10', 'unit_price' => '100']],
                'discount_type' => 'percent',
                'discount_value' => '10',
                'payment' => ['amount' => '1200', 'method' => 'cash'],
            ]],
        ])->assertOk()->json('data.0');

        $this->assertTrue($result['ok'], json_encode($result));
        $this->assertSame('900.0000', $result['total']);
        $this->assertSame('1200.0000', $result['paid']);
        $this->assertSame('1200.0000', $result['allocated']);
        $this->assertSame('0.0000', $result['advance']);

        $this->assertDatabaseHas('financial_documents', [
            'id' => $result['document_id'],
            'status' => 'paid',
            'external_number' => 'PAPER-77',
        ]);
        $this->assertDatabaseHas('financial_documents', [
            'id' => $olderId,
            'status' => 'partially_paid',
            'balance_due' => '200.0000',
        ]);
    }

    public function test_same_day_rows_merge_and_a_failing_row_does_not_block_the_others(): void
    {
        $this->signIn();
        $customerId = $this->party('customer', 'Order Customer');
        $productId = $this->product('Quick Product B');
        $line = [['product_id' => $productId, 'quantity' => '1', 'unit_price' => '100']];

        $results = $this->postJson('/api/quick-entry', [
            'rows' => [
                ['type' => 'sale', 'date' => '2026-02-05', 'party_id' => $customerId, 'lines' => $line],
                ['type' => 'sale', 'date' => '2026-02-05', 'party_id' => $customerId, 'lines' => $line],
                ['type' => 'receipt', 'date' => '2026-02-06', 'party_id' => $customerId, 'payment' => ['amount' => '150', 'method' => 'cash']],
            ],
        ])->assertOk()->json('data');

        $this->assertTrue($results[0]['ok']);
        $this->assertTrue($results[1]['ok']);
        $this->assertTrue($results[1]['merged']);
        $this->assertSame('200.0000', $results[1]['total']);
        $this->assertTrue($results[2]['ok']);
        $this->assertSame('150.0000', $results[2]['allocated']);
        $this->assertSame('0.0000', $results[2]['advance']);
        $this->assertDatabaseHas('financial_documents', ['id' => $results[0]['document_id'], 'status' => 'superseded']);
        $this->assertDatabaseHas('financial_documents', ['id' => $results[1]['document_id'], 'status' => 'partially_paid', 'balance_due' => '50.0000']);
    }

    public function test_misc_sale_is_paid_in_cash_and_a_check_without_a_number_is_rejected(): void
    {
        $this->signIn();
        $supplierId = $this->party('supplier', 'Quick Supplier');
        $productId = $this->product('Quick Product C');

        $results = $this->postJson('/api/quick-entry', [
            'rows' => [
                ['type' => 'misc', 'date' => '2026-03-01', 'lines' => [['product_id' => $productId, 'quantity' => '3', 'unit_price' => '50']]],
                [
                    'type' => 'purchase',
                    'date' => '2026-03-02',
                    'party_id' => $supplierId,
                    'lines' => [['product_id' => $productId, 'quantity' => '2', 'unit_price' => '40']],
                    'payment' => ['amount' => '80', 'method' => 'check'],
                ],
            ],
        ])->assertOk()->json('data');

        $this->assertTrue($results[0]['ok']);
        $this->assertSame('150.0000', $results[0]['paid']);
        $this->assertDatabaseHas('financial_documents', ['id' => $results[0]['document_id'], 'status' => 'paid', 'is_misc_sale' => 1]);

        $this->assertFalse($results[1]['ok']);
        $this->assertDatabaseMissing('financial_documents', ['kind' => 'purchase_invoice', 'issue_date' => '2026-03-02 00:00:00']);
    }

    public function test_full_payment_flag_pays_the_exact_invoice_total_including_tax(): void
    {
        $this->signIn();
        $customerId = $this->party('customer', 'Full Pay Customer');
        $productId = (int) $this->postJson('/api/products', [
            'type' => 'product',
            'name' => 'Taxed Product',
            'sku' => null,
            'unit' => 'unit',
            'unit_price' => '10.0000',
            'cost_price' => '5.0000',
            'tax_rate' => '16',
        ])->assertCreated()->json('data.id');

        $result = $this->postJson('/api/quick-entry', [
            'rows' => [[
                'type' => 'sale',
                'date' => '2026-04-01',
                'party_id' => $customerId,
                'lines' => [['product_id' => $productId, 'quantity' => '3', 'unit_price' => '9.99']],
                'discount_type' => 'fixed',
                'discount_value' => '1',
                'payment' => ['full' => true, 'method' => 'cash'],
            ]],
        ])->assertOk()->json('data.0');

        $this->assertTrue($result['ok'], json_encode($result));
        $this->assertSame($result['total'], $result['paid']);
        $this->assertDatabaseHas('financial_documents', [
            'id' => $result['document_id'],
            'status' => 'paid',
            'balance_due' => '0.0000',
        ]);
    }

    public function test_a_second_invoice_on_the_same_day_is_merged_into_the_first_and_keeps_its_payment(): void
    {
        $this->signIn();
        $customerId = $this->party('customer', 'Twice A Day');
        $productA = $this->product('Merge Product A');
        $productB = $this->product('Merge Product B');

        $first = $this->postJson('/api/quick-entry', [
            'rows' => [[
                'type' => 'sale',
                'date' => '2026-05-01',
                'party_id' => $customerId,
                'lines' => [['product_id' => $productA, 'quantity' => '2', 'unit_price' => '100']],
                'payment' => ['amount' => '50', 'method' => 'cash'],
            ]],
        ])->assertOk()->json('data.0');
        $this->assertTrue($first['ok'], json_encode($first));
        $this->assertFalse($first['merged']);

        $second = $this->postJson('/api/quick-entry', [
            'rows' => [[
                'type' => 'sale',
                'date' => '2026-05-01',
                'party_id' => $customerId,
                'lines' => [
                    ['product_id' => $productA, 'quantity' => '1', 'unit_price' => '100'],
                    ['product_id' => $productB, 'quantity' => '3', 'unit_price' => '20'],
                ],
                'payment' => ['full' => true, 'method' => 'cash'],
            ]],
        ])->assertOk()->json('data.0');

        $this->assertTrue($second['ok'], json_encode($second));
        $this->assertTrue($second['merged']);
        $this->assertSame('360.0000', $second['total']);
        $this->assertSame('160.0000', $second['paid']);

        $this->assertDatabaseHas('financial_documents', ['id' => $first['document_id'], 'status' => 'superseded']);
        $this->assertDatabaseHas('financial_documents', [
            'id' => $second['document_id'],
            'status' => 'partially_paid',
            'total' => '360.0000',
            'paid_total' => '210.0000',
            'balance_due' => '150.0000',
        ]);
        $this->assertDatabaseCount('financial_document_lines', 3);
    }

    public function test_petty_rows_are_posted_and_progress_reports_where_entry_stopped(): void
    {
        $this->signIn();

        $results = $this->postJson('/api/quick-entry', [
            'rows' => [
                ['type' => 'petty', 'date' => '2026-05-03', 'category' => 'utilities', 'amount' => '120', 'notes' => 'كهرباء'],
                ['type' => 'petty', 'date' => '2026-05-07', 'category' => 'rent', 'amount' => '500'],
                ['type' => 'petty', 'date' => '2026-05-07', 'category' => 'bogus', 'amount' => '10'],
            ],
        ])->assertOk()->json('data');

        $this->assertTrue($results[0]['ok'], json_encode($results[0]));
        $this->assertTrue($results[1]['ok']);
        $this->assertFalse($results[2]['ok']);
        $this->assertDatabaseHas('cash_movements', ['id' => $results[0]['movement_id'], 'status' => 'posted', 'category' => 'utilities', 'party_id' => null]);

        $progress = $this->getJson('/api/quick-entry/progress?from=2026-04-01')->assertOk()->json('data');

        $this->assertSame('2026-05-07', $progress['petty']['last']);
        $this->assertSame(1, $progress['petty']['days']['2026-05-03']);
        $this->assertNull($progress['sale']['last']);
    }

    public function test_attendance_and_staff_rows_are_saved_and_appear_in_progress(): void
    {
        $this->signIn();

        $staffId = (int) $this->postJson('/api/staff', [
            'name' => 'Quick Worker', 'job_title' => 'Clerk', 'basis' => 'month', 'rate' => '3000', 'monthly_allowance' => '0',
            'currency' => 'ILS', 'started_on' => '2026-01-01',
        ])->assertCreated()->json('data.id');

        $results = $this->postJson('/api/quick-entry', [
            'rows' => [
                ['type' => 'attendance', 'date' => '2026-05-04', 'staff_id' => $staffId, 'attendance_status' => 'present'],
                ['type' => 'attendance', 'date' => '2026-05-05', 'staff_id' => $staffId, 'attendance_status' => 'absent', 'notes' => 'مرض'],
                ['type' => 'attendance', 'date' => '2025-12-01', 'staff_id' => $staffId, 'attendance_status' => 'present'],
                ['type' => 'staff', 'date' => '2026-05-05', 'staff_id' => $staffId, 'staff_kind' => 'advance', 'amount' => '200'],
            ],
        ])->assertOk()->json('data');

        $this->assertTrue($results[0]['ok'], json_encode($results[0]));
        $this->assertTrue($results[1]['ok'], json_encode($results[1]));
        $this->assertFalse($results[2]['ok']);
        $this->assertTrue($results[3]['ok'], json_encode($results[3]));
        $this->assertDatabaseHas('staff_attendances', ['staff_member_id' => $staffId, 'status' => 'absent']);
        $this->assertDatabaseHas('staff_entries', ['staff_member_id' => $staffId, 'kind' => 'advance', 'amount' => '-200.0000']);

        $progress = $this->getJson('/api/quick-entry/progress?from=2026-04-01')->assertOk()->json('data');

        $this->assertSame('2026-05-05', $progress['attendance']['last']);
        $this->assertSame(1, $progress['attendance']['days']['2026-05-04']);
        $this->assertSame('2026-05-05', $progress['staff']['last']);
    }

    public function test_production_can_use_material_bought_the_same_day_even_when_entered_before_the_purchase(): void
    {
        $this->signIn();

        $warehouse = Warehouse::create(['code' => 'MAIN', 'name' => 'Main', 'is_default' => true]);
        $resin = Product::factory()->create(['type' => 'raw_material', 'name' => 'Same Day Resin', 'unit' => 'kg', 'track_inventory' => true]);
        $box = Product::factory()->create(['type' => 'product', 'name' => 'Same Day Box', 'unit' => 'piece', 'track_inventory' => true]);
        $supplierId = $this->party('supplier', 'Resin Supplier');

        $this->postJson("/api/products/{$box->id}/production-recipe", [
            'components' => [[
                'name' => 'Resin',
                'options' => [['raw_material_id' => $resin->id, 'quantity_per_unit' => '0.2500', 'is_default' => true]],
            ]],
        ])->assertCreated();

        $results = $this->postJson('/api/quick-entry', [
            'rows' => [
                ['type' => 'prod', 'date' => '2026-05-10', 'product_id' => $box->id, 'quantity' => '100'],
                [
                    'type' => 'purchase',
                    'date' => '2026-05-10',
                    'party_id' => $supplierId,
                    'affects_stock' => true,
                    'lines' => [['product_id' => $resin->id, 'quantity' => '100', 'unit_price' => '3']],
                ],
            ],
        ])->assertOk()->json('data');

        $this->assertTrue($results[1]['ok'], json_encode($results[1]));
        $this->assertTrue($results[0]['ok'], json_encode($results[0]));
        $this->assertEqualsWithDelta(75.0, (float) DB::table('inventory_balances')->where('product_id', $resin->id)->where('warehouse_id', $warehouse->id)->value('on_hand'), 0.0001);
        $this->assertEqualsWithDelta(100.0, (float) DB::table('inventory_balances')->where('product_id', $box->id)->where('warehouse_id', $warehouse->id)->value('on_hand'), 0.0001);

        $short = $this->postJson('/api/quick-entry', [
            'rows' => [['type' => 'prod', 'date' => '2026-05-11', 'product_id' => $box->id, 'quantity' => '1000']],
        ])->assertOk()->json('data.0');

        $this->assertFalse($short['ok']);
        $this->assertDatabaseCount('production_runs', 1);
    }

    public function test_a_purchase_can_be_paid_by_endorsing_a_check_on_hand(): void
    {
        $this->signIn();
        $customerId = $this->party('customer', 'Check Giver');
        $supplierId = $this->party('supplier', 'Check Receiver');
        $productId = $this->product('Quick Product E');

        $received = $this->postJson('/api/quick-entry', [
            'rows' => [[
                'type' => 'receipt',
                'date' => '2026-01-01',
                'party_id' => $customerId,
                'payment' => ['amount' => '300', 'method' => 'check', 'check_number' => 'CH-77', 'check_due_date' => '2026-06-01'],
            ]],
        ])->assertOk()->json('data.0');
        $this->assertTrue($received['ok'], json_encode($received));

        $this->getJson('/api/finance/cash-movements/cheques-on-hand')
            ->assertOk()->assertJsonPath('data.0.id', $received['movement_id']);

        $paid = $this->postJson('/api/quick-entry', [
            'rows' => [[
                'type' => 'purchase',
                'date' => '2026-02-01',
                'party_id' => $supplierId,
                'lines' => [['product_id' => $productId, 'quantity' => '1', 'unit_price' => '300']],
                'payment' => ['amount' => '300', 'method' => 'check', 'endorsed_movement_id' => $received['movement_id']],
            ]],
        ])->assertOk()->json('data.0');

        $this->assertTrue($paid['ok'], json_encode($paid));
        $this->assertDatabaseHas('financial_documents', ['id' => $paid['document_id'], 'status' => 'paid']);
        $this->assertDatabaseHas('cash_movements', ['id' => $paid['movement_id'], 'direction' => 'outgoing', 'check_number' => 'CH-77']);

        $this->getJson('/api/finance/cash-movements/cheques-on-hand')->assertOk()->assertJsonCount(0, 'data');
    }

    private function signIn(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Quick entry workspace']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);

        $this->actingAs($user)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);
    }

    private function party(string $role, string $name): int
    {
        return (int) $this->postJson('/api/parties', [
            'type' => 'company',
            'company_name' => $name,
            'roles' => [$role],
        ])->assertCreated()->json('data.id');
    }

    private function product(string $name): int
    {
        return (int) $this->postJson('/api/products', [
            'type' => 'product',
            'name' => $name,
            'sku' => null,
            'unit' => 'unit',
            'unit_price' => '100.0000',
            'cost_price' => '50.0000',
            'tax_rate' => '0',
        ])->assertCreated()->json('data.id');
    }

    private function issuedInvoice(int $partyId, int $productId, string $price, string $date): int
    {
        $id = (int) $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice',
            'party_id' => $partyId,
            'issue_date' => $date,
            'currency' => 'ILS',
            'lines' => [[
                'product_id' => $productId,
                'description' => 'Older invoice line',
                'quantity' => '1',
                'unit' => 'unit',
                'unit_price' => $price,
                'discount_percent' => '0',
                'tax_rate' => '0',
                'affects_inventory' => false,
            ]],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/documents/{$id}/issue", ['acknowledge_warnings' => true])->assertOk();

        return $id;
    }
}
