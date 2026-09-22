<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Services\NotificationCenter;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BusinessControlFeatureTest extends TestCase
{
    use RefreshDatabase;

    public function test_budget_and_department_limit_use_posted_department_spend(): void
    {
        [$owner, $organization] = $this->workspace(
            'Budget controls',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $departmentId = (int) $this->postJson(
            '/api/departments',
            [
                'name' => 'Operations',
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            '/api/control/budgets',
            [
                'department_id' => $departmentId,
                'month' => today()->format('Y-m'),
                'amount' => '100.0000',
                'currency' => 'ILS',
            ],
        )->assertCreated();

        $this->postJson(
            '/api/control/spending-limits',
            [
                'department_id' => $departmentId,
                'monthly_limit' => '100.0000',
                'currency' => 'ILS',
            ],
        )->assertCreated();

        $tooLarge = (int) $this->postJson(
            '/api/finance/cash-movements',
            [
                'direction' => 'outgoing',
                'department_id' => $departmentId,
                'category' => 'operating_expense',
                'amount' => '120.0000',
                'currency' => 'ILS',
                'movement_date' => today()->toDateString(),
                'method' => 'cash',
                'allocations' => [],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            "/api/finance/cash-movements/{$tooLarge}/post",
            [
                'acknowledge_duplicate' => true,
            ],
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors(
                'department_id',
            );

        $allowed = (int) $this->postJson(
            '/api/finance/cash-movements',
            [
                'direction' => 'outgoing',
                'department_id' => $departmentId,
                'category' => 'operating_expense',
                'amount' => '80.0000',
                'currency' => 'ILS',
                'movement_date' => today()->toDateString(),
                'method' => 'cash',
                'allocations' => [],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            "/api/finance/cash-movements/{$allowed}/post",
            [
                'acknowledge_duplicate' => true,
            ],
        )->assertOk();

        $budget = $this->getJson(
            '/api/control/budgets',
        )
            ->assertOk()
            ->json('data.0');

        $this->assertSame(
            '80.0000',
            $budget['actual'],
        );
        $this->assertSame(
            '20.0000',
            $budget['variance'],
        );

        $limit = $this->getJson(
            '/api/control/spending-limits',
        )
            ->assertOk()
            ->json('data.0');

        $this->assertSame(
            '80.0000',
            $limit['spent'],
        );
        $this->assertSame(
            '20.0000',
            $limit['remaining'],
        );
    }

    public function test_expense_claim_supports_receipt_review_and_payout_reference(): void
    {
        Storage::fake('local');

        [$owner, $organization] = $this->workspace(
            'Expense claims',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $claimId = (int) $this->postJson(
            '/api/control/expense-claims',
            [
                'title' => 'Taxi to client',
                'amount' => '45.0000',
                'currency' => 'ILS',
                'expense_date' => today()->toDateString(),
                'merchant' => 'City Taxi',
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->post(
            "/api/control/expense-claims/{$claimId}/receipt",
            [
                'receipt' => UploadedFile::fake()
                    ->image('receipt.jpg'),
            ],
            [
                'Accept' => 'application/json',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.receipt_original_name',
                'receipt.jpg',
            );

        $claim = $this->getJson(
            '/api/control/expense-claims',
        )
            ->assertOk()
            ->json('data.0');

        $this->assertSame(
            $claimId,
            (int) $claim['id'],
        );
        $this->assertNotNull(
            $claim['receipt_url'],
        );

        $this->patchJson(
            "/api/control/expense-claims/{$claimId}",
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
            "/api/control/expense-claims/{$claimId}",
            [
                'status' => 'paid',
                'payout_reference' => 'PAY-REF-1',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'paid',
            )
            ->assertJsonPath(
                'data.payout_reference',
                'PAY-REF-1',
            );
    }

    public function test_petty_cash_never_exceeds_cap_or_goes_negative(): void
    {
        [$owner, $organization] = $this->workspace(
            'Petty cash',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $fundId = (int) $this->postJson(
            '/api/control/petty-cash',
            [
                'name' => 'Front desk',
                'limit_amount' => '100.0000',
                'opening_balance' => '20.0000',
                'currency' => 'ILS',
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            "/api/control/petty-cash/{$fundId}/transactions",
            [
                'direction' => 'out',
                'amount' => '30.0000',
            ],
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors('amount');

        $this->postJson(
            "/api/control/petty-cash/{$fundId}/transactions",
            [
                'direction' => 'in',
                'amount' => '50.0000',
            ],
        )->assertCreated();

        $this->postJson(
            "/api/control/petty-cash/{$fundId}/transactions",
            [
                'direction' => 'out',
                'amount' => '60.0000',
            ],
        )->assertCreated();

        $fund = $this->getJson(
            '/api/control/petty-cash',
        )
            ->assertOk()
            ->json('data.0');

        $this->assertSame(
            '10.0000',
            $fund['balance'],
        );
    }

    public function test_expiry_contract_and_document_alerts_feed_notification_center(): void
    {
        [$owner, $organization] = $this->workspace(
            'Expiry controls',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $productId = $this->product(
            'Expiring lot product',
        );

        $this->postJson(
            '/api/operations/batches',
            [
                'product_id' => $productId,
                'lot_code' => 'EXP-LOT-1',
                'quantity' => '10',
                'expiry_date' => today()
                    ->addDays(5)
                    ->toDateString(),
            ],
        )->assertCreated();

        $expiry = $this->getJson(
            '/api/control/expiry-alerts',
        )
            ->assertOk()
            ->json('data.0');

        $this->assertSame(
            'critical',
            $expiry['alert_level'],
        );

        $customerId = $this->party(
            'customer',
            'Contract Customer',
        );

        $this->postJson(
            '/api/control/contracts',
            [
                'party_id' => $customerId,
                'title' => 'Annual support',
                'contract_type' => 'customer',
                'starts_on' => today()
                    ->subYear()
                    ->toDateString(),
                'ends_on' => today()
                    ->addDays(7)
                    ->toDateString(),
                'value' => '1200.0000',
                'currency' => 'ILS',
                'renewal_type' => 'manual',
                'reminder_days' => 30,
            ],
        )->assertCreated();

        $this->postJson(
            '/api/control/document-expiry',
            [
                'subject_type' => 'organization',
                'document_type' => 'Business license',
                'expires_on' => today()
                    ->addDays(15)
                    ->toDateString(),
                'reminder_days' => 30,
            ],
        )->assertCreated();

        app(NotificationCenter::class)
            ->syncDue(
                $organization->id,
            );

        $this->assertDatabaseHas(
            'workspace_notifications',
            [
                'organization_id' => $organization->id,
                'user_id' => $owner->id,
                'kind' => 'inventory_expiry',
            ],
        );

        $this->assertDatabaseHas(
            'workspace_notifications',
            [
                'organization_id' => $organization->id,
                'user_id' => $owner->id,
                'kind' => 'contract_expiry',
            ],
        );

        $this->assertDatabaseHas(
            'workspace_notifications',
            [
                'organization_id' => $organization->id,
                'user_id' => $owner->id,
                'kind' => 'document_expiry',
            ],
        );
    }

    public function test_landed_cost_is_an_analysis_worksheet_and_exchange_rate_history_is_recorded(): void
    {
        [$owner, $organization] = $this->workspace(
            'Landed costs',
        );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $supplierId = $this->party(
            'supplier',
            'Import Supplier',
        );

        $purchaseId = $this->invoice(
            'purchase_invoice',
            $supplierId,
            '200.0000',
        );

        $this->assertDatabaseHas(
            'exchange_rate_history',
            [
                'organization_id' => $organization->id,
                'financial_document_id' => $purchaseId,
                'currency' => 'ILS',
                'exchange_rate' => '1.00000000',
            ],
        );

        $this->postJson(
            "/api/finance/documents/{$purchaseId}/issue",
            [
                'acknowledge_warnings' => true,
            ],
        )->assertOk();

        $costId = (int) $this->postJson(
            '/api/control/landed-costs',
            [
                'purchase_document_id' => $purchaseId,
                'cost_type' => 'shipping',
                'title' => 'Ocean freight',
                'amount' => '30.0000',
                'allocation_method' => 'value',
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $cost = collect(
            $this->getJson(
                '/api/control/landed-costs',
            )
                ->assertOk()
                ->json('data'),
        )->firstWhere(
            'id',
            $costId,
        );

        $this->assertNotNull($cost);
        $this->assertFalse(
            $cost['accounting_effect'],
        );
        $this->assertSame(
            '30.0000',
            $cost['allocations'][0]['allocated_cost'],
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
                'roles' => [$role],
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
                'unit_price' => '50.0000',
                'cost_price' => '20.0000',
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
    ): int {
        return (int) $this->postJson(
            '/api/finance/documents',
            [
                'kind' => $kind,
                'party_id' => $partyId,
                'issue_date' => today()->toDateString(),
                'due_date' => today()
                    ->addDays(30)
                    ->toDateString(),
                'currency' => 'ILS',
                'exchange_rate' => '1',
                'lines' => [
                    [
                        'description' => 'Imported goods',
                        'quantity' => '1',
                        'unit' => 'unit',
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
}
