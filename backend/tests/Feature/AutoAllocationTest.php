<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AutoAllocationTest extends TestCase
{
    use RefreshDatabase;

    public function test_receipt_is_allocated_from_its_date_backwards(): void
    {
        $this->signIn();
        $customerId = $this->party('customer', 'Allocation Customer');

        $sameDay = $this->issuedInvoice('sale_invoice', $customerId, '500', '2026-02-10');
        $dayBefore = $this->issuedInvoice('sale_invoice', $customerId, '300', '2026-02-09');
        $twoDaysBefore = $this->issuedInvoice('sale_invoice', $customerId, '400', '2026-02-08');
        $later = $this->issuedInvoice('sale_invoice', $customerId, '250', '2026-02-12');
        $receiptId = $this->postedMovement('incoming', 'customer_receipt', $customerId, '1000', '2026-02-10');

        $plan = $this->postJson('/api/finance/auto-allocation/preview', [
            'movement_ids' => [$receiptId],
        ])->assertOk()->json('data.0');

        $this->assertSame(
            [$sameDay, $dayBefore, $twoDaysBefore],
            array_column($plan['lines'], 'document_id'),
        );
        $this->assertSame(
            ['500.0000', '300.0000', '200.0000'],
            array_column($plan['lines'], 'amount'),
        );
        $this->assertNull($plan['warning']);

        $this->postJson('/api/finance/auto-allocation/apply', [
            'movement_ids' => [$receiptId],
        ])
            ->assertOk()
            ->assertJsonPath('data.movements', 1)
            ->assertJsonPath('data.lines', 3)
            ->assertJsonPath('data.allocated', '1000.0000');

        $this->assertDatabaseHas('financial_documents', ['id' => $sameDay, 'status' => 'paid']);
        $this->assertDatabaseHas('financial_documents', ['id' => $dayBefore, 'status' => 'paid']);
        $this->assertDatabaseHas('financial_documents', ['id' => $twoDaysBefore, 'status' => 'partially_paid', 'balance_due' => '200.0000']);
        $this->assertDatabaseHas('financial_documents', ['id' => $later, 'status' => 'issued']);

        $this->getJson('/api/finance/auto-allocation')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_leftover_stays_as_advance_unless_continuing_on_newer_invoices(): void
    {
        $this->signIn();
        $supplierId = $this->party('supplier', 'Allocation Supplier');

        $older = $this->issuedInvoice('purchase_invoice', $supplierId, '1000', '2026-02-01');
        $newer = $this->issuedInvoice('purchase_invoice', $supplierId, '700', '2026-02-20');
        $paymentId = $this->postedMovement('outgoing', 'supplier_payment', $supplierId, '1500', '2026-02-05');

        $plan = $this->postJson('/api/finance/auto-allocation/preview', [
            'movement_ids' => [$paymentId],
        ])->assertOk()->json('data.0');

        $this->assertSame([$older], array_column($plan['lines'], 'document_id'));
        $this->assertSame('advance_left', $plan['warning']);
        $this->assertSame('500.0000', $plan['remaining']);

        $withNewer = $this->postJson('/api/finance/auto-allocation/preview', [
            'movement_ids' => [$paymentId],
            'continue_newer' => true,
        ])->assertOk()->json('data.0');

        $this->assertSame([$older, $newer], array_column($withNewer['lines'], 'document_id'));
        $this->assertNull($withNewer['warning']);
    }

    public function test_only_selected_movements_are_applied_and_other_parties_are_untouched(): void
    {
        $this->signIn();
        $customerId = $this->party('customer', 'First Customer');
        $otherCustomerId = $this->party('customer', 'Second Customer');

        $invoiceId = $this->issuedInvoice('sale_invoice', $customerId, '100', '2026-02-01');
        $otherInvoiceId = $this->issuedInvoice('sale_invoice', $otherCustomerId, '100', '2026-02-01');
        $selectedId = $this->postedMovement('incoming', 'customer_receipt', $customerId, '100', '2026-02-02');
        $skippedId = $this->postedMovement('incoming', 'customer_receipt', $otherCustomerId, '100', '2026-02-02');

        $this->postJson('/api/finance/auto-allocation/apply', [
            'movement_ids' => [$selectedId],
        ])->assertOk()->assertJsonPath('data.movements', 1);

        $this->assertDatabaseHas('financial_documents', ['id' => $invoiceId, 'status' => 'paid']);
        $this->assertDatabaseHas('financial_documents', ['id' => $otherInvoiceId, 'status' => 'issued']);
        $this->assertDatabaseMissing('cash_allocations', ['cash_movement_id' => $skippedId]);
    }

    public function test_apply_without_ids_covers_every_eligible_movement_of_the_requested_kind(): void
    {
        $this->signIn();
        $customerId = $this->party('customer', 'Bulk Customer');
        $supplierId = $this->party('supplier', 'Bulk Supplier');

        $saleId = $this->issuedInvoice('sale_invoice', $customerId, '100', '2026-02-01');
        $purchaseId = $this->issuedInvoice('purchase_invoice', $supplierId, '100', '2026-02-01');
        $this->postedMovement('incoming', 'customer_receipt', $customerId, '100', '2026-02-02');
        $this->postedMovement('outgoing', 'supplier_payment', $supplierId, '100', '2026-02-02');

        $this->postJson('/api/finance/auto-allocation/apply', ['kind' => 'sale'])
            ->assertOk()
            ->assertJsonPath('data.movements', 1);

        $this->assertDatabaseHas('financial_documents', ['id' => $saleId, 'status' => 'paid']);
        $this->assertDatabaseHas('financial_documents', ['id' => $purchaseId, 'status' => 'issued']);
        $this->getJson('/api/finance/auto-allocation')->assertOk()->assertJsonCount(1, 'data');
    }

    private function signIn(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Allocation workspace']);
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

    private function issuedInvoice(string $kind, int $partyId, string $amount, string $date): int
    {
        $id = (int) $this->postJson('/api/finance/documents', [
            'kind' => $kind,
            'party_id' => $partyId,
            'issue_date' => $date,
            'due_date' => $date,
            'currency' => 'ILS',
            'lines' => [[
                'description' => 'Allocation test line',
                'quantity' => '1',
                'unit' => 'service',
                'unit_price' => $amount,
                'discount_percent' => '0',
                'tax_rate' => '0',
                'affects_inventory' => false,
            ]],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/documents/{$id}/issue", ['acknowledge_warnings' => true])
            ->assertOk();

        return $id;
    }

    private function postedMovement(string $direction, string $category, int $partyId, string $amount, string $date): int
    {
        $id = (int) $this->postJson('/api/finance/cash-movements', [
            'direction' => $direction,
            'party_id' => $partyId,
            'category' => $category,
            'amount' => $amount,
            'currency' => 'ILS',
            'movement_date' => $date,
            'method' => 'cash',
            'allocations' => [],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/cash-movements/{$id}/post", ['acknowledge_duplicate' => true])
            ->assertOk();

        return $id;
    }
}
