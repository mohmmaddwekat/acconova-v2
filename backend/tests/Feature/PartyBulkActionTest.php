<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartyBulkActionTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Create one owner organization for bulk-action tests.
     */
    private function organization(
        User $user,
        string $name,
    ): Organization {
        $organization =
            Organization::create([
                'name' => $name,
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        return $organization;
    }

    /**
     * Verify an Owner can archive and restore multiple Parties atomically.
     */
    public function test_owner_can_bulk_archive_and_restore_parties(): void
    {
        $user =
            User::factory()
                ->create();

        $organization =
            $this->organization(
                $user,
                'Bulk Workspace',
            );

        $this
            ->actingAs($user)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $first = $this
            ->postJson(
                '/api/parties',
                [
                    'type' => 'person',

                    'name' => 'First Bulk Party',

                    'roles' => [
                        'customer',
                    ],
                ],
            )
            ->assertCreated()
            ->json('data.id');

        $second = $this
            ->postJson(
                '/api/parties',
                [
                    'type' => 'company',

                    'company_name' => 'Second Bulk Party',

                    'roles' => [
                        'supplier',
                    ],
                ],
            )
            ->assertCreated()
            ->json('data.id');

        $this->postJson(
            '/api/parties/bulk',
            [
                'action' => 'archive',

                'party_ids' => [
                    $first,
                    $second,
                ],
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.affected',
                2,
            );

        $this->assertSoftDeleted(
            'parties',
            [
                'id' => $first,
            ],
        );

        $this->assertSoftDeleted(
            'parties',
            [
                'id' => $second,
            ],
        );

        $this->postJson(
            '/api/parties/bulk',
            [
                'action' => 'restore',

                'party_ids' => [
                    $first,
                    $second,
                ],
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.affected',
                2,
            );

        $this->assertDatabaseHas(
            'parties',
            [
                'id' => $first,

                'deleted_at' => null,
            ],
        );

        $this->assertDatabaseHas(
            'parties',
            [
                'id' => $second,

                'deleted_at' => null,
            ],
        );
    }

    /**
     * Verify bulk operations reject selected IDs outside the active tenant.
     */
    public function test_bulk_action_cannot_cross_tenant_boundary(): void
    {
        $firstUser =
            User::factory()
                ->create();

        $secondUser =
            User::factory()
                ->create();

        $firstOrganization =
            $this->organization(
                $firstUser,
                'First Tenant',
            );

        $secondOrganization =
            $this->organization(
                $secondUser,
                'Second Tenant',
            );

        $this
            ->actingAs(
                $secondUser,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $secondOrganization->id,
            ]);

        $foreignPartyId =
            $this
                ->postJson(
                    '/api/parties',
                    [
                        'type' => 'person',

                        'name' => 'Foreign Party',

                        'roles' => [
                            'customer',
                        ],
                    ],
                )
                ->assertCreated()
                ->json(
                    'data.id',
                );

        $this
            ->actingAs(
                $firstUser,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $firstOrganization->id,
            ])
            ->postJson(
                '/api/parties/bulk',
                [
                    'action' => 'archive',

                    'party_ids' => [
                        $foreignPartyId,
                    ],
                ],
            )
            ->assertNotFound();

        $this->assertDatabaseHas(
            'parties',
            [
                'id' => $foreignPartyId,

                'deleted_at' => null,
            ],
        );
    }

    /**
     * Verify Accountants cannot bulk archive Parties.
     */
    public function test_accountant_cannot_bulk_archive_parties(): void
    {
        $owner =
            User::factory()
                ->create();

        $accountant =
            User::factory()
                ->create();

        $organization =
            $this->organization(
                $owner,
                'Permission Workspace',
            );

        $organization
            ->users()
            ->attach(
                $accountant->id,
                [
                    'role' => 'accountant',
                ],
            );

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $partyId =
            $this
                ->postJson(
                    '/api/parties',
                    [
                        'type' => 'person',

                        'name' => 'Protected Party',

                        'roles' => [
                            'customer',
                        ],
                    ],
                )
                ->assertCreated()
                ->json(
                    'data.id',
                );

        $this
            ->actingAs(
                $accountant,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson(
                '/api/parties/bulk',
                [
                    'action' => 'archive',

                    'party_ids' => [
                        $partyId,
                    ],
                ],
            )
            ->assertForbidden();

        $this->assertDatabaseHas(
            'parties',
            [
                'id' => $partyId,

                'deleted_at' => null,
            ],
        );
    }
}
