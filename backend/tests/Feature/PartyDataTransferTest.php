<?php

namespace Tests\Feature;

use App\Actions\Parties\ImportPartiesFromSpreadsheet;
use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartyDataTransferTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify full-dataset print export ignores interactive pagination while
     * preserving active filters.
     */
    public function test_print_export_contains_all_filtered_rows_not_only_current_page(): void
    {
        $user = User::factory()
            ->create();

        $organization =
            Organization::create([
                'name' => 'Export Workspace',
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        $this
            ->actingAs($user)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        foreach (
            [
                'Alpha Customer',
                'Beta Customer',
                'Gamma Customer',
            ] as $index => $name
        ) {
            $this->postJson(
                '/api/parties',
                [
                    'type' => 'person',

                    'name' => $name,

                    'email' => "customer{$index}@example.com",

                    'roles' => [
                        'customer',
                    ],
                ],
            )->assertCreated();
        }

        /*
         * per_page=1 would normally show one record, but export endpoints must
         * include the complete filtered dataset.
         */
        $this->get(
            '/api/parties/export/print?role=customer&per_page=1',
        )
            ->assertOk()
            ->assertSee(
                'Alpha Customer',
            )
            ->assertSee(
                'Beta Customer',
            )
            ->assertSee(
                'Gamma Customer',
            );
    }

    /**
     * Verify the PDF export returns a real PDF response for Unicode-capable
     * business reports.
     */
    public function test_party_pdf_export_returns_pdf_document(): void
    {
        $user = User::factory()
            ->create();

        $organization =
            Organization::create([
                'name' => 'PDF Workspace',
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        $this
            ->actingAs($user)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->get(
                '/api/parties/export/pdf?locale=ar',
            )
            ->assertOk()
            ->assertHeader(
                'content-type',
                'application/pdf',
            );
    }

    /**
     * Verify the import analyzer previews and commits valid legacy Party rows.
     */
    public function test_party_import_action_previews_and_imports_rows(): void
    {
        $user = User::factory()
            ->create();

        $organization =
            Organization::create([
                'name' => 'Import Workspace',
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        $context =
            app(
                TenantContext::class,
            );

        $context->set(
            $organization,
            OrganizationRole::Owner,
        );

        try {
            $rows = collect([
                [
                    'type' => 'person',

                    'name' => 'Imported Customer',

                    'company_name' => null,

                    'email' => 'import@example.com',

                    'phone' => '+970590000000',

                    'roles' => 'customer',
                ],
                [
                    'type' => 'company',

                    'name' => null,

                    'company_name' => 'Imported Supplier',

                    'email' => 'supplier@example.com',

                    'roles' => 'supplier',
                ],
            ]);

            $action =
                app(
                    ImportPartiesFromSpreadsheet::class,
                );

            $preview =
                $action->preview(
                    $rows,
                    'skip',
                );

            $this->assertSame(
                2,
                $preview['total_rows'],
            );

            $this->assertSame(
                0,
                $preview['error_rows'],
            );

            $result =
                $action->execute(
                    $rows,
                    'skip',
                );

            $this->assertSame(
                2,
                $result['created'],
            );

            $this->assertDatabaseHas(
                'parties',
                [
                    'email' => 'import@example.com',
                ],
            );

            $this->assertDatabaseHas(
                'parties',
                [
                    'email' => 'supplier@example.com',
                ],
            );
        } finally {
            $context->clear();
        }
    }
}
