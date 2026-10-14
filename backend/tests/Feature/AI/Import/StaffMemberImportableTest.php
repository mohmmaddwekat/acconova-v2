<?php

namespace Tests\Feature\AI\Import;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Services\AI\Import\Entities\StaffMemberImportable;
use App\Services\AI\Import\ImportDestinationCatalog;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use InvalidArgumentException;
use Tests\TestCase;

class StaffMemberImportableTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify the StaffMember wrapper commits rows through the extracted
     * upsert action rather than writing to the database directly.
     */
    public function test_staff_member_importable_commits_via_upsert_action(): void
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
                    'name' => 'Jane Doe',

                    'job_title' => 'Accountant',

                    'phone' => '0599123456',

                    'basis' => 'month',

                    'rate' => '3500',

                    'started_on' => '2024-01-15',
                ],
            ]);

            $result = app(StaffMemberImportable::class)->commit($rows);

            $this->assertSame(
                ['created' => 1, 'updated' => 0, 'skipped' => 0, 'total' => 1],
                $result,
            );

            $this->assertDatabaseHas('staff_members', [
                'name' => 'Jane Doe',
                'job_title' => 'Accountant',
                'phone' => '0599123456',
            ]);
        } finally {
            $context->clear();
        }
    }

    /**
     * Verify a second commit with the same matching phone number updates
     * the existing StaffMember instead of creating a duplicate.
     */
    public function test_staff_member_importable_updates_existing_match_on_second_commit(): void
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
            $row = [
                'name' => 'Jane Doe',

                'phone' => '0599123456',

                'basis' => 'month',

                'rate' => '3500',

                'started_on' => '2024-01-15',
            ];

            app(StaffMemberImportable::class)->commit(collect([$row]));

            $result = app(StaffMemberImportable::class)->commit(collect([$row]));

            $this->assertSame(
                ['created' => 0, 'updated' => 0, 'skipped' => 1, 'total' => 1],
                $result,
            );

            $this->assertDatabaseCount('staff_members', 1);
        } finally {
            $context->clear();
        }
    }

    /**
     * Verify a row that fails validation (missing rate) aborts the whole
     * commit and rolls back any rows already written in the same batch,
     * instead of being silently folded into the "skipped" count. Only the
     * deliberate duplicate-match "skip" result may increment `skipped`;
     * every other failure must surface loudly, matching
     * ImportPartiesFromSpreadsheet::execute()'s all-or-nothing guarantee.
     */
    public function test_staff_member_importable_aborts_commit_on_invalid_row_instead_of_skipping(): void
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
                    'name' => 'Valid Person',

                    'phone' => '0599000000',

                    'basis' => 'month',

                    'rate' => '3000',

                    'started_on' => '2024-01-01',
                ],
                [
                    'name' => 'Missing Rate Person',

                    'phone' => '0599000001',

                    'basis' => 'month',

                    // 'rate' intentionally omitted: this row must abort the
                    // whole commit, not be silently counted as skipped.
                    'started_on' => '2024-01-01',
                ],
            ]);

            $thrown = null;

            try {
                app(StaffMemberImportable::class)->commit($rows);
            } catch (InvalidArgumentException $exception) {
                $thrown = $exception;
            }

            $this->assertNotNull(
                $thrown,
                'Expected an invalid row to abort the commit instead of being silently skipped.',
            );

            $this->assertDatabaseCount('staff_members', 0);
        } finally {
            $context->clear();
        }
    }

    /**
     * Verify preview() reports per-row validation results without writing
     * anything, dry-running UpsertStaffMemberFromImport's checks instead of
     * its write path.
     */
    public function test_preview_reports_valid_and_error_row_counts(): void
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
                    'name' => 'Valid Person',

                    'phone' => '0599000000',

                    'basis' => 'month',

                    'rate' => '3000',

                    'started_on' => '2024-01-01',
                ], // valid
                [
                    'name' => 'Missing Rate Person',

                    'phone' => '0599000001',

                    'basis' => 'month',

                    // 'rate' intentionally omitted: must be reported as an
                    // error row instead of being counted as valid.
                    'started_on' => '2024-01-01',
                ],
            ]);

            $result = app(StaffMemberImportable::class)->preview($rows);

            $this->assertSame(1, $result['valid_rows']);
            $this->assertSame(1, $result['error_rows']);
            $this->assertCount(1, $result['errors']);
            $this->assertSame(3, $result['errors'][0]['row']);
            $this->assertIsString($result['errors'][0]['message']);

            $this->assertDatabaseCount('staff_members', 0);
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
        $user = User::factory()->create(); // no staff.import permission

        $definitions = app(ImportDestinationCatalog::class)->definitionsFor($user);

        $this->assertNotContains('staff_member', array_column($definitions, 'key'));
    }
}
