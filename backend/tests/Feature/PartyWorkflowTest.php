<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartyWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_general_party_can_be_created_filtered_and_reclassified(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'General Parties']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        $payload = ['type' => 'other', 'name' => 'General transport', 'roles' => ['supplier']];
        $this->postJson('/api/parties', [...$payload, 'name' => ''])->assertUnprocessable();
        $id = $this->postJson('/api/parties', $payload)->assertCreated()
            ->assertJsonPath('data.type', 'other')->assertJsonPath('data.name', 'General transport')->json('data.id');
        $this->getJson('/api/parties?type=other')->assertOk()->assertJsonCount(1, 'data');
        $this->patchJson('/api/parties/'.$id, ['type' => 'company', 'company_name' => 'Transport Co'])
            ->assertOk()->assertJsonPath('data.name', null);
        $this->patchJson('/api/parties/'.$id, ['type' => 'other'])->assertUnprocessable();
        $this->patchJson('/api/parties/'.$id, ['type' => 'other', 'name' => 'Public transport'])
            ->assertOk()->assertJsonPath('data.company_name', null)->assertJsonPath('data.name', 'Public transport');
    }

    /**
     * Verify the Party ledger supports creation, search, entity filtering,
     * relationship filtering, archive visibility, and restoration.
     */
    public function test_owner_can_operate_complete_party_ledger_workflow(): void
    {
        $user = User::factory()
            ->create();

        $organization = Organization::create([
            'name' => 'Workflow Company',
        ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        $this->actingAs($user)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $personResponse = $this->postJson(
            '/api/parties',
            [
                'type' => 'person',
                'name' => 'Alice Customer',
                'email' => 'alice@example.com',
                'phone' => '+970590000001',

                'roles' => [
                    'customer',
                ],
            ],
        )
            ->assertCreated();

        $companyResponse = $this->postJson(
            '/api/parties',
            [
                'type' => 'company',
                'company_name' => 'Acme Supplies',
                'email' => 'sales@acme.test',

                'roles' => [
                    'supplier',
                ],
            ],
        )
            ->assertCreated();

        $personId =
            $personResponse->json(
                'data.id',
            );

        $companyId =
            $companyResponse->json(
                'data.id',
            );

        /*
         * Entity type and business relationship filters must work together,
         * because the frontend combines them in one tenant-scoped query.
         */
        $this->getJson(
            '/api/parties?type=company&role=supplier&status=active',
        )
            ->assertOk()
            ->assertJsonCount(
                1,
                'data',
            )
            ->assertJsonPath(
                'data.0.id',
                $companyId,
            )
            ->assertJsonPath(
                'data.0.company_name',
                'Acme Supplies',
            );

        /*
         * Search must find relevant identity and contact information without
         * returning unrelated tenant records.
         */
        $this->getJson(
            '/api/parties?search=Alice&status=active',
        )
            ->assertOk()
            ->assertJsonCount(
                1,
                'data',
            )
            ->assertJsonPath(
                'data.0.id',
                $personId,
            );

        $this->deleteJson(
            "/api/parties/{$personId}",
        )->assertNoContent();

        /*
         * Archived relationships disappear from active views while remaining
         * queryable through the archived lifecycle view.
         */
        $this->getJson(
            '/api/parties?search=Alice&status=active',
        )
            ->assertOk()
            ->assertJsonCount(
                0,
                'data',
            );

        $this->getJson(
            '/api/parties?search=Alice&status=deleted',
        )
            ->assertOk()
            ->assertJsonCount(
                1,
                'data',
            )
            ->assertJsonPath(
                'data.0.id',
                $personId,
            );

        $this->postJson(
            "/api/parties/{$personId}/restore",
        )
            ->assertOk()
            ->assertJsonPath(
                'data.id',
                $personId,
            );

        /*
         * Restoration must place the business identity back into the active
         * relationship ledger.
         */
        $this->getJson(
            '/api/parties?search=alice@example.com&status=active',
        )
            ->assertOk()
            ->assertJsonCount(
                1,
                'data',
            )
            ->assertJsonPath(
                'data.0.id',
                $personId,
            );
    }

    public function test_dual_role_party_account_tracks_opening_balances_and_advances(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create([
            'name' => 'Dual Party Ledger',
        ]);
        $organization->users()->attach(
            $user->id,
            ['role' => 'owner'],
        );

        $this->actingAs($user)
            ->withSession([
                OrganizationAccess::SESSION_KEY =>
                    $organization->id,
            ]);

        $partyId = $this->postJson(
            '/api/parties',
            [
                'type' => 'company',
                'company_name' => 'Dual Trading Co',
                'roles' => [
                    'customer',
                    'supplier',
                ],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->patchJson(
            '/api/parties/'
            .$partyId
            .'/opening-balances',
            [
                'customer' => [
                    'amount' => '20',
                    'as_of_date' => '2026-01-01',
                    'notes' => 'Imported customer balance',
                ],
                'supplier' => [
                    'amount' => '10',
                    'as_of_date' => '2026-01-01',
                    'notes' => 'Imported supplier balance',
                ],
            ],
        )->assertOk();

        $saleId = $this->postJson(
            '/api/finance/documents',
            [
                'kind' => 'sale_invoice',
                'party_id' => $partyId,
                'issue_date' => '2026-01-02',
                'due_date' => '2026-01-31',
                'activity_type' => 'services',
                'market_type' => 'local',
                'currency' => 'ILS',
                'exchange_rate' => '1',
                'shipping_total' => '0',
                'lines' => [[
                    'description' => 'Customer service',
                    'quantity' => '1',
                    'unit' => 'service',
                    'unit_price' => '100',
                    'discount_percent' => '0',
                    'tax_rate' => '0',
                    'affects_inventory' => false,
                ]],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            '/api/finance/documents/'
            .$saleId
            .'/issue',
            [
                'acknowledge_warnings' => false,
            ],
        )->assertOk();

        $purchaseId = $this->postJson(
            '/api/finance/documents',
            [
                'kind' => 'purchase_invoice',
                'party_id' => $partyId,
                'issue_date' => '2026-01-02',
                'due_date' => '2026-01-31',
                'activity_type' => 'services',
                'market_type' => 'local',
                'currency' => 'ILS',
                'exchange_rate' => '1',
                'shipping_total' => '0',
                'lines' => [[
                    'description' => 'Supplier service',
                    'quantity' => '1',
                    'unit' => 'service',
                    'unit_price' => '40',
                    'discount_percent' => '0',
                    'tax_rate' => '0',
                    'affects_inventory' => false,
                ]],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            '/api/finance/documents/'
            .$purchaseId
            .'/issue',
            [
                'acknowledge_warnings' => false,
            ],
        )->assertOk();

        $receiptId = $this->postJson(
            '/api/finance/cash-movements',
            [
                'direction' => 'incoming',
                'party_id' => $partyId,
                'category' => 'customer_receipt',
                'amount' => '130',
                'currency' => 'ILS',
                'movement_date' => '2026-01-03',
                'method' => 'cash',
                'reference' => 'Customer advance',
                'allocations' => [],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            '/api/finance/cash-movements/'
            .$receiptId
            .'/post',
        )->assertOk();

        $paymentId = $this->postJson(
            '/api/finance/cash-movements',
            [
                'direction' => 'outgoing',
                'party_id' => $partyId,
                'category' => 'supplier_payment',
                'amount' => '60',
                'currency' => 'ILS',
                'movement_date' => '2026-01-04',
                'method' => 'bank_transfer',
                'reference' => 'Supplier advance',
                'allocations' => [],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            '/api/finance/cash-movements/'
            .$paymentId
            .'/post',
        )->assertOk();

        $this->getJson(
            '/api/parties/'
            .$partyId
            .'/account?scope=all&date_from=2026-01-01&date_to=2026-12-31',
        )
            ->assertOk()
            ->assertJsonPath(
                'positions.customer',
                '-10.0000',
            )
            ->assertJsonPath(
                'positions.supplier',
                '-10.0000',
            )
            ->assertJsonPath(
                'positions.net',
                '0.0000',
            )
            ->assertJsonPath(
                'positions.customer_advance',
                '130.0000',
            )
            ->assertJsonPath(
                'positions.supplier_advance',
                '60.0000',
            )
            ->assertJsonPath(
                'summary.closing_balance',
                '0.0000',
            );

        $this->assertDatabaseHas(
            'finance_audit_events',
            [
                'auditable_type' =>
                    'PartyOpeningBalance',
                'action' =>
                    'opening_balance_created',
            ],
        );
    }

}
