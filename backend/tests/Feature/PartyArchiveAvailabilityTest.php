<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Party;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartyArchiveAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify archived Parties remain stored for history but become unavailable
     * for new business until they are explicitly restored.
     */
    public function test_archived_party_cannot_be_used_for_new_business_until_restored(): void
    {
        $user = User::factory()
            ->create();

        $organization =
            Organization::create([
                'name' => 'Archive Workspace',
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

                    'name' => 'Historical Customer',

                    'email' => 'historical@example.com',

                    'roles' => [
                        'customer',
                    ],
                ],
            )
            ->assertCreated();

        $partyId =
            $response->json(
                'data.id',
            );

        $activeParty =
            Party::query()
                ->withoutGlobalScopes()
                ->findOrFail(
                    $partyId,
                );

        $this->assertTrue(
            $activeParty
                ->isUsableForNewBusiness(),
        );

        $this->deleteJson(
            "/api/parties/{$partyId}",
        )->assertNoContent();

        /*
         * Removing global scopes allows the test to inspect the archived row
         * directly while the explicit business-availability scope must still
         * exclude it from new operations.
         */
        $archivedParty =
            Party::query()
                ->withoutGlobalScopes()
                ->findOrFail(
                    $partyId,
                );

        $this->assertTrue(
            $archivedParty
                ->trashed(),
        );

        $this->assertFalse(
            $archivedParty
                ->isUsableForNewBusiness(),
        );

        $this->assertFalse(
            Party::query()
                ->withoutGlobalScopes()
                ->usableForNewBusiness()
                ->whereKey(
                    $partyId,
                )
                ->exists(),
        );

        $this->postJson(
            "/api/parties/{$partyId}/restore",
        )->assertOk();

        $restoredParty =
            Party::query()
                ->withoutGlobalScopes()
                ->findOrFail(
                    $partyId,
                );

        $this->assertFalse(
            $restoredParty
                ->trashed(),
        );

        $this->assertTrue(
            $restoredParty
                ->isUsableForNewBusiness(),
        );
    }
}
