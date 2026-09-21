<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CommercialOperationsFeatureTest extends TestCase
{
    use RefreshDatabase;

    public function test_unallocated_collections_and_aging_reports_use_live_finance_data(): void
    {
        [$owner, $organization] = $this->workspace(
            'Collections workspace',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $customerId = $this->party(
            'customer',
            'Aging Customer',
        );
        $supplierId = $this->party(
            'supplier',
            'Aging Supplier',
        );

        $saleId = $this->invoice(
            'sale_invoice',
            $customerId,
            '100.0000',
            today()->subDays(45)->toDateString(),
        );
        $purchaseId = $this->invoice(
            'purchase_invoice',
            $supplierId,
            '200.0000',
            today()->subDays(75)->toDateString(),
        );

        $this->issue($saleId);
        $this->issue($purchaseId);

        $receiptId = (int) $this->postJson(
            '/api/finance/cash-movements',
            [
                'direction' => 'incoming',
                'party_id' => $customerId,
                'category' => 'customer_receipt',
                'amount' => '150.0000',
                'currency' => 'ILS',
                'movement_date' => today()->toDateString(),
                'method' => 'cash',
                'allocations' => [],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            "/api/finance/cash-movements/{$receiptId}/post",
            [
                'acknowledge_duplicate' => true,
            ],
        )->assertOk();

        $unallocated = $this->getJson(
            '/api/operations/unallocated',
        )
            ->assertOk()
            ->json('data');

        $receipt = collect($unallocated)
            ->firstWhere('id', $receiptId);

        $this->assertNotNull($receipt);
        $this->assertSame(
            '150.0000',
            $receipt['unallocated'],
        );

        $allocationDraftId = (int) $this->postJson(
            "/api/operations/unallocated/{$receiptId}/prepare-allocation",
        )
            ->assertCreated()
            ->json('data.id');

        $this->assertDatabaseHas(
            'cash_movements',
            [
                'id' => $allocationDraftId,
                'status' => 'draft',
                'corrected_from_id' => $receiptId,
            ],
        );

        $this->assertDatabaseHas(
            'cash_movements',
            [
                'id' => $receiptId,
                'status' => 'posted',
            ],
        );

        $collections = $this->getJson(
            '/api/operations/collections',
        )
            ->assertOk()
            ->json('data');

        $customer = collect($collections)
            ->firstWhere(
                'party_id',
                $customerId,
            );

        $this->assertNotNull($customer);
        $this->assertTrue(
            $customer['contact_today'],
        );
        $this->assertSame(
            '100.0000',
            $customer['outstanding'],
        );

        $receivables = $this->getJson(
            '/api/operations/ar-aging',
        )
            ->assertOk()
            ->json('data');

        $receivable = collect($receivables)
            ->firstWhere(
                'party_id',
                $customerId,
            );

        $this->assertNotNull($receivable);
        $this->assertSame(
            '100.0000',
            $receivable['31_60'],
        );

        $payables = $this->getJson(
            '/api/operations/ap-aging',
        )
            ->assertOk()
            ->json('data');

        $payable = collect($payables)
            ->firstWhere(
                'party_id',
                $supplierId,
            );

        $this->assertNotNull($payable);
        $this->assertSame(
            '200.0000',
            $payable['61_90'],
        );
    }

    public function test_payment_promises_and_sales_pipeline_track_customer_follow_up(): void
    {
        [$owner, $organization] = $this->workspace(
            'CRM workspace',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $customerId = $this->party(
            'customer',
            'Promise Customer',
        );

        $saleId = $this->invoice(
            'sale_invoice',
            $customerId,
            '300.0000',
            today()->addDays(15)->toDateString(),
        );
        $this->issue($saleId);

        $promiseId = (int) $this->postJson(
            '/api/operations/promises',
            [
                'party_id' => $customerId,
                'financial_document_id' => $saleId,
                'amount' => '125.0000',
                'promised_on' => today()->addDays(2)->toDateString(),
                'note' => 'Customer confirmed Thursday payment.',
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->getJson(
            '/api/operations/promises?party_id='.$customerId,
        )
            ->assertOk()
            ->assertJsonPath(
                'data.0.id',
                $promiseId,
            )
            ->assertJsonPath(
                'data.0.status',
                'open',
            );

        $receiptId = (int) $this->postJson(
            '/api/finance/cash-movements',
            [
                'direction' => 'incoming',
                'party_id' => $customerId,
                'category' => 'customer_receipt',
                'amount' => '125.0000',
                'currency' => 'ILS',
                'movement_date' => today()->toDateString(),
                'method' => 'cash',
                'allocations' => [
                    [
                        'financial_document_id' => $saleId,
                        'amount' => '125.0000',
                    ],
                ],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            "/api/finance/cash-movements/{$receiptId}/post",
            [
                'acknowledge_duplicate' => true,
            ],
        )->assertOk();

        $this->getJson(
            '/api/operations/promises?party_id='.$customerId,
        )
            ->assertOk()
            ->assertJsonPath(
                'data.0.id',
                $promiseId,
            )
            ->assertJsonPath(
                'data.0.status',
                'fulfilled',
            );

        $this->getJson(
            "/api/finance/documents/{$saleId}",
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'partially_paid',
            )
            ->assertJsonPath(
                'data.balance_due',
                '175.0000',
            );

        $opportunityId = (int) $this->postJson(
            '/api/operations/pipeline',
            [
                'party_id' => $customerId,
                'title' => 'Annual supply deal',
                'expected_value' => '12000.0000',
                'expected_close_on' => today()->addDays(20)->toDateString(),
                'next_action_on' => today()->addDay()->toDateString(),
            ],
        )
            ->assertCreated()
            ->assertJsonPath(
                'data.stage',
                'prospect',
            )
            ->json('data.id');

        $this->patchJson(
            "/api/operations/pipeline/{$opportunityId}",
            [
                'stage' => 'contacted',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.stage',
                'contacted',
            );
    }

    public function test_quotation_and_proforma_convert_into_non_issued_sales_invoice_drafts(): void
    {
        [$owner, $organization] = $this->workspace(
            'Sales documents workspace',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $customerId = $this->party(
            'customer',
            'Quote Customer',
        );

        foreach (
            [
                'quotations',
                'proformas',
            ] as $feature
        ) {
            $documentId = (int) $this->postJson(
                '/api/operations/'.$feature,
                [
                    'party_id' => $customerId,
                    'issue_date' => today()->toDateString(),
                    'valid_until' => today()->addDays(14)->toDateString(),
                    'lines' => [
                        [
                            'description' => 'Implementation',
                            'quantity' => '1',
                            'unit_price' => '700.0000',
                            'affects_inventory' => false,
                        ],
                        [
                            'description' => 'Support',
                            'quantity' => '2',
                            'unit_price' => '100.0000',
                            'affects_inventory' => false,
                        ],
                    ],
                ],
            )
                ->assertCreated()
                ->json('data.id');

            $conversion = $this->postJson(
                "/api/operations/{$feature}/{$documentId}/convert",
            )
                ->assertCreated()
                ->assertJsonPath(
                    'data.kind',
                    'sale_invoice',
                );

            $invoiceId = (int) $conversion->json(
                'data.financial_document_id',
            );

            $this->getJson(
                "/api/finance/documents/{$invoiceId}",
            )
                ->assertOk()
                ->assertJsonPath(
                    'data.status',
                    'draft',
                )
                ->assertJsonPath(
                    'data.total',
                    '900.0000',
                );

            $this->assertDatabaseHas(
                'trade_documents',
                [
                    'id' => $documentId,
                    'status' => 'converted',
                    'converted_financial_document_id' => $invoiceId,
                ],
            );
        }
    }

    public function test_sales_and_purchase_orders_support_partial_fulfillment_invoicing_and_backorders(): void
    {
        [$owner, $organization] = $this->workspace(
            'Order workspace',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $customerId = $this->party(
            'customer',
            'Order Customer',
        );
        $supplierId = $this->party(
            'supplier',
            'Order Supplier',
        );

        $salesOrderId = (int) $this->postJson(
            '/api/operations/sales-orders',
            [
                'party_id' => $customerId,
                'expected_on' => today()->addDays(3)->toDateString(),
                'lines' => [
                    [
                        'description' => 'Bulk units',
                        'quantity' => '100',
                        'unit_price' => '10',
                        'affects_inventory' => false,
                    ],
                ],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $salesOrder = collect(
            $this->getJson(
                '/api/operations/sales-orders',
            )
                ->assertOk()
                ->json('data'),
        )->firstWhere(
            'id',
            $salesOrderId,
        );

        $this->assertNotNull($salesOrder);

        $this->patchJson(
            "/api/operations/sales-orders/{$salesOrderId}",
            [
                'line_id' => $salesOrder['first_line_id'],
                'fulfilled_quantity' => '60',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'partial',
            );

        $backorder = collect(
            $this->getJson(
                '/api/operations/backorders',
            )
                ->assertOk()
                ->json('data'),
        )->firstWhere(
            'order_id',
            $salesOrderId,
        );

        $this->assertNotNull($backorder);
        $this->assertSame(
            '40.0000',
            $backorder['backorder'],
        );

        $salesConversion = $this->postJson(
            "/api/operations/sales-orders/{$salesOrderId}/convert",
        )
            ->assertCreated();

        $salesInvoiceId = (int) $salesConversion->json(
            'data.financial_document_id',
        );

        $this->getJson(
            "/api/finance/documents/{$salesInvoiceId}",
        )
            ->assertOk()
            ->assertJsonPath(
                'data.lines.0.quantity',
                '60.0000',
            );

        $this->assertDatabaseHas(
            'trade_documents',
            [
                'id' => $salesOrderId,
                'status' => 'partial_invoiced',
            ],
        );

        $this->assertNotNull(
            collect(
                $this->getJson(
                    '/api/operations/backorders',
                )
                    ->assertOk()
                    ->json('data'),
            )->firstWhere(
                'order_id',
                $salesOrderId,
            ),
        );

        $this->patchJson(
            "/api/operations/sales-orders/{$salesOrderId}",
            [
                'line_id' => $salesOrder['first_line_id'],
                'fulfilled_quantity' => '100',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'fulfilled',
            );

        $secondSalesConversion = $this->postJson(
            "/api/operations/sales-orders/{$salesOrderId}/convert",
        )
            ->assertCreated();

        $secondSalesInvoiceId = (int) $secondSalesConversion->json(
            'data.financial_document_id',
        );

        $this->getJson(
            "/api/finance/documents/{$secondSalesInvoiceId}",
        )
            ->assertOk()
            ->assertJsonPath(
                'data.lines.0.quantity',
                '40.0000',
            );

        $this->assertDatabaseHas(
            'trade_documents',
            [
                'id' => $salesOrderId,
                'status' => 'invoiced',
            ],
        );

        $this->assertSame(
            2,
            IlluminateSupportFacadesDB::table(
                'trade_document_conversions',
            )
                ->where(
                    'trade_document_id',
                    $salesOrderId,
                )
                ->count(),
        );

        $this->assertNull(
            collect(
                $this->getJson(
                    '/api/operations/backorders',
                )
                    ->assertOk()
                    ->json('data'),
            )->firstWhere(
                'order_id',
                $salesOrderId,
            ),
        );

        $purchaseOrderId = (int) $this->postJson(
            '/api/operations/purchase-orders',
            [
                'party_id' => $supplierId,
                'expected_on' => today()->addDays(5)->toDateString(),
                'lines' => [
                    [
                        'description' => 'Supplier batch',
                        'quantity' => '50',
                        'unit_price' => '8',
                        'affects_inventory' => false,
                    ],
                ],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $purchaseOrder = collect(
            $this->getJson(
                '/api/operations/purchase-orders',
            )
                ->assertOk()
                ->json('data'),
        )->firstWhere(
            'id',
            $purchaseOrderId,
        );

        $this->patchJson(
            "/api/operations/purchase-orders/{$purchaseOrderId}",
            [
                'line_id' => $purchaseOrder['first_line_id'],
                'fulfilled_quantity' => '20',
            ],
        )->assertOk();

        $purchaseConversion = $this->postJson(
            "/api/operations/purchase-orders/{$purchaseOrderId}/convert",
        )
            ->assertCreated()
            ->assertJsonPath(
                'data.kind',
                'purchase_invoice',
            );

        $purchaseInvoiceId = (int) $purchaseConversion->json(
            'data.financial_document_id',
        );

        $this->getJson(
            "/api/finance/documents/{$purchaseInvoiceId}",
        )
            ->assertOk()
            ->assertJsonPath(
                'data.lines.0.quantity',
                '20.0000',
            );
    }

    public function test_multi_line_sales_order_tracks_fulfillment_per_line(): void
    {
        [$owner, $organization] = $this->workspace(
            'Multi line order workspace',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $customerId = $this->party(
            'customer',
            'Multi Line Customer',
        );

        $orderId = (int) $this->postJson(
            '/api/operations/sales-orders',
            [
                'party_id' => $customerId,
                'lines' => [
                    [
                        'description' => 'First line',
                        'quantity' => '10',
                        'unit_price' => '5',
                        'affects_inventory' => false,
                    ],
                    [
                        'description' => 'Second line',
                        'quantity' => '20',
                        'unit_price' => '3',
                        'affects_inventory' => false,
                    ],
                ],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $order = collect(
            $this->getJson(
                '/api/operations/sales-orders',
            )
                ->assertOk()
                ->json('data'),
        )->firstWhere(
            'id',
            $orderId,
        );

        $this->assertNotNull($order);
        $this->assertCount(
            2,
            $order['lines'],
        );

        $secondLineId =
            (int) $order['lines'][1]['id'];

        $this->patchJson(
            "/api/operations/sales-orders/{$orderId}",
            [
                'line_id' => $secondLineId,
                'fulfilled_quantity' => '7',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'partial',
            );

        $updatedOrder = collect(
            $this->getJson(
                '/api/operations/sales-orders',
            )
                ->assertOk()
                ->json('data'),
        )->firstWhere(
            'id',
            $orderId,
        );

        $updatedSecondLine = collect(
            $updatedOrder['lines'],
        )->firstWhere(
            'id',
            $secondLineId,
        );

        $this->assertNotNull(
            $updatedSecondLine,
        );
        $this->assertSame(
            '7.0000',
            $updatedSecondLine[
                'fulfilled_quantity'
            ],
        );
        $this->assertSame(
            '13.0000',
            $updatedSecondLine[
                'remaining_quantity'
            ],
        );
    }

    public function test_returns_warranties_serials_and_batches_are_tenant_scoped_and_traceable(): void
    {
        [$owner, $organization] = $this->workspace(
            'Traceability workspace',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $customerId = $this->party(
            'customer',
            'Trace Customer',
        );
        $supplierId = $this->party(
            'supplier',
            'Trace Supplier',
        );
        $productId = $this->product(
            'Traceable Product',
        );

        $saleId = $this->invoice(
            'sale_invoice',
            $customerId,
            '80.0000',
            today()->addDays(10)->toDateString(),
        );
        $purchaseId = $this->invoice(
            'purchase_invoice',
            $supplierId,
            '50.0000',
            today()->addDays(10)->toDateString(),
        );

        $this->issue($saleId);
        $this->issue($purchaseId);

        $returnId = (int) $this->postJson(
            '/api/operations/returns',
            [
                'financial_document_id' => $saleId,
                'reason' => 'Damaged on arrival',
                'total_quantity' => '1',
                'notes' => 'RMA requested by customer.',
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->patchJson(
            "/api/operations/returns/{$returnId}",
            [
                'status' => 'approved',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'approved',
            );

        $this->patchJson(
            "/api/operations/returns/{$returnId}",
            [
                'status' => 'completed',
            ],
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');

        $this->patchJson(
            "/api/operations/returns/{$returnId}",
            [
                'status' => 'received',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'received',
            );

        $this->patchJson(
            "/api/operations/returns/{$returnId}",
            [
                'status' => 'completed',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'completed',
            );

        $warrantyId = (int) $this->postJson(
            '/api/operations/warranties',
            [
                'party_id' => $customerId,
                'product_id' => $productId,
                'financial_document_id' => $saleId,
                'serial_number' => 'SN-WARRANTY-001',
                'starts_on' => today()->toDateString(),
                'ends_on' => today()->addYear()->toDateString(),
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $claimId = (int) $this->postJson(
            "/api/operations/warranties/{$warrantyId}/claims",
            [
                'reason' => 'Device does not power on',
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->patchJson(
            "/api/operations/warranties/{$warrantyId}/claims/{$claimId}",
            [
                'status' => 'in_progress',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'in_progress',
            );

        $this->patchJson(
            "/api/operations/warranties/{$warrantyId}/claims/{$claimId}",
            [
                'status' => 'resolved',
                'resolution' => 'Replaced the defective unit.',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'resolved',
            );

        $warranty = collect(
            $this->getJson(
                '/api/operations/warranties',
            )
                ->assertOk()
                ->json('data'),
        )->firstWhere(
            'id',
            $warrantyId,
        );

        $this->assertNotNull($warranty);
        $this->assertSame(
            1,
            (int) $warranty['claim_count'],
        );
        $this->assertSame(
            0,
            (int) $warranty['open_claim_count'],
        );
        $this->assertSame(
            'resolved',
            $warranty['last_claim_status'],
        );
        $this->assertSame(
            'Replaced the defective unit.',
            $warranty['claims'][0]['resolution'],
        );

        $serialId = (int) $this->postJson(
            '/api/operations/serials',
            [
                'product_id' => $productId,
                'supplier_party_id' => $supplierId,
                'customer_party_id' => $customerId,
                'source_purchase_document_id' => $purchaseId,
                'source_sale_document_id' => $saleId,
                'serial_number' => 'SN-TRACE-001',
                'status' => 'sold',
                'received_on' => today()->subDays(5)->toDateString(),
                'sold_on' => today()->toDateString(),
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $serial = collect(
            $this->getJson(
                '/api/operations/serials',
            )
                ->assertOk()
                ->json('data'),
        )->firstWhere(
            'id',
            $serialId,
        );

        $this->assertNotNull($serial);
        $this->assertSame(
            'Trace Customer',
            $serial['customer'],
        );

        $batchId = (int) $this->postJson(
            '/api/operations/batches',
            [
                'product_id' => $productId,
                'supplier_party_id' => $supplierId,
                'lot_code' => 'LOT-2026-001',
                'quantity' => '25',
                'manufactured_on' => today()->subMonth()->toDateString(),
                'expiry_date' => today()->addYear()->toDateString(),
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->assertDatabaseHas(
            'inventory_batches',
            [
                'id' => $batchId,
                'lot_code' => 'LOT-2026-001',
                'status' => 'available',
            ],
        );

        $expiredBatchId = (int) $this->postJson(
            '/api/operations/batches',
            [
                'product_id' => $productId,
                'supplier_party_id' => $supplierId,
                'lot_code' => 'LOT-EXPIRED-001',
                'quantity' => '5',
                'manufactured_on' => today()->subYear()->toDateString(),
                'expiry_date' => today()->subDay()->toDateString(),
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $expiredBatch = collect(
            $this->getJson(
                '/api/operations/batches',
            )
                ->assertOk()
                ->json('data'),
        )->firstWhere(
            'id',
            $expiredBatchId,
        );

        $this->assertNotNull($expiredBatch);
        $this->assertSame(
            'expired',
            $expiredBatch['status'],
        );
    }

    /** @return array{0: User, 1: Organization} */
    private function workspace(
        string $name,
    ): array {
        $user = User::factory()
            ->create();

        $organization = Organization::create([
            'name' => $name,
        ]);

        $organization->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        return [
            $user,
            $organization,
        ];
    }

    private function actingInWorkspace(
        User $user,
        Organization $organization,
    ): void {
        $this->actingAs($user)
            ->withSession([
                OrganizationAccess::SESSION_KEY =>
                    $organization->id,
            ]);
    }

    private function party(
        string $role,
        string $name,
    ): int {
        return (int) $this->postJson(
            '/api/parties',
            [
                'type' => 'company',
                'company_name' => $name,
                'roles' => [
                    $role,
                ],
            ],
        )
            ->assertCreated()
            ->json('data.id');
    }

    private function product(
        string $name,
    ): int {
        return (int) $this->postJson(
            '/api/products',
            [
                'type' => 'product',
                'name' => $name,
                'sku' => null,
                'unit' => 'unit',
                'unit_price' => '100.0000',
                'cost_price' => '50.0000',
                'tax_rate' => '0',
            ],
        )
            ->assertCreated()
            ->json('data.id');
    }

    private function invoice(
        string $kind,
        int $partyId,
        string $amount,
        string $dueDate,
    ): int {
        return (int) $this->postJson(
            '/api/finance/documents',
            [
                'kind' => $kind,
                'party_id' => $partyId,
                'issue_date' => today()->subDays(60)->toDateString(),
                'due_date' => $dueDate,
                'currency' => 'ILS',
                'lines' => [
                    [
                        'description' => 'Commercial operations test line',
                        'quantity' => '1',
                        'unit' => 'service',
                        'unit_price' => $amount,
                        'discount_percent' => '0',
                        'tax_rate' => '0',
                        'affects_inventory' => false,
                    ],
                ],
            ],
        )
            ->assertCreated()
            ->json('data.id');
    }

    private function issue(
        int $documentId,
    ): void {
        $this->postJson(
            "/api/finance/documents/{$documentId}/issue",
            [
                'acknowledge_warnings' => true,
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'issued',
            );
    }
}
