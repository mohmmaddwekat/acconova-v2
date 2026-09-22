<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class OperationalIntelligenceWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_operating_workspaces_are_reachable_and_system_checks_pass(): void
    {
        [$owner, $organization] = $this->workspace(
            'owner',
            'Reachability workspace',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        foreach ([
            '/app/finance',
            '/app/finance/approvals',
            '/app/finance/bank-reconciliation',
            '/app/purchases/requisitions',
            '/app/parties/intelligence',
            '/app/inventory/intelligence',
            '/app/inventory/transfers',
            '/app/system-checks',
        ] as $uri) {
            $this->get($uri)
                ->assertOk();
        }

        $this->getJson('/api/system-checks')
            ->assertOk()
            ->assertJsonPath(
                'data.summary.failed',
                0,
            );
    }

    public function test_invoice_approval_requires_a_different_reviewer_and_creates_all_rules_at_once(): void
    {
        [$owner, $organization] = $this->workspace(
            'owner',
            'Approval workspace',
        );

        $reviewer = User::factory()->create();

        $organization->users()->attach(
            $reviewer->id,
            [
                'role' => 'manager',
            ],
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $customerId = $this->party(
            'customer',
            'Approval Customer',
        );

        $documentId = (int) $this->postJson(
            '/api/finance/documents',
            [
                'kind' => 'sale_invoice',
                'party_id' => $customerId,
                'issue_date' => '2026-09-21',
                'currency' => 'ILS',
                'lines' => [
                    [
                        'description' => 'Approval controlled service',
                        'quantity' => '1',
                        'unit' => 'service',
                        'unit_price' => '20000',
                        'discount_percent' => '20',
                        'tax_rate' => '0',
                        'affects_inventory' => false,
                    ],
                ],
            ],
        )
            ->assertCreated()
            ->assertJsonPath(
                'data.total',
                '16000.0000',
            )
            ->json('data.id');

        $this->postJson(
            "/api/finance/documents/{$documentId}/issue",
            [
                'acknowledge_warnings' => false,
            ],
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors(
                'approval',
            );

        $requests = $this->getJson(
            '/api/approval-requests?status=pending',
        )
            ->assertOk()
            ->json('data');

        $this->assertCount(
            2,
            $requests,
        );

        $categories = collect(
            $requests,
        )
            ->pluck(
                'category',
            )
            ->sort()
            ->values()
            ->all();

        $this->assertSame(
            [
                'high_discount',
                'high_value_invoice',
            ],
            $categories,
        );

        $firstApprovalId =
            (int) $requests[0]['id'];

        $this->patchJson(
            "/api/approval-requests/{$firstApprovalId}",
            [
                'decision' => 'approved',
            ],
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors(
                'approval',
            );

        $this->actingInWorkspace(
            $reviewer,
            $organization,
        );

        foreach ($requests as $request) {
            $this->patchJson(
                '/api/approval-requests/'
                .$request['id'],
                [
                    'decision' => 'approved',
                ],
            )
                ->assertOk()
                ->assertJsonPath(
                    'data.status',
                    'approved',
                );
        }

        $this->actingInWorkspace(
            $owner,
            $organization,
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

    public function test_bank_transfer_payment_requires_second_person_approval(): void
    {
        [$owner, $organization] = $this->workspace(
            'owner',
            'Payment approval workspace',
        );

        $reviewer = User::factory()->create();

        $organization->users()->attach(
            $reviewer->id,
            [
                'role' => 'manager',
            ],
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $movementId = (int) $this->postJson(
            '/api/finance/cash-movements',
            [
                'direction' => 'outgoing',
                'category' => 'operating_expense',
                'amount' => '125',
                'currency' => 'ILS',
                'movement_date' => '2026-09-21',
                'method' => 'bank_transfer',
                'reference' => 'BANK-APPROVAL-1',
                'allocations' => [],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            "/api/finance/cash-movements/{$movementId}/post",
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors(
                'approval',
            );

        $approvalId = (int) $this->getJson(
            '/api/approval-requests?status=pending',
        )
            ->assertOk()
            ->assertJsonPath(
                'data.0.subject_type',
                'cash_movement',
            )
            ->json('data.0.id');

        $this->actingInWorkspace(
            $reviewer,
            $organization,
        );

        $this->patchJson(
            "/api/approval-requests/{$approvalId}",
            [
                'decision' => 'approved',
            ],
        )->assertOk();

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $this->postJson(
            "/api/finance/cash-movements/{$movementId}/post",
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'posted',
            );
    }

    public function test_transfer_workflow_moves_stock_only_when_received(): void
    {
        [$owner, $organization] = $this->workspace(
            'owner',
            'Transfer workflow workspace',
        );

        $reviewer = User::factory()->create();

        $organization->users()->attach(
            $reviewer->id,
            [
                'role' => 'manager',
            ],
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $productId = $this->product(
            'Transfer Product',
            '10.0000',
            '5.0000',
        );
        $sourceId = $this->warehouse(
            'Source Warehouse',
        );
        $destinationId = $this->warehouse(
            'Destination Warehouse',
        );

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
                'warehouse_id' => $sourceId,
                'quantity' => '10',
            ],
        )->assertOk();

        $transferId = (int) $this->postJson(
            '/api/inventory/transfer-requests',
            [
                'product_id' => $productId,
                'source_warehouse_id' => $sourceId,
                'destination_warehouse_id' => $destinationId,
                'quantity' => '4',
                'note' => 'Move stock to destination',
            ],
        )
            ->assertCreated()
            ->assertJsonPath(
                'data.status',
                'requested',
            )
            ->json('data.id');

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $productId,
                'warehouse_id' => $sourceId,
                'on_hand' => '10.0000',
            ],
        );

        $this->actingInWorkspace(
            $reviewer,
            $organization,
        );

        $this->patchJson(
            "/api/inventory/transfer-requests/{$transferId}",
            [
                'action' => 'approve',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'approved',
            );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $this->patchJson(
            "/api/inventory/transfer-requests/{$transferId}",
            [
                'action' => 'ship',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'shipped',
            );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $productId,
                'warehouse_id' => $sourceId,
                'on_hand' => '10.0000',
                'reserved' => '4.0000',
            ],
        );

        $this->patchJson(
            "/api/inventory/transfer-requests/{$transferId}",
            [
                'action' => 'receive',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'received',
            );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $productId,
                'warehouse_id' => $sourceId,
                'on_hand' => '6.0000',
                'reserved' => '0.0000',
            ],
        );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $productId,
                'warehouse_id' => $destinationId,
                'on_hand' => '4.0000',
            ],
        );
    }

    public function test_employee_can_submit_requisition_but_manager_reviews_it(): void
    {
        [$owner, $organization] = $this->workspace(
            'owner',
            'Requisition workspace',
        );

        $employee = User::factory()->create();
        $manager = User::factory()->create();

        $organization->users()->attach(
            $employee->id,
            [
                'role' => 'employee',
            ],
        );
        $organization->users()->attach(
            $manager->id,
            [
                'role' => 'manager',
            ],
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $productId = $this->product(
            'Requested Product',
            '12.0000',
            '7.0000',
        );

        $this->actingInWorkspace(
            $employee,
            $organization,
        );

        $requisitionId = (int) $this->postJson(
            '/api/purchase-requisitions',
            [
                'product_id' => $productId,
                'description' => 'Requested Product',
                'quantity' => '5',
                'expected_unit_cost' => '7',
                'needed_by' => '2026-10-01',
                'note' => 'Needed for operations',
            ],
        )
            ->assertCreated()
            ->assertJsonPath(
                'data.status',
                'pending',
            )
            ->json('data.id');

        $this->getJson(
            '/api/purchase-requisitions?status=all',
        )
            ->assertOk()
            ->assertJsonPath(
                'data.0.id',
                $requisitionId,
            );

        $this->patchJson(
            "/api/purchase-requisitions/{$requisitionId}/review",
            [
                'decision' => 'approved',
            ],
        )->assertForbidden();

        $this->actingInWorkspace(
            $manager,
            $organization,
        );

        $this->patchJson(
            "/api/purchase-requisitions/{$requisitionId}/review",
            [
                'decision' => 'approved',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'approved',
            );
    }

    public function test_bank_reconciliation_suggests_and_matches_posted_cash(): void
    {
        [$owner, $organization] = $this->workspace(
            'owner',
            'Reconciliation workspace',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $movementId = (int) $this->postJson(
            '/api/finance/cash-movements',
            [
                'direction' => 'incoming',
                'category' => 'other_income',
                'amount' => '250',
                'currency' => 'ILS',
                'movement_date' => '2026-09-21',
                'method' => 'cash',
                'reference' => 'DEP-250',
                'allocations' => [],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            "/api/finance/cash-movements/{$movementId}/post",
        )
            ->assertOk();

        $this->postJson(
            '/api/bank-reconciliation/import',
            [
                'lines' => [
                    [
                        'bank_account_label' => 'Main bank',
                        'transaction_date' => '2026-09-21',
                        'description' => 'Deposit received',
                        'reference' => 'DEP-250',
                        'amount' => '250',
                        'currency' => 'ILS',
                    ],
                ],
            ],
        )
            ->assertCreated()
            ->assertJsonPath(
                'data.inserted',
                1,
            );

        $line = $this->getJson(
            '/api/bank-reconciliation?status=unmatched',
        )
            ->assertOk()
            ->assertJsonPath(
                'data.0.suggested_match.id',
                $movementId,
            )
            ->json('data.0');

        $this->postJson(
            '/api/bank-reconciliation/'
            .$line['id']
            .'/match',
            [
                'cash_movement_id' => $movementId,
            ],
        )->assertOk();

        $this->assertDatabaseHas(
            'bank_statement_lines',
            [
                'id' => $line['id'],
                'status' => 'matched',
                'matched_cash_movement_id' => $movementId,
            ],
        );

        $this->postJson(
            '/api/bank-reconciliation/import',
            [
                'lines' => [
                    [
                        'bank_account_label' => 'Main bank',
                        'transaction_date' => '2026-09-22',
                        'description' => 'Second deposit row',
                        'reference' => 'DEP-250-B',
                        'amount' => '250',
                        'currency' => 'ILS',
                    ],
                ],
            ],
        )
            ->assertCreated()
            ->assertJsonPath(
                'data.inserted',
                1,
            );

        $secondLine = $this->getJson(
            '/api/bank-reconciliation?status=unmatched',
        )
            ->assertOk()
            ->assertJsonPath(
                'data.0.suggested_match',
                null,
            )
            ->json('data.0');

        $this->getJson(
            '/api/bank-reconciliation/'
            .$secondLine['id']
            .'/candidates',
        )
            ->assertOk()
            ->assertJsonMissing([
                'id' => $movementId,
            ]);

        $this->postJson(
            '/api/bank-reconciliation/'
            .$secondLine['id']
            .'/match',
            [
                'cash_movement_id' => $movementId,
            ],
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors(
                'cash_movement_id',
            );
    }

    public function test_duplicate_payment_detector_finds_similar_movements_and_requires_review_before_post(): void
    {
        [$owner, $organization] = $this->workspace(
            'owner',
            'Duplicate payment workspace',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $firstId = (int) $this->postJson(
            '/api/finance/cash-movements',
            [
                'direction' => 'outgoing',
                'category' => 'maintenance',
                'amount' => '99.50',
                'currency' => 'ILS',
                'movement_date' => '2026-09-21',
                'method' => 'cash',
                'reference' => 'MAINT-DUP',
                'allocations' => [],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            '/api/finance/cash-movements/duplicate-check',
            [
                'direction' => 'outgoing',
                'party_id' => null,
                'amount' => '99.50',
                'movement_date' => '2026-09-22',
                'method' => 'cash',
                'reference' => 'MAINT-DUP',
            ],
        )
            ->assertOk()
            ->assertJsonCount(
                1,
                'data',
            )
            ->assertJsonPath(
                'data.0.id',
                $firstId,
            )
            ->assertJsonPath(
                'data.0.same_reference',
                true,
            );

        $secondId = (int) $this->postJson(
            '/api/finance/cash-movements',
            [
                'direction' => 'outgoing',
                'category' => 'maintenance',
                'amount' => '99.50',
                'currency' => 'ILS',
                'movement_date' => '2026-09-22',
                'method' => 'cash',
                'reference' => 'MAINT-DUP-SECOND',
                'allocations' => [],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            "/api/finance/cash-movements/{$secondId}/post",
            [],
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors(
                'duplicate',
            );

        $this->postJson(
            "/api/finance/cash-movements/{$secondId}/post",
            [
                'acknowledge_duplicate' => true,
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'posted',
            );
    }

    public function test_custom_approval_reviewer_permission_can_review_without_broad_finance_role(): void
    {
        [$owner, $organization] = $this->workspace(
            'owner',
            'Custom approval reviewer workspace',
        );

        $reviewer = User::factory()->create();

        $this->attachCustomRole(
            $organization,
            $reviewer,
            'Approval Reviewer',
            [
                'finance.approvals.review',
            ],
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $customerId = $this->party(
            'customer',
            'Custom Approval Customer',
        );

        $documentId = (int) $this->postJson(
            '/api/finance/documents',
            [
                'kind' => 'sale_invoice',
                'party_id' => $customerId,
                'issue_date' => '2026-09-21',
                'currency' => 'ILS',
                'lines' => [
                    [
                        'description' => 'Approval-only reviewer test',
                        'quantity' => '1',
                        'unit' => 'service',
                        'unit_price' => '15000',
                        'discount_percent' => '0',
                        'tax_rate' => '0',
                        'affects_inventory' => false,
                    ],
                ],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            "/api/finance/documents/{$documentId}/issue",
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors('approval');

        $approvalId = (int) $this->getJson(
            '/api/approval-requests?status=pending',
        )
            ->assertOk()
            ->json('data.0.id');

        $this->actingInWorkspace(
            $reviewer,
            $organization,
        );

        $this->getJson('/api/finance/lookups')
            ->assertOk()
            ->assertJsonPath(
                'permissions.approvals_review',
                true,
            );

        $this->patchJson(
            "/api/approval-requests/{$approvalId}",
            [
                'decision' => 'approved',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'approved',
            );
    }

    public function test_custom_purchase_manager_can_review_purchase_requisitions(): void
    {
        [$owner, $organization] = $this->workspace(
            'owner',
            'Custom purchase reviewer workspace',
        );

        $employee = User::factory()->create();
        $reviewer = User::factory()->create();

        $organization->users()->attach(
            $employee->id,
            [
                'role' => 'employee',
            ],
        );

        $this->attachCustomRole(
            $organization,
            $reviewer,
            'Purchase Reviewer',
            [
                'finance.purchases.view',
                'finance.purchases.manage',
            ],
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $productId = $this->product(
            'Custom Review Product',
            '15.0000',
            '8.0000',
        );

        $this->actingInWorkspace(
            $employee,
            $organization,
        );

        $requisitionId = (int) $this->postJson(
            '/api/purchase-requisitions',
            [
                'product_id' => $productId,
                'description' => 'Custom Review Product',
                'quantity' => '3',
                'expected_unit_cost' => '8',
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->actingInWorkspace(
            $reviewer,
            $organization,
        );

        $this->patchJson(
            "/api/purchase-requisitions/{$requisitionId}/review",
            [
                'decision' => 'approved',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'approved',
            );
    }

    public function test_custom_inventory_manager_can_approve_transfer_workflow(): void
    {
        [$owner, $organization] = $this->workspace(
            'owner',
            'Custom inventory manager workspace',
        );

        $reviewer = User::factory()->create();

        $this->attachCustomRole(
            $organization,
            $reviewer,
            'Inventory Reviewer',
            [
                'inventory.view',
                'inventory.manage',
                'products.view',
            ],
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $productId = $this->product(
            'Custom Transfer Product',
            '12.0000',
            '6.0000',
        );
        $sourceId = $this->warehouse(
            'Custom Source Warehouse',
        );
        $destinationId = $this->warehouse(
            'Custom Destination Warehouse',
        );

        $this->patchJson(
            "/api/inventory/products/{$productId}/settings",
            [
                'track_inventory' => true,
                'low_stock_threshold' => '1',
            ],
        )->assertOk();

        $this->postJson(
            "/api/inventory/products/{$productId}/opening-stock",
            [
                'warehouse_id' => $sourceId,
                'quantity' => '5',
            ],
        )->assertOk();

        $transferId = (int) $this->postJson(
            '/api/inventory/transfer-requests',
            [
                'product_id' => $productId,
                'source_warehouse_id' => $sourceId,
                'destination_warehouse_id' => $destinationId,
                'quantity' => '2',
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->actingInWorkspace(
            $reviewer,
            $organization,
        );

        $this->patchJson(
            "/api/inventory/transfer-requests/{$transferId}",
            [
                'action' => 'approve',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'approved',
            );
    }

    /**
     * Attach one explicit custom workspace role without using owner-only UI
     * endpoints so feature tests can exercise runtime permission resolution.
     *
     * @param  list<string>  $permissions
     */
    private function attachCustomRole(
        Organization $organization,
        User $user,
        string $name,
        array $permissions,
    ): void {
        $roleId = (int) DB::table(
            'workspace_roles',
        )->insertGetId([
            'organization_id' => $organization->id,
            'name' => $name,
            'base_role' => 'employee',
            'is_custom' => true,
            'permissions' => json_encode(
                $permissions,
                JSON_THROW_ON_ERROR,
            ),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $organization->users()->attach(
            $user->id,
            [
                'role' => 'employee',
                'workspace_role_id' => $roleId,
            ],
        );
    }

    /** @return array{0: User, 1: Organization} */
    private function workspace(
        string $role,
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
                    'role' => $role,
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
