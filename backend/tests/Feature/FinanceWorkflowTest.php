<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
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
            'check_status' => 'cleared',
            'allocations' => [[
                'financial_document_id' => $invoiceId,
                'amount' => '100',
            ]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.check_status', 'pending')
            ->json('data.id');

        $this->patchJson(
            "/api/finance/cash-movements/{$receiptId}/check-status",
            ['status' => 'cleared'],
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');

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
            'status' => 'posted',
        ]);

        $this->assertDatabaseMissing('cash_movements', [
            'reversal_of_id' => $receiptId,
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
            ->assertOk()
            ->assertJsonPath('data.status', 'posted');

        $this->assertDatabaseHas('cash_movements', [
            'id' => $receiptId,
            'status' => 'reversed',
        ]);

        $this->assertDatabaseHas('cash_movements', [
            'reversal_of_id' => $receiptId,
            'status' => 'posted',
            'category' => 'correction',
        ]);

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

        $this->assertDatabaseHas('finance_audit_events', [
            'auditable_type' => 'CashMovement',
            'auditable_id' => $receiptId,
            'action' => 'correction_superseded',
        ]);
    }

    public function test_customer_overpayment_stays_as_advance_credit_and_can_pay_a_future_invoice(): void
    {
        [$owner, $organization] = $this->workspace('owner', 'Finance advances');
        $this->actingInWorkspace($owner, $organization);

        $customerId = $this->party('customer', 'Advance Customer');

        $firstInvoiceId = $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice',
            'party_id' => $customerId,
            'issue_date' => '2026-09-20',
            'currency' => 'USD',
            'lines' => [[
                'description' => 'First order',
                'quantity' => '1',
                'unit_price' => '4000',
                'discount_percent' => '0',
                'tax_rate' => '0',
                'affects_inventory' => false,
            ]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.currency', 'ILS')
            ->json('data.id');

        $this->postJson(
            "/api/finance/documents/{$firstInvoiceId}/issue",
            ['acknowledge_warnings' => false],
        )->assertOk();

        $receiptId = $this->postJson('/api/finance/cash-movements', [
            'direction' => 'incoming',
            'party_id' => $customerId,
            'category' => 'customer_receipt',
            'amount' => '6000',
            'currency' => 'USD',
            'movement_date' => '2026-09-20',
            'method' => 'bank_transfer',
            'allocations' => [[
                'financial_document_id' => $firstInvoiceId,
                'amount' => '4000',
            ]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.currency', 'ILS')
            ->json('data.id');

        $this->postJson("/api/finance/cash-movements/{$receiptId}/post")
            ->assertOk();

        $this->assertDatabaseHas('financial_documents', [
            'id' => $firstInvoiceId,
            'status' => 'paid',
            'balance_due' => '0.0000',
        ]);

        $secondInvoiceId = $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice',
            'party_id' => $customerId,
            'issue_date' => '2026-09-21',
            'currency' => 'ILS',
            'lines' => [[
                'description' => 'Future goods',
                'quantity' => '1',
                'unit_price' => '1500',
                'discount_percent' => '0',
                'tax_rate' => '0',
                'affects_inventory' => false,
            ]],
        ])->assertCreated()->json('data.id');

        $this->postJson(
            "/api/finance/documents/{$secondInvoiceId}/issue",
            ['acknowledge_warnings' => false],
        )->assertOk();

        $this->getJson("/api/finance/documents/{$secondInvoiceId}/available-credits")
            ->assertOk()
            ->assertJsonPath('data.0.id', $receiptId)
            ->assertJsonPath('data.0.available', '2000.0000');

        $this->postJson("/api/finance/documents/{$secondInvoiceId}/apply-credit", [
            'movement_id' => $receiptId,
            'amount' => '1500',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.balance_due', '0.0000');

        $thirdInvoiceId = $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice',
            'party_id' => $customerId,
            'issue_date' => '2026-09-22',
            'currency' => 'ILS',
            'lines' => [[
                'description' => 'Third order',
                'quantity' => '1',
                'unit_price' => '1000',
                'discount_percent' => '0',
                'tax_rate' => '0',
                'affects_inventory' => false,
            ]],
        ])->assertCreated()->json('data.id');

        $this->postJson(
            "/api/finance/documents/{$thirdInvoiceId}/issue",
            ['acknowledge_warnings' => false],
        )->assertOk();

        $this->getJson("/api/finance/documents/{$thirdInvoiceId}/available-credits")
            ->assertOk()
            ->assertJsonPath('data.0.id', $receiptId)
            ->assertJsonPath('data.0.available', '500.0000');

        $this->assertDatabaseHas('finance_audit_events', [
            'auditable_type' => 'CashMovement',
            'auditable_id' => $receiptId,
            'action' => 'advance_credit_applied',
        ]);
    }

    public function test_dual_role_party_provisional_purchase_price_and_duplicate_line_guards(): void
    {
        [$owner, $organization] = $this->workspace('owner', 'Finance safeguards');
        $this->actingInWorkspace($owner, $organization);

        $partyId = (int) $this->postJson('/api/parties', [
            'type' => 'company',
            'company_name' => 'Dual Role Trading',
            'roles' => ['customer', 'supplier'],
        ])->assertCreated()->json('data.id');

        $saleId = $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice',
            'party_id' => $partyId,
            'issue_date' => '2026-09-20',
            'currency' => 'USD',
            'lines' => [[
                'description' => 'Sale service',
                'quantity' => '1',
                'unit_price' => '25',
                'discount_percent' => '10',
                'tax_rate' => '0',
                'affects_inventory' => false,
            ]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.currency', 'ILS')
            ->json('data.id');

        $this->assertNotEmpty($saleId);

        $purchaseId = $this->postJson('/api/finance/documents', [
            'kind' => 'purchase_invoice',
            'party_id' => $partyId,
            'issue_date' => '2026-09-20',
            'currency' => 'USD',
            'lines' => [[
                'description' => 'Unknown supplier price',
                'quantity' => '2',
                'unit_price' => '10',
                'price_status' => 'estimated',
                'discount_percent' => '5',
                'tax_rate' => '0',
                'affects_inventory' => false,
            ]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.currency', 'ILS')
            ->assertJsonPath('data.lines.0.price_status', 'estimated')
            ->json('data.id');

        $this->postJson(
            "/api/finance/documents/{$purchaseId}/issue",
            ['acknowledge_warnings' => false],
        )->assertOk();

        $correction = $this->postJson(
            "/api/finance/documents/{$purchaseId}/correct",
            ['reason' => 'Supplier confirmed the final price'],
        )
            ->assertCreated()
            ->assertJsonPath('data.lines.0.price_status', 'estimated')
            ->json('data');

        $correctionId = (int) $correction['id'];

        $this->patchJson("/api/finance/documents/{$correctionId}", [
            'kind' => 'purchase_invoice',
            'party_id' => $partyId,
            'issue_date' => '2026-09-21',
            'currency' => 'USD',
            'lines' => [[
                'description' => 'Unknown supplier price',
                'quantity' => '2',
                'unit_price' => '8.5',
                'price_status' => 'final',
                'discount_percent' => '5',
                'tax_rate' => '0',
                'affects_inventory' => false,
            ]],
        ])
            ->assertOk()
            ->assertJsonPath('data.currency', 'ILS')
            ->assertJsonPath('data.lines.0.price_status', 'final');

        $this->postJson(
            "/api/finance/documents/{$correctionId}/issue",
            ['acknowledge_warnings' => false],
        )
            ->assertOk()
            ->assertJsonPath('data.lines.0.price_status', 'final');

        $productId = $this->product('No Duplicate Product', '12.0000', '8.0000');

        $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice',
            'party_id' => $partyId,
            'issue_date' => '2026-09-20',
            'currency' => 'ILS',
            'lines' => [
                [
                    'product_id' => $productId,
                    'description' => 'Same item',
                    'quantity' => '1',
                    'unit_price' => '12',
                    'affects_inventory' => false,
                ],
                [
                    'product_id' => $productId,
                    'description' => 'Same item again',
                    'quantity' => '1',
                    'unit_price' => '12',
                    'affects_inventory' => false,
                ],
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('lines');

        $this->postJson('/api/finance/cash-movements', [
            'direction' => 'outgoing',
            'category' => 'payroll',
            'amount' => '100',
            'currency' => 'ILS',
            'movement_date' => '2026-09-20',
            'method' => 'cash',
            'allocations' => [],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('category');
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

    public function test_legacy_finance_csv_import_creates_historical_invoice(): void
    {
        [$owner, $organization] = $this->workspace('owner', 'Finance import');
        $this->actingInWorkspace($owner, $organization);

        $customerId = $this->party('customer', 'Legacy Customer');
        $productId = $this->product('Legacy Catalog Item', '100.0000', '70.0000');

        $csv = implode("\n", [
            'document_key,external_number,party_name,issue_date,due_date,product_name,line_description,unit,quantity,unit_price,discount_percent,tax_rate,shipping_total,notes',
            'LEG-1,SAL-LEG-1,Legacy Customer,2025-01-10,2025-02-10,Legacy Catalog Item,Old service,unit,2,125,10,0,0,Imported legacy invoice',
        ]);

        $file = UploadedFile::fake()->createWithContent('legacy-sales.csv', $csv);

        $this->post('/api/finance-import/commit', [
            'type' => 'sales_invoices',
            'file' => $file,
        ])
            ->assertOk()
            ->assertJsonPath('created', 1)
            ->assertJsonPath('skipped', 0);

        $this->assertDatabaseHas('financial_documents', [
            'kind' => 'sale_invoice',
            'external_number' => 'SAL-LEG-1',
            'status' => 'issued',
            'currency' => 'ILS',
            'total' => '225.0000',
        ]);

        $this->assertDatabaseHas('parties', [
            'company_name' => 'Legacy Customer',
        ]);

        $this->assertDatabaseHas('financial_document_lines', [
            'product_id' => $productId,
            'unit_price' => '125.0000',
            'affects_inventory' => false,
        ]);

        $this->getJson(
            '/api/finance/reference-price?party_id='
            .$customerId
            .'&product_id='
            .$productId
            .'&kind=sale_invoice',
        )
            ->assertOk()
            ->assertJsonPath('source', 'party_history')
            ->assertJsonPath('unit_price', '125.0000')
            ->assertJsonPath('document_number', 'SAL-000001');
    }

    public function test_invoice_line_supports_fixed_amount_discount(): void
    {
        [$owner, $organization] = $this->workspace('owner', 'Finance fixed discount');
        $this->actingInWorkspace($owner, $organization);

        $customerId = $this->party('customer', 'Fixed Discount Customer');

        $response = $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice',
            'party_id' => $customerId,
            'issue_date' => '2026-09-20',
            'currency' => 'ILS',
            'lines' => [[
                'description' => 'Discounted service',
                'quantity' => '2',
                'unit_price' => '100',
                'discount_type' => 'fixed',
                'discount_value' => '30',
                'discount_percent' => '0',
                'tax_rate' => '0',
                'affects_inventory' => false,
            ]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.subtotal', '200.0000')
            ->assertJsonPath('data.discount_total', '30.0000')
            ->assertJsonPath('data.total', '170.0000')
            ->assertJsonPath('data.lines.0.discount_type', 'fixed')
            ->assertJsonPath('data.lines.0.discount_value', '30.0000')
            ->assertJsonPath('data.lines.0.discount_percent', '0.0000');

        $documentId = (int) $response->json('data.id');

        $this->assertDatabaseHas('financial_document_lines', [
            'financial_document_id' => $documentId,
            'discount_type' => 'fixed',
            'discount_value' => '30.0000',
            'line_discount' => '30.0000',
            'line_total' => '170.0000',
        ]);
    }

    public function test_draft_invoice_can_be_deleted_but_issued_invoice_requires_void_or_correction(): void
    {
        [$owner, $organization] = $this->workspace('owner', 'Finance delete safety');
        $this->actingInWorkspace($owner, $organization);

        $customerId = $this->party('customer', 'Delete Safety Customer');

        $draftId = $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice',
            'party_id' => $customerId,
            'issue_date' => '2026-09-20',
            'currency' => 'ILS',
            'lines' => [[
                'description' => 'Draft line',
                'quantity' => '1',
                'unit_price' => '10',
                'affects_inventory' => false,
            ]],
        ])->assertCreated()->json('data.id');

        $this->deleteJson("/api/finance/documents/{$draftId}")
            ->assertNoContent();

        $this->assertDatabaseMissing('financial_documents', [
            'id' => $draftId,
        ]);

        $issuedId = $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice',
            'party_id' => $customerId,
            'issue_date' => '2026-09-20',
            'currency' => 'ILS',
            'lines' => [[
                'description' => 'Issued line',
                'quantity' => '1',
                'unit_price' => '10',
                'affects_inventory' => false,
            ]],
        ])->assertCreated()->json('data.id');

        $this->postJson(
            "/api/finance/documents/{$issuedId}/issue",
            ['acknowledge_warnings' => false],
        )->assertOk();

        $this->deleteJson("/api/finance/documents/{$issuedId}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');

        $this->assertDatabaseHas('financial_documents', [
            'id' => $issuedId,
            'status' => 'issued',
        ]);
    }

    public function test_workspace_finance_settings_are_persisted_enforced_and_hidden_from_regular_users(): void
    {
        [$owner, $organization] = $this->workspace('owner', 'Settings workspace');

        $this->actingInWorkspace($owner, $organization);

        $this->patchJson('/api/workspace-settings', [
            'name' => 'Updated Workspace',
            'currency' => 'JOD',
            'decimal_places' => 6,
            'payment_methods' => ['cash'],
            'validate_check_date' => true,
            'bank_accounts' => [[
                'id' => 'bank-1',
                'bank_name' => 'Test Bank',
                'account_name' => 'Main',
                'iban' => 'PS001234',
                'account_number' => null,
                'is_primary' => true,
            ]],
            'invoice_prefix' => 'SALE',
            'purchase_prefix' => 'BUY',
            'receipt_prefix' => 'IN',
            'payment_prefix' => 'OUT',
            'invoice_start_number' => 25,
            'purchase_start_number' => 40,
            'invoice_template' => 'modern',
            'print_paper_size' => 'a4',
            'print_margins' => 'compact',
            'logo_position' => 'center',
            'show_invoice_logo' => true,
            'show_invoice_contact' => true,
            'show_invoice_tax_number' => true,
            'show_invoice_notes' => true,
            'show_invoice_qr' => false,
            'invoice_columns' => ['description', 'quantity', 'unit_price', 'total'],
        ])
            ->assertOk()
            ->assertJsonPath('name', 'Updated Workspace')
            ->assertJsonPath('currency', 'JOD')
            ->assertJsonPath('decimal_places', 6)
            ->assertJsonPath('payment_methods.0', 'cash')
            ->assertJsonPath('bank_accounts.0.bank_name', 'Test Bank');

        $this->getJson('/api/finance/lookups')
            ->assertOk()
            ->assertJsonPath('currency', 'JOD')
            ->assertJsonPath('settings.decimal_places', 6)
            ->assertJsonPath('settings.payment_methods.0', 'cash')
            ->assertJsonPath('settings.bank_accounts.0.bank_name', 'Test Bank')
            ->assertJsonPath('settings.invoice.template', 'modern')
            ->assertJsonPath('settings.invoice.margins', 'compact');

        $this->postJson('/api/finance/cash-movements', [
            'direction' => 'incoming',
            'category' => 'other_income',
            'amount' => '10',
            'currency' => 'JOD',
            'movement_date' => '2026-09-20',
            'method' => 'bank_transfer',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('method');

        $this->postJson('/api/finance/cash-movements', [
            'direction' => 'incoming',
            'category' => 'other_income',
            'amount' => '10',
            'currency' => 'JOD',
            'movement_date' => '2026-09-20',
            'method' => 'cash',
        ])
            ->assertCreated()
            ->assertJsonPath('data.number', 'IN-2026-0001');

        $customerId = $this->party('customer', 'Settings Customer');

        $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice',
            'party_id' => $customerId,
            'issue_date' => '2026-09-20',
            'currency' => 'JOD',
            'lines' => [[
                'description' => 'Configured numbering',
                'quantity' => '1',
                'unit_price' => '10',
                'affects_inventory' => false,
            ]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.number', 'SALE-2026-0025');

        $employee = User::factory()->create();
        $organization->users()->attach($employee->id, ['role' => 'employee']);

        $this->actingInWorkspace($employee, $organization);
        $this->get('/app/settings')->assertForbidden();
        $this->getJson('/api/workspace-settings')->assertForbidden();
        $this->patchJson('/api/workspace-settings', ['currency' => 'USD'])->assertForbidden();
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
