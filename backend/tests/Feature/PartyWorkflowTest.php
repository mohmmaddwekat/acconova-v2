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
}
