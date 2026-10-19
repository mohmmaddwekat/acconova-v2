<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\FinancialDocument;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PaymentCategoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_payment_allocated_to_invoices_always_shows_on_the_supplier_statement(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Category Co']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        $supplierId = $this->postJson('/api/parties', ['type' => 'company', 'company_name' => 'Raw Supplier', 'roles' => ['supplier']])
            ->assertCreated()
            ->json('data.id');

        $tenant = app(TenantContext::class);
        $tenant->set($organization, OrganizationRole::Owner);
        $invoice = FinancialDocument::create([
            'party_id' => $supplierId,
            'kind' => 'purchase_invoice',
            'number' => 'PUR-1',
            'status' => 'issued',
            'issue_date' => '2026-09-01',
            'currency' => 'ILS',
            'total' => '500',
            'paid_total' => '0',
            'balance_due' => '500',
            'credit_total' => '0',
        ]);
        $tenant->clear();

        $movementId = $this->postJson('/api/finance/cash-movements', [
            'direction' => 'outgoing',
            'party_id' => $supplierId,
            'category' => 'raw_material',
            'amount' => '500',
            'currency' => 'ILS',
            'movement_date' => '2026-09-10',
            'method' => 'cash',
            'allocations' => [['financial_document_id' => $invoice->id, 'amount' => '500']],
        ])->assertCreated()->assertJsonPath('data.category', 'supplier_payment')->json('data.id');
        $this->postJson("/api/finance/cash-movements/{$movementId}/post")->assertOk();

        $types = collect($this->getJson("/api/parties/{$supplierId}/account?scope=supplier&date_from=2026-01-01&date_to=2026-10-17")
            ->assertOk()
            ->json('transactions'))->pluck('type');

        $this->assertTrue($types->contains('cash'), 'The payment is missing from the statement: '.$types->implode(','));
    }
}
