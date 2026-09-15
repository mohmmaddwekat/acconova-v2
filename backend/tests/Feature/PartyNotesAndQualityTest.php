<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartyNotesAndQualityTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Prepare an Owner with one active workspace.
     *
     * @return array{0: User, 1: Organization}
     */
    private function ownerWorkspace(): array
    {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => 'Quality Workspace',
            ]);

        $organization
            ->users()
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

    /**
     * Verify internal notes can be updated on an active Party.
     */
    public function test_owner_can_update_internal_party_notes(): void
    {
        [
            $user,
            $organization,
        ] = $this->ownerWorkspace();

        $this
            ->actingAs($user)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $partyId =
            $this
                ->postJson(
                    '/api/parties',
                    [
                        'type' => 'person',

                        'name' => 'Notes Customer',

                        'roles' => [
                            'customer',
                        ],
                    ],
                )
                ->assertCreated()
                ->json(
                    'data.id',
                );

        $this->patchJson(
            "/api/parties/{$partyId}/notes",
            [
                'notes' => 'Prefers invoices by email and follows up on Mondays.',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.notes',
                'Prefers invoices by email and follows up on Mondays.',
            );

        $this->assertDatabaseHas(
            'parties',
            [
                'id' => $partyId,

                'notes' => 'Prefers invoices by email and follows up on Mondays.',
            ],
        );
    }

    /**
     * Verify archived Parties become read-only until restored.
     */
    public function test_archived_party_notes_cannot_be_changed(): void
    {
        [
            $user,
            $organization,
        ] = $this->ownerWorkspace();

        $this
            ->actingAs($user)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $partyId =
            $this
                ->postJson(
                    '/api/parties',
                    [
                        'type' => 'person',

                        'name' => 'Archived Notes Customer',

                        'roles' => [
                            'customer',
                        ],
                    ],
                )
                ->assertCreated()
                ->json(
                    'data.id',
                );

        $this->deleteJson(
            "/api/parties/{$partyId}",
        )->assertNoContent();

        $this->patchJson(
            "/api/parties/{$partyId}/notes",
            [
                'notes' => 'This should not be saved.',
            ],
        )->assertNotFound();
    }

    /**
     * Verify Party contact-quality filters identify incomplete legacy records.
     */
    public function test_party_contact_quality_filters_work(): void
    {
        [
            $user,
            $organization,
        ] = $this->ownerWorkspace();

        $this
            ->actingAs($user)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $this->postJson(
            '/api/parties',
            [
                'type' => 'person',

                'name' => 'Complete Contact',

                'email' => 'complete@example.com',

                'phone' => '+970590000001',

                'roles' => [
                    'customer',
                ],
            ],
        )->assertCreated();

        $this->postJson(
            '/api/parties',
            [
                'type' => 'person',

                'name' => 'Missing Email',

                'phone' => '+970590000002',

                'roles' => [
                    'customer',
                ],
            ],
        )->assertCreated();

        $this->postJson(
            '/api/parties',
            [
                'type' => 'person',

                'name' => 'Missing Phone',

                'email' => 'missing-phone@example.com',

                'roles' => [
                    'customer',
                ],
            ],
        )->assertCreated();

        $this->postJson(
            '/api/parties',
            [
                'type' => 'person',

                'name' => 'Missing Both',

                'roles' => [
                    'customer',
                ],
            ],
        )->assertCreated();

        $this->getJson(
            '/api/parties?contact=complete',
        )
            ->assertOk()
            ->assertJsonCount(
                1,
                'data',
            )
            ->assertJsonPath(
                'data.0.name',
                'Complete Contact',
            );

        $this->getJson(
            '/api/parties?contact=missing_email',
        )
            ->assertOk()
            ->assertJsonCount(
                2,
                'data',
            );

        $this->getJson(
            '/api/parties?contact=missing_phone',
        )
            ->assertOk()
            ->assertJsonCount(
                2,
                'data',
            );

        $this->getJson(
            '/api/parties?contact=missing_both',
        )
            ->assertOk()
            ->assertJsonCount(
                1,
                'data',
            )
            ->assertJsonPath(
                'data.0.name',
                'Missing Both',
            );
    }
}
