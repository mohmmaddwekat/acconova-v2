<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Services\NotificationRuleService;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class BusinessIntelligenceBuilderFeatureTest extends TestCase
{
    use RefreshDatabase;

    public function test_report_builder_runs_and_saves_a_sales_report(): void
    {
        [$owner, $organization] =
            $this->workspace(
                'Report builder workspace',
            );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $customerId =
            $this->party(
                'customer',
                'Builder Customer',
            );

        $documentId =
            $this->document(
                $customerId,
                '250',
            );

        $this->postJson(
            "/api/finance/documents/{$documentId}/issue",
            [
                'acknowledge_warnings' =>
                    false,
            ],
        )->assertOk();

        $definition = [
            'dataset' =>
                'sales_invoices',
            'columns' => [
                'number',
                'party',
                'status',
                'total',
            ],
            'filters' => [
                [
                    'field' =>
                        'status',
                    'operator' =>
                        'eq',
                    'value' =>
                        'issued',
                ],
            ],
            'group_by' =>
                'status',
            'sort_by' =>
                'number',
            'sort_direction' =>
                'asc',
        ];

        $this->postJson(
            '/api/report-builder/run',
            $definition,
        )
            ->assertOk()
            ->assertJsonPath(
                'data.group_by',
                'status',
            )
            ->assertJsonPath(
                'data.groups.0.key',
                'issued',
            )
            ->assertJsonPath(
                'data.groups.0.count',
                1,
            );

        $reportId = (int) $this->postJson(
            '/api/report-builder',
            [
                ...$definition,
                'name' =>
                    'Issued sales',
                'shared' =>
                    true,
            ],
        )
            ->assertCreated()
            ->json('data.id');

        $this->getJson(
            '/api/report-builder',
        )
            ->assertOk()
            ->assertJsonPath(
                'reports.0.id',
                $reportId,
            )
            ->assertJsonPath(
                'reports.0.can_edit',
                true,
            );
    }

    public function test_dashboard_preferences_and_kpi_progress_are_persisted(): void
    {
        [$owner, $organization] =
            $this->workspace(
                'Dashboard builder workspace',
            );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $customerId =
            $this->party(
                'customer',
                'KPI Customer',
            );

        $documentId =
            $this->document(
                $customerId,
                '200',
            );

        $this->postJson(
            "/api/finance/documents/{$documentId}/issue",
            [
                'acknowledge_warnings' =>
                    false,
            ],
        )->assertOk();

        $this->postJson(
            '/api/dashboard-intelligence/kpi-targets',
            [
                'metric' =>
                    'sales_revenue',
                'period' =>
                    'monthly',
                'target_value' =>
                    '1000',
                'currency' =>
                    'ILS',
            ],
        )->assertCreated();

        $this->patchJson(
            '/api/dashboard-intelligence/preferences',
            [
                'layout' => [
                    'kpi_targets',
                    'exceptions',
                    'morning_actions',
                ],
                'exception_only' =>
                    true,
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.exception_only',
                true,
            )
            ->assertJsonPath(
                'data.layout.0',
                'kpi_targets',
            );

        $response =
            $this->getJson(
                '/api/dashboard-intelligence',
            )
                ->assertOk()
                ->assertJsonPath(
                    'data.preferences.exception_only',
                    true,
                );

        $target = collect(
            $response->json(
                'data.kpi_targets',
            ),
        )->firstWhere(
            'metric',
            'sales_revenue',
        );

        $this->assertNotNull(
            $target,
        );
        $this->assertEqualsWithDelta(
            20.0,
            (float) $target[
                'achievement_percent'
            ],
            0.01,
        );
        $this->assertSame(
            '200.0000',
            $response->json(
                'data.profitability.revenue',
            ),
        );
    }

    public function test_notification_rule_filters_thresholds_and_digest_groups_unread_items(): void
    {
        [$owner, $organization] =
            $this->workspace(
                'Notification intelligence workspace',
            );

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $this->postJson(
            '/api/notification-rules',
            [
                'name' =>
                    'Large approvals only',
                'category' =>
                    'activity',
                'kind' =>
                    'approval_required',
                'field' =>
                    'invoice_total',
                'operator' =>
                    'gt',
                'threshold' =>
                    '5000',
                'active' =>
                    true,
            ],
        )->assertCreated();

        $rules =
            app(
                NotificationRuleService::class,
            );

        $this->assertFalse(
            $rules->allows(
                $organization->id,
                $owner->id,
                'approval_required',
                'activity',
                [
                    'invoice_total' =>
                        4000,
                ],
            ),
        );

        $this->assertTrue(
            $rules->allows(
                $organization->id,
                $owner->id,
                'approval_required',
                'activity',
                [
                    'invoice_total' =>
                        7000,
                ],
            ),
        );

        DB::table(
            'workspace_notifications',
        )->insert([
            [
                'organization_id' =>
                    $organization->id,
                'user_id' =>
                    $owner->id,
                'event_key' =>
                    'digest-stock-1',
                'kind' =>
                    'low_stock',
                'category' =>
                    'stock',
                'data' =>
                    json_encode([
                        'name' =>
                            'Product A',
                    ], JSON_THROW_ON_ERROR),
                'url' =>
                    '/app/inventory',
                'read_at' =>
                    null,
                'created_at' =>
                    now(),
                'updated_at' =>
                    now(),
            ],
            [
                'organization_id' =>
                    $organization->id,
                'user_id' =>
                    $owner->id,
                'event_key' =>
                    'digest-stock-2',
                'kind' =>
                    'out_of_stock',
                'category' =>
                    'stock',
                'data' =>
                    json_encode([
                        'name' =>
                            'Product B',
                    ], JSON_THROW_ON_ERROR),
                'url' =>
                    '/app/inventory',
                'read_at' =>
                    null,
                'created_at' =>
                    now(),
                'updated_at' =>
                    now(),
            ],
        ]);

        $this->getJson(
            '/api/notifications/digest',
        )
            ->assertOk()
            ->assertJsonPath(
                'data.total_unread',
                2,
            )
            ->assertJsonPath(
                'data.groups.0.category',
                'stock',
            )
            ->assertJsonPath(
                'data.groups.0.count',
                2,
            );
    }

    public function test_dashboard_uses_previous_login_as_change_boundary(): void
    {
        [$owner, $organization] =
            $this->workspace(
                'Previous login workspace',
            );

        $owner->forceFill([
            'previous_login_at' =>
                now()->subHours(2),
            'last_login_at' =>
                now(),
        ])->save();

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        DB::table(
            'bulk_action_history',
        )->insert([
            'organization_id' =>
                $organization->id,
            'user_id' =>
                $owner->id,
            'entity_type' =>
                'party',
            'action' =>
                'bulk_edit',
            'record_count' =>
                2,
            'record_ids' =>
                json_encode(
                    [1, 2],
                    JSON_THROW_ON_ERROR,
                ),
            'changes' =>
                json_encode(
                    [
                        'city' =>
                            'Nablus',
                    ],
                    JSON_THROW_ON_ERROR,
                ),
            'created_at' =>
                now()->subHour(),
        ]);

        $this->getJson(
            '/api/dashboard-intelligence',
        )
            ->assertOk()
            ->assertJsonPath(
                'data.changed_today.0.kind',
                'bulk',
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
                'name' =>
                    $name,
            ]);

        $organization->users()
            ->attach(
                $user->id,
                [
                    'role' =>
                        'owner',
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
            OrganizationAccess::SESSION_KEY =>
                $organization->id,
        ]);
    }

    private function party(
        string $role,
        string $name,
    ): int {
        return (int) $this->postJson(
            '/api/parties',
            [
                'type' =>
                    'company',
                'company_name' =>
                    $name,
                'roles' => [
                    $role,
                ],
            ],
        )
            ->assertCreated()
            ->json('data.id');
    }

    private function document(
        int $partyId,
        string $unitPrice,
    ): int {
        return (int) $this->postJson(
            '/api/finance/documents',
            [
                'kind' =>
                    'sale_invoice',
                'party_id' =>
                    $partyId,
                'issue_date' =>
                    today()
                        ->toDateString(),
                'currency' =>
                    'ILS',
                'lines' => [
                    [
                        'description' =>
                            'BI service',
                        'quantity' =>
                            '1',
                        'unit' =>
                            'service',
                        'unit_price' =>
                            $unitPrice,
                        'discount_percent' =>
                            '0',
                        'tax_rate' =>
                            '0',
                        'affects_inventory' =>
                            false,
                    ],
                ],
            ],
        )
            ->assertCreated()
            ->json('data.id');
    }
}
