<?php

namespace Tests\Feature\AI\Import;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Services\AI\Import\Entities\PartyImportable;
use App\Services\AI\Import\ImportDestinationCatalog;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartyImportableTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify the Party wrapper commits rows through the existing import
     * action rather than writing to the database directly.
     */
    public function test_party_importable_commits_via_existing_import_action(): void
    {
        $user = User::factory()->create();

        $organization = Organization::create([
            'name' => 'Import Workspace',
        ]);

        $organization->users()->attach(
            $user->id,
            ['role' => 'owner'],
        );

        $context = app(TenantContext::class);

        $context->set($organization, OrganizationRole::Owner);

        try {
            $rows = collect([
                [
                    'type' => 'person',

                    'name' => 'Acme Co',

                    'roles' => 'customer',
                ],
            ]);

            $result = app(PartyImportable::class)->commit($rows);

            $this->assertSame(
                ['created' => 1, 'updated' => 0, 'skipped' => 0, 'total' => 1],
                $result,
            );

            $this->assertDatabaseHas('parties', ['name' => 'Acme Co']);
        } finally {
            $context->clear();
        }
    }

    /**
     * Verify the catalog filters out entities the user lacks permission to
     * import into, rather than exposing every registered destination.
     */
    public function test_catalog_hides_entries_the_user_cannot_import_to(): void
    {
        $user = User::factory()->create(); // no parties.import.commit permission

        $definitions = app(ImportDestinationCatalog::class)->definitionsFor($user);

        $this->assertNotContains('party', array_column($definitions, 'key'));
    }
}
