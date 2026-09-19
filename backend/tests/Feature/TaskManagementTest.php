<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Department;
use App\Models\Organization;
use App\Models\StaffMember;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaskManagementTest extends TestCase
{
    use RefreshDatabase;

    private function workspace(): Organization
    {
        $user = User::factory()->create();
        $organization = Organization::create([
            'name' => 'Task management test',
        ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        app(TenantContext::class)->set(
            $organization,
            OrganizationRole::Owner,
        );

        $this
            ->actingAs(
                $user,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        return $organization;
    }

    private function employee(
        Department $department,
        string $name,
    ): StaffMember {
        return StaffMember::create([
            'name' => $name,
            'department_id' => $department->id,
            'basis' => 'month',
            'rate' => '1000',
            'monthly_allowance' => '0',
            'currency' => 'ILS',
            'started_on' => '2026-01-01',
            'active' => true,
        ]);
    }

    public function test_owner_can_create_update_and_transfer_team_members(): void
    {
        $this->workspace();

        $department = Department::create([
            'name' => 'Sales',
        ]);

        $lead = $this->employee(
            $department,
            'Team Lead',
        );

        $member = $this->employee(
            $department,
            'Sales Member',
        );

        $firstTeam =
            $this
                ->postJson(
                    '/api/task-management/teams',
                    [
                        'name' => 'Sales Alpha',
                        'description' => 'Primary sales team',
                        'department_id' => $department->id,
                        'leader_id' => $lead->id,
                        'capacity' => 4,
                        'priority' => 'medium',
                        'member_ids' => [
                            $lead->id,
                            $member->id,
                        ],
                        'project_ids' => [],
                    ],
                )
                ->assertCreated()
                ->assertJsonPath(
                    'team.name',
                    'Sales Alpha',
                )
                ->json(
                    'team.id',
                );

        $secondTeam =
            $this
                ->postJson(
                    '/api/task-management/teams',
                    [
                        'name' => 'Sales Beta',
                        'department_id' => $department->id,
                        'leader_id' => $lead->id,
                        'capacity' => 4,
                        'priority' => 'low',
                        'member_ids' => [
                            $lead->id,
                        ],
                        'project_ids' => [],
                    ],
                )
                ->assertCreated()
                ->json(
                    'team.id',
                );

        $this
            ->patchJson(
                '/api/task-management/teams/'.$firstTeam,
                [
                    'priority' => 'high',
                    'capacity' => 5,
                ],
            )
            ->assertOk()
            ->assertJsonPath(
                'team.priority',
                'high',
            )
            ->assertJsonPath(
                'team.capacity',
                5,
            );

        $this
            ->postJson(
                '/api/task-management/teams/'.$firstTeam.'/transfer-member',
                [
                    'staff_member_id' => $member->id,
                    'target_team_id' => $secondTeam,
                ],
            )
            ->assertOk()
            ->assertJsonPath(
                'transferred',
                true,
            );

        $this->assertDatabaseMissing(
            'task_team_members',
            [
                'task_team_id' => $firstTeam,
                'staff_member_id' => $member->id,
            ],
        );

        $this->assertDatabaseHas(
            'task_team_members',
            [
                'task_team_id' => $secondTeam,
                'staff_member_id' => $member->id,
            ],
        );
    }

    public function test_team_lead_cannot_be_removed_without_reassignment(): void
    {
        $this->workspace();

        $department = Department::create([
            'name' => 'Engineering',
        ]);

        $lead = $this->employee(
            $department,
            'Engineering Lead',
        );

        $member = $this->employee(
            $department,
            'Engineer',
        );

        $team =
            $this
                ->postJson(
                    '/api/task-management/teams',
                    [
                        'name' => 'Platform',
                        'department_id' => $department->id,
                        'leader_id' => $lead->id,
                        'capacity' => 3,
                        'priority' => 'medium',
                        'member_ids' => [
                            $lead->id,
                            $member->id,
                        ],
                        'project_ids' => [],
                    ],
                )
                ->assertCreated()
                ->json(
                    'team.id',
                );

        $this
            ->patchJson(
                '/api/task-management/teams/'.$team,
                [
                    'member_ids' => [
                        $member->id,
                    ],
                ],
            )
            ->assertUnprocessable();

        $this->assertDatabaseHas(
            'task_team_members',
            [
                'task_team_id' => $team,
                'staff_member_id' => $lead->id,
            ],
        );
    }

    public function test_teams_can_be_nested_recursively_and_cycles_are_rejected(): void
    {
        $this->workspace();

        $department = Department::create([
            'name' => 'Sales',
        ]);

        $lead = $this->employee(
            $department,
            'Sales Lead',
        );

        $root =
            $this
                ->postJson(
                    '/api/task-management/teams',
                    [
                        'name' => 'Sales',
                        'department_id' => $department->id,
                        'leader_id' => $lead->id,
                        'capacity' => 10,
                        'priority' => 'high',
                        'member_ids' => [
                            $lead->id,
                        ],
                        'project_ids' => [],
                    ],
                )
                ->assertCreated()
                ->assertJsonPath(
                    'team.parent_team_id',
                    null,
                )
                ->json(
                    'team.id',
                );

        $child =
            $this
                ->postJson(
                    '/api/task-management/teams',
                    [
                        'name' => 'Enterprise Sales',
                        'department_id' => $department->id,
                        'parent_team_id' => $root,
                        'leader_id' => $lead->id,
                        'capacity' => 8,
                        'priority' => 'medium',
                        'member_ids' => [
                            $lead->id,
                        ],
                        'project_ids' => [],
                    ],
                )
                ->assertCreated()
                ->assertJsonPath(
                    'team.parent_team_id',
                    $root,
                )
                ->json(
                    'team.id',
                );

        $grandchild =
            $this
                ->postJson(
                    '/api/task-management/teams',
                    [
                        'name' => 'Gulf Enterprise',
                        'department_id' => $department->id,
                        'parent_team_id' => $child,
                        'leader_id' => $lead->id,
                        'capacity' => 6,
                        'priority' => 'medium',
                        'member_ids' => [
                            $lead->id,
                        ],
                        'project_ids' => [],
                    ],
                )
                ->assertCreated()
                ->assertJsonPath(
                    'team.parent_team_id',
                    $child,
                )
                ->json(
                    'team.id',
                );

        $this->assertDatabaseHas(
            'task_teams',
            [
                'id' => $grandchild,
                'parent_task_team_id' => $child,
            ],
        );

        $this
            ->patchJson(
                '/api/task-management/teams/'.$root,
                [
                    'parent_team_id' => $grandchild,
                ],
            )
            ->assertUnprocessable();

        $this
            ->deleteJson(
                '/api/task-management/teams/'.$root,
            )
            ->assertUnprocessable();
    }

    public function test_workspace_roles_accept_granular_team_hierarchy_permissions(): void
    {
        $this->workspace();

        $permissions = [
            'teams.view',
            'teams.create',
            'teams.update',
            'teams.archive',
            'teams.members.manage',
            'teams.lead.manage',
            'teams.projects.manage',
            'teams.subteams.create',
            'teams.subteams.manage',
            'teams.move',
            'teams.view_workload',
        ];

        $response =
            $this
                ->postJson(
                    '/api/workspace-roles',
                    [
                        'name' => 'Team hierarchy manager',
                        'base_role' => 'employee',
                        'is_custom' => true,
                        'preset_key' => null,
                        'permissions' => $permissions,
                    ],
                )
                ->assertCreated();

        foreach (
            $permissions as $permission
        ) {
            $this->assertContains(
                $permission,
                $response->json(
                    'data.permissions',
                ),
            );
        }
    }

    public function test_task_creation_requires_project_dates_and_positive_planned_time(): void
    {
        $this->workspace();

        $this
            ->postJson(
                '/api/task-management/tasks',
                [
                    'title' => 'Incomplete task',
                    'project_id' => null,
                    'status' => 'idea',
                    'priority' => 'medium',
                    'assignees' => [],
                    'checklist' => [],
                    'tags' => [],
                    'progress' => 0,
                    'starts_on' => null,
                    'due_on' => null,
                    'estimated_hours' => 0,
                    'visibility' => 'workspace',
                ],
            )
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'task_project_id',
                'starts_on',
                'due_on',
                'estimated_minutes',
            ]);

        $projectId =
            $this
                ->postJson(
                    '/api/task-management/projects',
                    [
                        'name' => 'Required planning project',
                        'color' => 'blue',
                    ],
                )
                ->assertCreated()
                ->json(
                    'project.id',
                );

        $this
            ->postJson(
                '/api/task-management/tasks',
                [
                    'title' => 'Fully planned task',
                    'project_id' => $projectId,
                    'status' => 'idea',
                    'priority' => 'medium',
                    'assignees' => [],
                    'checklist' => [],
                    'tags' => [],
                    'progress' => 0,
                    'starts_on' => '2026-09-20',
                    'due_on' => '2026-09-22',
                    'estimated_hours' => 1.5,
                    'visibility' => 'workspace',
                ],
            )
            ->assertCreated()
            ->assertJsonPath(
                'task.project_id',
                $projectId,
            )
            ->assertJsonPath(
                'task.estimated_hours',
                1.5,
            );
    }

    public function test_owner_can_edit_and_delete_projects_with_dependency_protection(): void
    {
        $this->workspace();

        $emptyProject =
            $this
                ->postJson(
                    '/api/task-management/projects',
                    [
                        'name' => 'Temporary project',
                        'description' => 'Before edit',
                        'color' => 'blue',
                    ],
                )
                ->assertCreated()
                ->json(
                    'project.id',
                );

        $this
            ->patchJson(
                '/api/task-management/projects/'.$emptyProject,
                [
                    'name' => 'Edited project',
                    'description' => 'After edit',
                    'color' => 'green',
                    'starts_on' => '2026-09-20',
                    'due_on' => '2026-09-30',
                ],
            )
            ->assertOk()
            ->assertJsonPath(
                'project.name',
                'Edited project',
            )
            ->assertJsonPath(
                'project.color',
                'green',
            );

        $this
            ->deleteJson(
                '/api/task-management/projects/'.$emptyProject,
            )
            ->assertOk()
            ->assertJsonPath(
                'deleted',
                true,
            );

        $this->assertSoftDeleted(
            'task_projects',
            [
                'id' => $emptyProject,
            ],
        );

        $linkedProject =
            $this
                ->postJson(
                    '/api/task-management/projects',
                    [
                        'name' => 'Linked project',
                        'color' => 'purple',
                    ],
                )
                ->assertCreated()
                ->json(
                    'project.id',
                );

        $this
            ->postJson(
                '/api/task-management/tasks',
                [
                    'title' => 'Linked task',
                    'project_id' => $linkedProject,
                    'status' => 'idea',
                    'priority' => 'medium',
                    'assignees' => [],
                    'checklist' => [],
                    'tags' => [],
                    'progress' => 0,
                    'starts_on' => '2026-09-20',
                    'due_on' => '2026-09-21',
                    'estimated_hours' => 2,
                    'visibility' => 'workspace',
                ],
            )
            ->assertCreated();

        $this
            ->deleteJson(
                '/api/task-management/projects/'.$linkedProject,
            )
            ->assertUnprocessable();

        $this->assertDatabaseHas(
            'task_projects',
            [
                'id' => $linkedProject,
                'deleted_at' => null,
            ],
        );
    }

}
