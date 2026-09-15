<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartyAddressContractTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify Party creation, reading, and updating all use the same public
     * address_line_1 and address_line_2 API contract.
     */
    public function test_party_address_contract_is_consistent(): void
    {
        $user = User::factory()
            ->create();

        $organization = Organization::create([
            'name' => 'Address Contract Organization',
        ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        $response = $this
            ->actingAs($user)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson(
                '/api/parties',
                [
                    'type' => 'person',
                    'name' => 'Address Tester',

                    'roles' => [
                        'customer',
                    ],

                    'address_line_1' => 'Old Street 10',

                    'address_line_2' => 'Floor 2',

                    'city' => 'Nablus',
                    'country_code' => 'PS',
                ],
            )
            ->assertCreated()
            ->assertJsonPath(
                'data.address_line_1',
                'Old Street 10',
            )
            ->assertJsonPath(
                'data.address_line_2',
                'Floor 2',
            );

        $partyId = $response->json(
            'data.id',
        );

        $this->patchJson(
            "/api/parties/{$partyId}",
            [
                'address_line_1' => 'New Street 20',

                'address_line_2' => 'Office 4',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.address_line_1',
                'New Street 20',
            )
            ->assertJsonPath(
                'data.address_line_2',
                'Office 4',
            );

        $this->assertDatabaseHas(
            'parties',
            [
                'id' => $partyId,

                'address_line_1' => 'New Street 20',

                'address_line_2' => 'Office 4',
            ],
        );
    }
}
