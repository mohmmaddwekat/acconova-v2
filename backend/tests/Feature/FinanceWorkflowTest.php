<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinanceWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_sales_invoice_warns_on_price_typo_and_correction_preserves_stock_history(): void
    {
        [$owner, $organization] = $this->workspace('owner', 'Finance sales');
        $this->actingInWorkspace($owner, $organization);

        $customerId = $this->party('customer', 'Retail Customer');
        $productId = $this->product('Tracked Item', '3.5000', '2.0000');
        $warehouseId = $this->warehouse('Main Warehouse');

        $this->patchJson("/api/inventory/products/{$productId}/settings", [
            'track_inventory' => true,
            'low_stock_threshold' => '1',
        ])->assertOk();

        $this->postJson("/api/inventory/products/{$productId}/opening-stock", [
            'warehouse_id' => $warehouseId,
            'quantity' => '10',
        ])->assertOk();

        $documentId = $this->postJson('/api/finance/documents', [
            ...$this->invoicePayload(
                'sale_invoice',
                $customerId,
                $warehouseId,
                $productId,
                '2',
                '35',
            ),
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->json('data.id');

        $this->postJson(
            "/api/finance/documents/{$documentId}/issue",
            ['acknowledge_warnings' => false],
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors('warnings');

        $this->postJson(
            "/api/finance/documents/{$documentId}/issue",
            ['acknowledge_warnings' => true],
        )
            ->assertOk()
            ->assertJsonPath('data.status', 'issued');

        $this->assertDatabaseHas('inventory_balances', [
            'product_id' => $productId,
            'warehouse_id' => $warehouseId,
            'on_hand' => '8.0000',
        ]);

        $correction = $this->postJson(
            "/api/finance/documents/{$documentId}/correct",
            ['reason' => 'Price was typed with an extra zero'],
        )
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->json('data');

        $correctionId = (int) $correction['id'];

        $this->patchJson(
            "/api/finance/documents/{$correctionId}",
            $this->invoicePayload(
                'sale_invoice',
                $customerId,
                $warehouseId,
                $productId,
                '2',
                '3.5',
            ),
        )
            ->assertOk()
            ->assertJsonPath('data.total', '7.0000');

        $this->postJson(
            "/api/finance/documents/{$correctionId}/issue",
            ['acknowledge_warnings' => false],
        )
            ->assertOk()
            ->assertJsonPath('data.status', 'issued')
            ->assertJsonPath('data.total', '7.0000');

        $this->assertDatabaseHas('financial_documents', [
            'id' => $documentId,
            'status' => 'superseded',
        ]);

        $this->assertDatabaseHas('inventory_balances', [
            'product_id' => $productId,
            'warehouse_id' => $warehouseId,
            'on_hand' => '8.0000',
        ]);

        $this->assertDatabaseHas('finance_audit_events', [
            'auditable_type' => 'FinancialDocument',
            'auditable_id' => $documentId,
            'action' => 'superseded',
        ]);
    }

    public function test_purchase_invoice_adds_stock_and_outgoing_expense_can_exist_without_inventory(): void
    {
        [$owner, $organization] = $this->workspace('owner', 'Finance purchase');
        $this->actingInWorkspace($owner, $organization);

        $supplierId = $this->party('supplier', 'Materials Supplier');
        $productId = $this->product('Raw Material', '4.0000', '2.0000');
        $warehouseId = $this->warehouse('Raw Warehouse');

        $this->patchJson("/api/inventory/products/{$productId}/settings", [
            'track_inventory' => true,
            'low_stock_threshold' => '1',
        ])->assertOk();

        $documentId = $this->postJson('/api/finance/documents', [
            ...$this->invoicePayload(
                'purchase_invoice',
                $supplierId,
                $warehouseId,
                $productId,
                '5',
                '2',
            ),
            'external_number' => 'SUP-991',
        ])
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            "/api/finance/documents/{$documentId}/issue",
            ['acknowledge_warnings' => false],
        )->assertOk();

        $this->assertDatabaseHas('inventory_balances', [
            'product_id' => $productId,
            'warehouse_id' => $warehouseId,
            'on_hand' => '5.0000',
        ]);

        $expenseId = $this->postJson('/api/finance/cash-movements', [
            'direction' => 'outgoing',
            'category' => 'maintenance',
            'amount' => '125.50',
            'currency' => 'ILS',
            'movement_date' => '2026-09-20',
            'method' => 'bank_transfer',
            'account_label' => 'Operating Bank',
            'reference' => 'MAINT-001',
            'notes' => 'Machine service not linked to inventory',
            'allocations' => [],
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->json('data.id');

        $this->postJson("/api/finance/cash-movements/{$expenseId}/post")
            ->assertOk()
            ->assertJsonPath('data.status', 'posted')
            ->assertJsonCount(0, 'data.allocations');

        $this->assertDatabaseHas('cash_movements', [
            'id' => $expenseId,
            'category' => 'maintenance',
            'status' => 'posted',
        ]);

        $this->assertDatabaseHas('inventory_balances', [
            'product_id' => $productId,
            'warehouse_id' => $warehouseId,
            'on_hand' => '5.0000',
        ]);
    }

    public function test_receipt_allocation_check_tracking_and_cash_correction_keep_audit_trail(): void
    {
        [$owner, $organization] = $this->workspace('owner', 'Finance receipts');
        $this->actingInWorkspace($owner, $organization);

        $customerId = $this->party('customer', 'Check Customer');

        $invoiceId = $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice',
            'party_id' => $customerId,
            'issue_date' => '2026-09-20',
            'due_date' => '2026-10-20',
            'activity_type' => 'services',
            'market_type' => 'local',
            'currency' => 'ILS',
            'exchange_rate' => '1',
            'shipping_total' => '0',
            'lines' => [[
                'description' => 'Consulting service',
                'quantity' => '1',
                'unit' => 'service',
                'unit_price' => '100',
                'discount_percent' => '0',
                'tax_rate' => '0',
                'affects_inventory' => false,
            ]],
        ])->assertCreated()->json('data.id');

        $this->postJson(
            "/api/finance/documents/{$invoiceId}/issue",
            ['acknowledge_warnings' => false],
        )->assertOk();

        $receiptId = $this->postJson('/api/finance/cash-movements', [
            'direction' => 'incoming',
            'party_id' => $customerId,
            'category' => 'customer_receipt',
            'amount' => '100',
            'currency' => 'ILS',
            'movement_date' => '2026-09-20',
            'method' => 'check',
            'account_label' => 'Checks in hand',
            'check_number' => 'CHK-500',
            'check_bank' => 'Local Bank',
            'check_due_date' => '2026-09-25',
            'check_status' => 'pending',
            'allocations' => [[
                'financial_document_id' => $invoiceId,
                'amount' => '100',
            ]],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/cash-movements/{$receiptId}/post")
            ->assertOk()
            ->assertJsonPath('data.status', 'posted');

        $this->assertDatabaseHas('financial_documents', [
            'id' => $invoiceId,
            'status' => 'paid',
            'balance_due' => '0.0000',
        ]);

        $this->patchJson(
            "/api/finance/cash-movements/{$receiptId}/check-status",
            ['status' => 'bounced'],
        )
            ->assertOk()
            ->assertJsonPath('data.check_status', 'bounced');

        $this->assertDatabaseHas('financial_documents', [
            'id' => $invoiceId,
            'status' => 'issued',
            'paid_total' => '0.0000',
            'balance_due' => '100.0000',
        ]);

        $replacementId = $this->postJson(
            "/api/finance/cash-movements/{$receiptId}/correct",
            ['reason' => 'Customer replaced bounced check with bank transfer'],
        )
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->json('data.id');

        $this->assertDatabaseHas('cash_movements', [
            'id' => $receiptId,
            'status' => 'reversed',
        ]);

        $this->assertDatabaseHas('financial_documents', [
            'id' => $invoiceId,
            'status' => 'issued',
            'paid_total' => '0.0000',
            'balance_due' => '100.0000',
        ]);

        $this->patchJson("/api/finance/cash-movements/{$replacementId}", [
            'direction' => 'incoming',
            'party_id' => $customerId,
            'category' => 'customer_receipt',
            'amount' => '100',
            'currency' => 'ILS',
            'movement_date' => '2026-09-21',
            'method' => 'bank_transfer',
            'account_label' => 'Main Bank',
            'reference' => 'TRF-REPLACEMENT',
            'allocations' => [[
                'financial_document_id' => $invoiceId,
                'amount' => '100',
            ]],
        ])->assertOk();

        $this->postJson("/api/finance/cash-movements/{$replacementId}/post")
            ->assertOk();

        $this->assertDatabaseHas('financial_documents', [
            'id' => $invoiceId,
            'status' => 'paid',
            'balance_due' => '0.0000',
        ]);

        $this->assertDatabaseHas('finance_audit_events', [
            'auditable_type' => 'CashMovement',
            'auditable_id' => $receiptId,
            'action' => 'correction_started',
        ]);
    }

    public function test_tax_rules_are_jurisdiction_scoped_and_government_payment_updates_obligation(): void
    {
        [$owner, $organization] = $this->workspace('owner', 'Finance tax');
        $this->actingInWorkspace($owner, $organization);

        $ruleId = $this->postJson('/api/finance/tax-rules', [
            'name' => 'California test sales tax',
            'code' => 'US-CA-TEST',
            'tax_type' => 'sales_tax',
            'country_code' => 'US',
            'region_code' => 'CA',
            'applies_to' => 'sales',
            'rate' => '7.25',
            'inclusive' => false,
            'recoverable' => false,
            'effective_from' => '2026-01-01',
            'effective_to' => null,
            'active' => true,
            'notes' => 'Workspace configured test rate',
        ])->assertCreated()->json('data.id');

        $obligationId = $this->postJson('/api/finance/government-obligations', [
            'tax_rule_id' => $ruleId,
            'authority_name' => 'State Tax Authority',
            'title' => 'September sales tax',
            'obligation_type' => 'sales_tax',
            'country_code' => 'US',
            'region_code' => 'CA',
            'period_start' => '2026-09-01',
            'period_end' => '2026-09-30',
            'due_date' => '2026-10-31',
            'amount' => '500',
            'currency' => 'USD',
        ])->assertCreated()->json('data.id');

        $paymentId = $this->postJson('/api/finance/cash-movements', [
            'direction' => 'outgoing',
            'government_obligation_id' => $obligationId,
            'category' => 'tax_payment',
            'amount' => '200',
            'currency' => 'USD',
            'movement_date' => '2026-10-15',
            'method' => 'bank_transfer',
            'account_label' => 'Tax Bank',
            'reference' => 'TAX-SEP',
            'allocations' => [],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/cash-movements/{$paymentId}/post")
            ->assertOk();

        $this->assertDatabaseHas('government_obligations', [
            'id' => $obligationId,
            'status' => 'partial',
            'paid_total' => '200.0000',
            'balance_due' => '300.0000',
        ]);

        $this->getJson('/api/finance/taxes')
            ->assertOk()
            ->assertJsonPath('rules.0.country_code', 'US')
            ->assertJsonPath('rules.0.region_code', 'CA');
    }

    public function test_employee_cannot_access_finance_and_accountant_cannot_run_sensitive_corrections(): void
    {
        [$owner, $organization] = $this->workspace('owner', 'Finance permissions');
        $employee = User::factory()->create();
        $accountant = User::factory()->create();

        $organization->users()->attach($employee->id, ['role' => 'employee']);
        $organization->users()->attach($accountant->id, ['role' => 'accountant']);

        $this->actingInWorkspace($owner, $organization);
        $customerId = $this->party('customer', 'Permission Customer');

        $invoiceId = $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice',
            'party_id' => $customerId,
            'issue_date' => '2026-09-20',
            'currency' => 'ILS',
            'lines' => [[
                'description' => 'Service',
                'quantity' => '1',
                'unit_price' => '10',
                'affects_inventory' => false,
            ]],
        ])->assertCreated()->json('data.id');

        $this->postJson(
            "/api/finance/documents/{$invoiceId}/issue",
            ['acknowledge_warnings' => false],
        )->assertOk();

        $this->actingInWorkspace($employee, $organization);
        $this->getJson('/api/finance/lookups')->assertForbidden();
        $this->getJson('/api/finance/documents?kind=sale_invoice')->assertForbidden();
        $this->postJson('/api/finance/cash-movements', [])->assertForbidden();

        $this->actingInWorkspace($accountant, $organization);
        $this->getJson('/api/finance/documents?kind=sale_invoice')->assertOk();
        $this->postJson(
            "/api/finance/documents/{$invoiceId}/correct",
            ['reason' => 'Sensitive correction attempt'],
        )->assertForbidden();
        $this->postJson('/api/finance/tax-rules', [])->assertForbidden();
    }

    /** @return array{0: User, 1: Organization} */
    private function workspace(string $role, string $name): array
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => $name]);
        $organization->users()->attach($user->id, ['role' => $role]);

        return [$user, $organization];
    }

    private function actingInWorkspace(User $user, Organization $organization): void
    {
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

    private function product(string $name, string $unitPrice, string $costPrice): int
    {
        return (int) $this->postJson('/api/products', [
            'type' => 'product',
            'name' => $name,
            'sku' => null,
            'unit' => 'unit',
            'unit_price' => $unitPrice,
            'cost_price' => $costPrice,
            'tax_rate' => '0',
        ])->assertCreated()->json('data.id');
    }

    private function warehouse(string $name): int
    {
        return (int) $this->postJson('/api/warehouses', [
            'name' => $name,
        ])->assertCreated()->json('data.id');
    }

    /** @return array<string, mixed> */
    private function invoicePayload(
        string $kind,
        int $partyId,
        int $warehouseId,
        int $productId,
        string $quantity,
        string $unitPrice,
    ): array {
        return [
            'kind' => $kind,
            'party_id' => $partyId,
            'warehouse_id' => $warehouseId,
            'issue_date' => '2026-09-20',
            'due_date' => '2026-10-20',
            'activity_type' => 'trade',
            'market_type' => 'local',
            'currency' => 'ILS',
            'exchange_rate' => '1',
            'shipping_total' => '0',
            'lines' => [[
                'product_id' => $productId,
                'warehouse_id' => $warehouseId,
                'description' => 'Finance item',
                'quantity' => $quantity,
                'unit' => 'unit',
                'unit_price' => $unitPrice,
                'discount_percent' => '0',
                'tax_rate' => '0',
                'affects_inventory' => true,
            ]],
        ];
    }
}
