<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

        $result = $this->postJson('/api/finance/quick-entry', [
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

    public function test_one_failing_row_does_not_block_the_others_and_rows_run_oldest_first(): void
    {
        $this->signIn();
        $customerId = $this->party('customer', 'Order Customer');
        $productId = $this->product('Quick Product B');
        $line = [['product_id' => $productId, 'quantity' => '1', 'unit_price' => '100']];

        $results = $this->postJson('/api/finance/quick-entry', [
            'rows' => [
                ['type' => 'sale', 'date' => '2026-02-05', 'party_id' => $customerId, 'lines' => $line],
                ['type' => 'sale', 'date' => '2026-02-05', 'party_id' => $customerId, 'lines' => $line],
                ['type' => 'receipt', 'date' => '2026-02-06', 'party_id' => $customerId, 'payment' => ['amount' => '150', 'method' => 'cash']],
            ],
        ])->assertOk()->json('data');

        $this->assertTrue($results[0]['ok']);
        $this->assertFalse($results[1]['ok']);
        $this->assertTrue($results[2]['ok']);
        $this->assertSame('100.0000', $results[2]['allocated']);
        $this->assertSame('50.0000', $results[2]['advance']);
        $this->assertDatabaseHas('financial_documents', ['id' => $results[0]['document_id'], 'status' => 'paid']);
    }

    public function test_misc_sale_is_paid_in_cash_and_a_check_without_a_number_is_rejected(): void
    {
        $this->signIn();
        $supplierId = $this->party('supplier', 'Quick Supplier');
        $productId = $this->product('Quick Product C');

        $results = $this->postJson('/api/finance/quick-entry', [
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

        $result = $this->postJson('/api/finance/quick-entry', [
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

    private function signIn(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Quick entry workspace']);
        $organization->users()->attach($user->id, ['role' => 'owner']);

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
