<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class BusinessIntelligenceFeatureTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_segmentation_and_profitability_use_issued_sales_and_cost_snapshots(): void
    {
        [$owner, $organization] = $this->workspace(
            'Customer intelligence workspace',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $customerId = $this->party(
            'customer',
            'Profitable Customer',
        );

        $productId = $this->product(
            'Margin Product',
            '100.0000',
            '40.0000',
        );

        $documentId = $this->document(
            'sale_invoice',
            $customerId,
            [
                [
                    'product_id' => $productId,
                    'description' => 'Margin Product',
                    'quantity' => '2',
                    'unit' => 'unit',
                    'unit_price' => '100',
                    'discount_percent' => '0',
                    'tax_rate' => '0',
                    'affects_inventory' => false,
                ],
            ],
        );

        $this->postJson(
            "/api/finance/documents/{$documentId}/issue",
            [
                'acknowledge_warnings' => false,
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'issued',
            );

        $response = $this->getJson(
            '/api/customer-intelligence',
        )
            ->assertOk();

        $customer = collect(
            $response->json('data.customers'),
        )->firstWhere(
            'party_id',
            $customerId,
        );

        $this->assertNotNull(
            $customer,
        );
        $this->assertContains(
            'active',
            $customer['segments'],
        );
        $this->assertContains(
            'high_profitability',
            $customer['segments'],
        );
        $this->assertSame(
            '80.0000',
            $customer['estimated_cost'],
        );
        $this->assertSame(
            '120.0000',
            $customer['gross_profit_estimate'],
        );
        $this->assertSame(
            '60.00',
            $customer['margin_estimate_percent'],
        );

        $this->getJson(
            "/api/parties/{$customerId}/360",
        )
            ->assertOk()
            ->assertJsonPath(
                'data.customer.profitability.estimated_cost',
                '80.0000',
            )
            ->assertJsonPath(
                'data.customer.profitability.gross_profit_estimate',
                '120.0000',
            )
            ->assertJsonPath(
                'data.customer.profitability.margin_estimate_percent',
                '60.00',
            );
    }

    public function test_supplier_360_exposes_measured_performance_after_purchase_history_exists(): void
    {
        [$owner, $organization] = $this->workspace(
            'Supplier score workspace',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $supplierId = $this->party(
            'supplier',
            'Measured Supplier',
        );

        $productId = $this->product(
            'Purchased Product',
            '90.0000',
            '50.0000',
        );

        foreach ([
            ['price' => '50', 'date' => now()->subDays(10)->toDateString()],
            ['price' => '55', 'date' => now()->subDays(2)->toDateString()],
        ] as $purchase) {
            $documentId = $this->document(
                'purchase_invoice',
                $supplierId,
                [
                    [
                        'product_id' => $productId,
                        'description' => 'Purchased Product',
                        'quantity' => '5',
                        'unit' => 'unit',
                        'unit_price' => $purchase['price'],
                        'discount_percent' => '0',
                        'tax_rate' => '0',
                        'affects_inventory' => false,
                    ],
                ],
                $purchase['date'],
            );

            $this->postJson(
                "/api/finance/documents/{$documentId}/issue",
                [
                    'acknowledge_warnings' => false,
                ],
            )
                ->assertOk()
                ->assertJsonPath(
                    'data.status',
                    'issued',
                );
        }

        $response = $this->getJson(
            "/api/parties/{$supplierId}/360",
        )
            ->assertOk();

        $this->assertSame(
            2,
            $response->json(
                'data.supplier.performance.sample_invoice_count',
            ),
        );
        $this->assertSame(
            'measured',
            $response->json(
                'data.supplier.performance.data_quality',
            ),
        );
        $this->assertIsNumeric(
            $response->json(
                'data.supplier.performance.score',
            ),
        );
        $this->assertEqualsWithDelta(
            10.0,
            (float) $response->json(
                'data.supplier.performance.average_price_change_percent',
            ),
            0.01,
        );
    }

    public function test_inventory_intelligence_detects_dead_stock_reorder_need_stockout_and_aging(): void
    {
        [$owner, $organization] = $this->workspace(
            'Inventory intelligence workspace',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $warehouseId = $this->warehouse(
            'Main Intelligence Warehouse',
        );

        $fastProductId = $this->product(
            'Fast Product',
            '20.0000',
            '10.0000',
        );
        $deadProductId = $this->product(
            'Dead Product',
            '15.0000',
            '8.0000',
        );

        foreach (
            [
                [$fastProductId, '10'],
                [$deadProductId, '5'],
            ] as [$productId, $quantity]
        ) {
            $this->patchJson(
                "/api/inventory/products/{$productId}/settings",
                [
                    'track_inventory' => true,
                    'low_stock_threshold' => '2',
                ],
            )->assertOk();

            $this->postJson(
                "/api/inventory/products/{$productId}/opening-stock",
                [
                    'warehouse_id' => $warehouseId,
                    'quantity' => $quantity,
                ],
            )->assertOk();
        }

        DB::table('stock_movements')
            ->where(
                'product_id',
                $deadProductId,
            )
            ->update([
                'created_at' => now()->subDays(100),
                'updated_at' => now()->subDays(100),
            ]);

        $saleId = $this->document(
            'sale_invoice',
            $this->party(
                'customer',
                'Fast Customer',
            ),
            [
                [
                    'product_id' => $fastProductId,
                    'warehouse_id' => $warehouseId,
                    'description' => 'Fast Product',
                    'quantity' => '9',
                    'unit' => 'unit',
                    'unit_price' => '20',
                    'discount_percent' => '0',
                    'tax_rate' => '0',
                    'affects_inventory' => true,
                ],
            ],
        );

        $this->postJson(
            "/api/finance/documents/{$saleId}/issue",
            [
                'acknowledge_warnings' => false,
            ],
        )
            ->assertOk();

        $response = $this->getJson(
            '/api/inventory/intelligence',
        )
            ->assertOk();

        $this->assertGreaterThanOrEqual(
            1,
            (int) $response->json(
                'data.summary.dead_stock_products',
            ),
        );
        $this->assertGreaterThanOrEqual(
            1,
            (int) $response->json(
                'data.summary.reorder_products',
            ),
        );
        $this->assertGreaterThanOrEqual(
            1,
            (int) $response->json(
                'data.summary.stockout_30_days',
            ),
        );

        $dead = collect(
            $response->json(
                'data.dead_stock',
            ),
        )->firstWhere(
            'product_id',
            $deadProductId,
        );

        $this->assertNotNull(
            $dead,
        );
        $this->assertSame(
            '90+',
            $dead['dead_stock_bucket'],
        );
        $this->assertSame(
            '40.0000',
            $dead['frozen_capital'],
        );

        $reorder = collect(
            $response->json(
                'data.reorder_suggestions',
            ),
        )->firstWhere(
            'product_id',
            $fastProductId,
        );

        $this->assertNotNull(
            $reorder,
        );
        $this->assertGreaterThan(
            0,
            (float) $reorder['reorder_quantity'],
        );
        $this->assertLessThanOrEqual(
            30,
            (float) $reorder['stockout_days'],
        );

        $aging = collect(
            $response->json(
                'data.aging',
            ),
        )->firstWhere(
            'product_id',
            $deadProductId,
        );

        $this->assertNotNull(
            $aging,
        );
        $this->assertGreaterThanOrEqual(
            90,
            (int) $aging['inventory_age_days'],
        );
    }

    public function test_cashflow_calendar_endpoint_loads_for_sales_access(): void
    {
        [$owner, $organization] = $this->workspace(
            'Cashflow calendar workspace',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $this->getJson(
            '/api/business-pulse/cashflow?month='.today()->format('Y-m'),
        )
            ->assertOk()
            ->assertJsonPath(
                'data.month',
                today()->format('Y-m'),
            )
            ->assertJsonStructure([
                'data' => [
                    'month',
                    'days',
                ],
            ]);
    }

    public function test_duplicate_supplier_invoice_is_blocked_until_warning_is_acknowledged(): void
    {
        [$owner, $organization] = $this->workspace(
            'Duplicate invoice workspace',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $supplierId = $this->party(
            'supplier',
            'Duplicate Supplier',
        );

        $firstId = $this->document(
            'purchase_invoice',
            $supplierId,
            [
                [
                    'description' => 'Supplier service',
                    'quantity' => '1',
                    'unit' => 'service',
                    'unit_price' => '250',
                    'discount_percent' => '0',
                    'tax_rate' => '0',
                    'affects_inventory' => false,
                ],
            ],
            today()->toDateString(),
            'SUP-INV-100',
        );

        $this->postJson(
            "/api/finance/documents/{$firstId}/issue",
            [
                'acknowledge_warnings' => false,
            ],
        )
            ->assertOk();

        $secondId = $this->document(
            'purchase_invoice',
            $supplierId,
            [
                [
                    'description' => 'Supplier service duplicate',
                    'quantity' => '1',
                    'unit' => 'service',
                    'unit_price' => '250',
                    'discount_percent' => '0',
                    'tax_rate' => '0',
                    'affects_inventory' => false,
                ],
            ],
            today()->toDateString(),
            'SUP-INV-100',
        );

        $this->postJson(
            "/api/finance/documents/{$secondId}/issue",
            [
                'acknowledge_warnings' => false,
            ],
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors(
                'warnings',
            );

        $this->postJson(
            "/api/finance/documents/{$secondId}/issue",
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

    /** @return array{0: User, 1: Organization} */
    private function workspace(
        string $name,
    ): array {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
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
        $this->actingAs(
            $user,
        )->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
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
        string $unitPrice,
        string $costPrice,
    ): int {
        return (int) $this->postJson(
            '/api/products',
            [
                'type' => 'product',
                'name' => $name,
                'sku' => null,
                'unit' => 'unit',
                'unit_price' => $unitPrice,
                'cost_price' => $costPrice,
                'tax_rate' => '0',
            ],
        )
            ->assertCreated()
            ->json('data.id');
    }

    /**
     * @param  list<array<string, mixed>>  $lines
     */
    private function document(
        string $kind,
        int $partyId,
        array $lines,
        ?string $issueDate = null,
        ?string $externalNumber = null,
    ): int {
        return (int) $this->postJson(
            '/api/finance/documents',
            [
                'kind' => $kind,
                'party_id' => $partyId,
                'external_number' => $externalNumber,
                'issue_date' => $issueDate
                    ?? today()->toDateString(),
                'currency' => 'ILS',
                'lines' => $lines,
            ],
        )
            ->assertCreated()
            ->json('data.id');
    }

    private function warehouse(
        string $name,
    ): int {
        return (int) $this->postJson(
            '/api/warehouses',
            [
                'name' => $name,
            ],
        )
            ->assertCreated()
            ->json('data.id');
    }
}
