<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InvoiceGeneralDiscountTest extends TestCase
{
    use RefreshDatabase;

    public function test_invoice_wide_percent_discount_is_spread_over_lines_and_tax_follows(): void
    {
        $partyId = $this->signInAndCreateCustomer();

        $response = $this->postJson('/api/finance/documents', $this->payload($partyId, [
            'document_discount_type' => 'percent',
            'document_discount_value' => '10',
        ]))->assertCreated();

        $response->assertJsonPath('data.subtotal', '570.0000')
            ->assertJsonPath('data.discount_total', '57.0000')
            ->assertJsonPath('data.document_discount_type', 'percent')
            ->assertJsonPath('data.document_discount_value', '10.0000');

        // 513 after discount + 16% tax = 595.08
        $response->assertJsonPath('data.total', '595.0800');
    }

    public function test_fixed_discount_stacks_with_line_discount_and_is_kept_on_update(): void
    {
        $partyId = $this->signInAndCreateCustomer();

        $payload = $this->payload($partyId, [
            'document_discount_type' => 'fixed',
            'document_discount_value' => '70',
        ]);
        $payload['lines'][0]['discount_type'] = 'fixed';
        $payload['lines'][0]['discount_value'] = '30';

        $id = (int) $this->postJson('/api/finance/documents', $payload)
            ->assertCreated()
            ->assertJsonPath('data.discount_total', '100.0000')
            ->json('data.id');

        // Editing the draft without a general discount removes it again.
        $payload['document_discount_value'] = '0';
        $this->patchJson('/api/finance/documents/'.$id, $payload)
            ->assertOk()
            ->assertJsonPath('data.discount_total', '30.0000');
    }

    public function test_invoice_discount_cannot_exceed_the_invoice_value(): void
    {
        $partyId = $this->signInAndCreateCustomer();

        $this->postJson('/api/finance/documents', $this->payload($partyId, [
            'document_discount_type' => 'fixed',
            'document_discount_value' => '9999',
        ]))->assertUnprocessable();
    }

    private function signInAndCreateCustomer(): int
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Discount workspace']);
        $organization->users()->attach($user->id, ['role' => 'owner']);

        $this->actingAs($user)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);

        return (int) $this->postJson('/api/parties', [
            'type' => 'company',
            'company_name' => 'Discount customer',
            'roles' => ['customer'],
        ])->assertCreated()->json('data.id');
    }

    /**
     * @param  array<string, string>  $extra
     * @return array<string, mixed>
     */
    private function payload(int $partyId, array $extra): array
    {
        $line = fn (string $name, string $qty, string $price): array => [
            'description' => $name,
            'quantity' => $qty,
            'unit' => 'unit',
            'unit_price' => $price,
            'discount_percent' => '0',
            'tax_rate' => '16',
            'affects_inventory' => false,
        ];

        return [
            'kind' => 'sale_invoice',
            'party_id' => $partyId,
            'issue_date' => today()->toDateString(),
            'currency' => 'ILS',
            'exchange_rate' => '1',
            'lines' => [
                $line('Soap', '20', '8.5'),
                $line('Powder', '10', '22'),
                $line('Dish liquid', '30', '6'),
            ],
            ...$extra,
        ];
    }
}
