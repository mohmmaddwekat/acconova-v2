<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class WorkflowExpansionFeatureTest extends TestCase
{
    use RefreshDatabase;

    public function test_workspace_custom_fields_and_statuses_are_saved_on_party_records(): void
    {
        [$owner, $organization] =
            $this->workspace(
                'Customization workspace',
            );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $partyId =
            $this->party(
                'customer',
                'Custom Fields Customer',
            );

        $fieldId = (int) $this->postJson(
            '/api/workspace-customization/fields',
            [
                'entity_type' => 'party',
                'key' => 'customer_tier',
                'label' => 'Customer tier',
                'field_type' => 'select',
                'options' => [
                    'VIP',
                    'Standard',
                ],
                'required' => true,
                'position' => 10,
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $statusId = (int) $this->postJson(
            '/api/workspace-customization/statuses',
            [
                'entity_type' => 'party',
                'key' => 'awaiting_signature',
                'label' => 'Awaiting signature',
                'color' => '#3B82F6',
                'is_closed' => false,
                'position' => 10,
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->patchJson(
            "/api/records/party/{$partyId}/customization",
            [
                'values' => [
                    (string) $fieldId => 'VIP',
                ],
                'status_id' => $statusId,
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'values.'.$fieldId,
                'VIP',
            )
            ->assertJsonPath(
                'status_id',
                $statusId,
            );

        $this->getJson(
            "/api/records/party/{$partyId}/customization",
        )
            ->assertOk()
            ->assertJsonPath(
                'values.'.$fieldId,
                'VIP',
            )
            ->assertJsonPath(
                'status_id',
                $statusId,
            );
    }

    public function test_party_bulk_edit_is_atomic_and_recorded_in_history(): void
    {
        [$owner, $organization] =
            $this->workspace(
                'Bulk edit workspace',
            );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $firstId =
            $this->party(
                'customer',
                'Bulk Customer One',
            );
        $secondId =
            $this->party(
                'supplier',
                'Bulk Supplier Two',
            );

        $this->postJson(
            '/api/parties/bulk-edit',
            [
                'party_ids' => [
                    $firstId,
                    $secondId,
                ],
                'changes' => [
                    'city' => 'Nablus',
                    'country_code' => 'ps',
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
                'id' => $firstId,
                'city' => 'Nablus',
                'country_code' => 'PS',
            ],
        );
        $this->assertDatabaseHas(
            'parties',
            [
                'id' => $secondId,
                'city' => 'Nablus',
                'country_code' => 'PS',
            ],
        );

        $this->getJson(
            '/api/bulk-action-history?entity_type=party&action=bulk_edit',
        )
            ->assertOk()
            ->assertJsonPath(
                'data.0.action',
                'bulk_edit',
            )
            ->assertJsonPath(
                'data.0.record_count',
                2,
            )
            ->assertJsonPath(
                'data.0.changes.city',
                'Nablus',
            );
    }

    public function test_scheduled_report_can_be_created_and_run_immediately(): void
    {
        [$owner, $organization] =
            $this->workspace(
                'Scheduled reports workspace',
            );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $scheduleId = (int) $this->postJson(
            '/api/scheduled-reports',
            [
                'name' => 'Daily sales',
                'report_type' => 'sales_summary',
                'cadence' => 'daily',
                'run_hour' => 8,
                'recipient_user_ids' => [
                    $owner->id,
                ],
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $runId = (int) $this->postJson(
            "/api/scheduled-reports/{$scheduleId}/run",
        )
            ->assertCreated()
            ->json('data.run_id');

        $this->assertDatabaseHas(
            'scheduled_report_runs',
            [
                'id' => $runId,
                'scheduled_report_id' => $scheduleId,
                'report_type' => 'sales_summary',
            ],
        );

        $this->getJson(
            '/api/scheduled-reports',
        )
            ->assertOk()
            ->assertJsonPath(
                'runs.0.id',
                $runId,
            );
    }

    public function test_custom_approval_rule_can_require_two_independent_reviewers(): void
    {
        [$owner, $organization] =
            $this->workspace(
                'Multi approval workspace',
            );

        $reviewerOne =
            User::factory()
                ->create();
        $reviewerTwo =
            User::factory()
                ->create();

        $organization->users()
            ->attach(
                $reviewerOne->id,
                [
                    'role' => 'admin',
                ],
            );
        $organization->users()
            ->attach(
                $reviewerTwo->id,
                [
                    'role' => 'admin',
                ],
            );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $this->postJson(
            '/api/workspace-customization/approval-rules',
            [
                'name' => 'Two reviewers above 100',
                'subject_type' => 'financial_document',
                'condition_field' => 'total',
                'operator' => 'gte',
                'threshold' => '100',
                'required_approvals' => 2,
                'priority' => 10,
            ],
        )->assertCreated();

        $customerId =
            $this->party(
                'customer',
                'Approval Customer',
            );

        $documentId =
            $this->document(
                'sale_invoice',
                $customerId,
                '200',
            );

        $this->postJson(
            "/api/finance/documents/{$documentId}/issue",
            [
                'acknowledge_warnings' => false,
            ],
        )
            ->assertUnprocessable()
            ->assertJsonValidationErrors(
                'approval',
            );

        $approvalId = (int) DB::table(
            'approval_requests',
        )
            ->where(
                'organization_id',
                $organization->id,
            )
            ->where(
                'subject_type',
                'financial_document',
            )
            ->where(
                'subject_id',
                $documentId,
            )
            ->where(
                'category',
                'like',
                'custom_rule_%',
            )
            ->value('id');

        $this->actingInWorkspace(
            $reviewerOne,
            $organization,
        );

        $this->patchJson(
            "/api/approval-requests/{$approvalId}",
            [
                'decision' => 'approved',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'pending',
            )
            ->assertJsonPath(
                'data.approved_count',
                1,
            );

        $this->actingInWorkspace(
            $reviewerTwo,
            $organization,
        );

        $this->patchJson(
            "/api/approval-requests/{$approvalId}",
            [
                'decision' => 'approved',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'approved',
            )
            ->assertJsonPath(
                'data.approved_count',
                2,
            );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $this->postJson(
            "/api/finance/documents/{$documentId}/issue",
            [
                'acknowledge_warnings' => false,
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'issued',
            );
    }

    /** @return array{0: User, 1: Organization} */
    private function workspace(
        string $name,
    ): array {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => $name,
            ]);

        $organization->users()
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

    private function actingInWorkspace(
        User $user,
        Organization $organization,
    ): void {
        $this->actingAs(
            $user,
        )->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);
    }

    private function party(
        string $role,
        string $name,
    ): int {
        return (int) $this->postJson(
            '/api/parties',
            [
                'type' => 'company',
                'company_name' => $name,
                'roles' => [
                    $role,
                ],
            ],
        )
            ->assertCreated()
            ->json('data.id');
    }

    private function document(
        string $kind,
        int $partyId,
        string $unitPrice,
    ): int {
        return (int) $this->postJson(
            '/api/finance/documents',
            [
                'kind' => $kind,
                'party_id' => $partyId,
                'issue_date' => today()->toDateString(),
                'currency' => 'ILS',
                'lines' => [
                    [
                        'description' => 'Approval test service',
                        'quantity' => '1',
                        'unit' => 'service',
                        'unit_price' => $unitPrice,
                        'discount_percent' => '0',
                        'tax_rate' => '0',
                        'affects_inventory' => false,
                    ],
                ],
            ],
        )
            ->assertCreated()
            ->json('data.id');
    }
}
