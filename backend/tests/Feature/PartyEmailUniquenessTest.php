<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartyEmailUniquenessTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Create one organization with the supplied user as its Owner.
     */
    private function organization(
        User $user,
        string $name,
    ): Organization {
        $organization = Organization::create([
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
     * Prevent two Parties inside one organization from sharing the same
     * normalized email address.
     */
    public function test_party_email_is_unique_inside_one_organization(): void
    {
        $user = User::factory()
            ->create();

        $organization =
            $this->organization(
                $user,
                'First Organization',
            );

        $this
            ->actingAs($user)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson(
                '/api/parties',
                [
                    'type' => 'person',
                    'name' => 'First Customer',
                    'email' => 'CUSTOMER@EXAMPLE.COM',

                    'roles' => [
                        'customer',
                    ],
                ],
            )
            ->assertCreated()
            ->assertJsonPath(
                'data.email',
                'customer@example.com',
            );

        $this->postJson(
            '/api/parties',
            [
                'type' => 'person',
                'name' => 'Duplicate Customer',
                'email' => 'customer@example.com',

                'roles' => [
                    'customer',
                ],
            ],
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'email',
            ])
            ->assertJsonPath(
                'errors.email.0',
                'A relationship with this email already exists in this workspace.',
            );

        $this->assertDatabaseCount(
            'parties',
            1,
        );
    }

    /**
     * Allow different tenant organizations to independently work with the
     * same external person or company.
     */
    public function test_same_party_email_is_allowed_in_different_organizations(): void
    {
        $firstUser = User::factory()
            ->create();

        $secondUser = User::factory()
            ->create();

        $firstOrganization =
            $this->organization(
                $firstUser,
                'First Organization',
            );

        $secondOrganization =
            $this->organization(
                $secondUser,
                'Second Organization',
            );

        $this
            ->actingAs($firstUser)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $firstOrganization->id,
            ])
            ->postJson(
                '/api/parties',
                [
                    'type' => 'person',
                    'name' => 'Shared Customer',
                    'email' => 'customer@example.com',

                    'roles' => [
                        'customer',
                    ],
                ],
            )
            ->assertCreated();

        $this
            ->actingAs($secondUser)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $secondOrganization->id,
            ])
            ->postJson(
                '/api/parties',
                [
                    'type' => 'person',
                    'name' => 'Shared Customer',
                    'email' => 'customer@example.com',

                    'roles' => [
                        'customer',
                    ],
                ],
            )
            ->assertCreated();

        $this->assertDatabaseCount(
            'parties',
            2,
        );
    }
}
