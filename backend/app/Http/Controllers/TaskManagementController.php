<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\StaffMember;
use App\Models\Task;
use App\Models\TaskProject;
use App\Support\TaskAccess;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TaskManagementController extends Controller
{
    /**
     * Render the current Task Management page using the consolidated React
     * surface. The view is inferred from the matched URL so route definitions
     * can share this single controller action.
     */
    public function page(
        Request $request,
    ): InertiaResponse {
        $path = trim(
            $request->path(),
            '/',
        );

        $taskId = $request->route(
            'task',
        );

        $view = match (true) {
            str_ends_with(
                $path,
                '/create',
            ) => 'create',

            str_ends_with(
                $path,
                '/edit',
            ) => 'edit',

            str_ends_with(
                $path,
                '/projects',
            ) => 'projects',

            str_ends_with(
                $path,
                '/team',
            ),
            str_ends_with(
                $path,
                '/departments',
            ) => 'team',

            str_ends_with(
                $path,
                '/tasks',
            ) => 'list',

            $taskId !== null => 'detail',

            default => 'dashboard',
        };

        return Inertia::render(
            'TaskManagement',
            [
                'taskView' => $view,
                'taskId' => $taskId !== null
                    ? (int) $taskId
                    : null,
            ],
        );
    }

    /**
     * Return options and permissions required by all Task Management pages.
     */
    public function meta(
        Request $request,
    ): JsonResponse {
        $staffQuery =
            StaffMember::query()
                ->where(
                    'active',
                    true,
                );

        if (
            ! TaskAccess::allowed(
                'tasks.assign_all',
            )
        ) {
            if (
                TaskAccess::allowed(
                    'tasks.assign_team',
                )
            ) {
                $staffQuery->whereIn(
                    'department_id',
                    StaffController::managedDepartmentIds(),
                );
            } else {
                $staff =
                    TaskAccess::currentStaff(
                        $request->user(),
                    );

                $staffQuery->where(
                    'id',
                    $staff?->id
                        ?? 0,
                );
            }
        }

        return response()->json([
            'capabilities' => [
                'can_create' => TaskAccess::allowed(
                    'tasks.create',
                ),

                'can_view_team' => TaskAccess::canViewTeam(),

                'can_view_all' => TaskAccess::allowed(
                    'tasks.view_all',
                ),

                'can_assign_team' => TaskAccess::allowed(
                    'tasks.assign_team',
                ),

                'can_assign_all' => TaskAccess::allowed(
                    'tasks.assign_all',
                ),

                'can_archive' => TaskAccess::allowed(
                    'tasks.archive',
                ),

                'can_reports' => TaskAccess::allowed(
                    'tasks.reports',
                ),

                'can_manage_projects' => TaskAccess::allowed(
                    'tasks.projects_manage',
                ),
            ],

            'staff' => $staffQuery
                ->orderBy(
                    'name',
                )
                ->get([
                    'id',
                    'name',
                    'job_title',
                    'department_id',
                    'user_id',
                ]),

            'departments' => Department::query()
                ->orderBy(
                    'name',
                )
                ->get([
                    'id',
                    'name',
                    'manager_id',
                ]),

            'projects' => TaskProject::query()
                ->where(
                    'status',
                    '!=',
                    'archived',
                )
                ->orderBy(
                    'name',
                )
                ->get([
                    'id',
                    'name',
                    'status',
                    'starts_on',
                    'due_on',
                ]),
        ]);
    }

    /**
     * Return real dashboard metrics from tasks visible to the current account.
     */
    public function dashboard(
        Request $request,
    ): JsonResponse {
        $visible =
            TaskAccess::applyVisible(
                Task::query()
                    ->operational(),
                $request->user(),
            );

        $total =
            (clone $visible)
                ->count();

        $completed =
            (clone $visible)
                ->where(
                    'status',
                    'completed',
                )
                ->count();

        $inProgress =
            (clone $visible)
                ->where(
                    'status',
                    'in_progress',
                )
                ->count();

        $overdue =
            (clone $visible)
                ->whereNotIn(
                    'status',
                    [
                        'completed',
                        'cancelled',
                    ],
                )
                ->whereDate(
                    'due_on',
                    '<',
                    today(),
                )
                ->count();

        $averageProgress =
            (int) round(
                (float) (
                    (clone $visible)
                        ->avg(
                            'progress',
                        )
                    ?? 0
                ),
            );

        $statuses =
            (clone $visible)
                ->selectRaw(
                    'status, COUNT(*) as total',
                )
                ->groupBy(
                    'status',
                )
                ->pluck(
                    'total',
                    'status',
                );

        $priorities =
            (clone $visible)
                ->selectRaw(
                    'priority, COUNT(*) as total',
                )
                ->groupBy(
                    'priority',
                )
                ->pluck(
                    'total',
                    'priority',
                );

        $currentTasks =
            (clone $visible)
                ->with([
                    'project:id,name',
                    'department:id,name',
                    'primaryAssignee:id,name',
                ])
                ->whereNotIn(
                    'status',
                    [
                        'completed',
                        'cancelled',
                    ],
                )
                ->orderByRaw(
                    'CASE priority
                        WHEN "urgent" THEN 1
                        WHEN "high" THEN 2
                        WHEN "normal" THEN 3
                        ELSE 4
                    END',
                )
                ->orderBy(
                    'due_on',
                )
                ->limit(
                    8,
                )
                ->get()
                ->map(
                    fn (
                        Task $task,
                    ): array => $this->serializeTask(
                        $task,
                    ),
                )
                ->values();

        $daily =
            collect(
                range(
                    27,
                    0,
                ),
            )
                ->map(
                    function (
                        int $daysAgo,
                    ) use (
                        $visible,
                    ): array {
                        $date =
                            today()
                                ->subDays(
                                    $daysAgo,
                                );

                        return [
                            'date' => $date
                                ->toDateString(),

                            'count' => (clone $visible)
                                ->whereDate(
                                    'updated_at',
                                    $date,
                                )
                                ->count(),
                        ];
                    },
                );

        return response()->json([
            'metrics' => [
                'total' => $total,

                'in_progress' => $inProgress,

                'completed' => $completed,

                'overdue' => $overdue,

                'completion_rate' => $total > 0
                    ? (int) round(
                        (
                            $completed
                            / $total
                        )
                            * 100,
                    )
                    : 0,

                'average_progress' => $averageProgress,
            ],

            'statuses' => $statuses,

            'priorities' => $priorities,

            'daily_activity' => $daily,

            'current_tasks' => $currentTasks,

            'team_preview' => TaskAccess::canViewTeam()
                ? $this->teamRows(
                    $request,
                    6,
                )
                : [],
        ]);
    }

    /**
     * Return either the consolidated Task Management workspace payload or the
     * legacy paginated task list, depending on the matched API endpoint.
     */
    public function index(
        Request $request,
    ): JsonResponse {
        if (
            $request->is(
                'api/task-management',
            )
        ) {
            return $this->workspaceData(
                $request,
            );
        }

        $filters =
            $request->validate([
                'search' => [
                    'nullable',
                    'string',
                    'max:150',
                ],

                'status' => [
                    'nullable',

                    Rule::in([
                        'backlog',
                        'todo',
                        'in_progress',
                        'review',
                        'completed',
                        'cancelled',
                    ]),
                ],

                'priority' => [
                    'nullable',

                    Rule::in([
                        'low',
                        'normal',
                        'high',
                        'urgent',
                    ]),
                ],

                'department_id' => [
                    'nullable',
                    'integer',
                ],

                'project_id' => [
                    'nullable',
                    'integer',
                ],

                'assignee_id' => [
                    'nullable',
                    'integer',
                ],

                'overdue' => [
                    'nullable',
                    'boolean',
                ],

                'per_page' => [
                    'nullable',
                    'integer',
                    'min:10',
                    'max:100',
                ],
            ]);

        $query =
            TaskAccess::applyVisible(
                Task::query()
                    ->operational()
                    ->with([
                        'project:id,name',
                        'department:id,name',
                        'primaryAssignee:id,name',
                        'assignees:id,name',
                    ]),
                $request->user(),
            );

        if (
            ! empty($filters['search'])
        ) {
            $search =
                $filters['search'];

            $query->where(
                function (
                    Builder $builder,
                ) use (
                    $search,
                ): void {
                    $builder
                        ->where(
                            'title',
                            'like',
                            '%'
                                .$search
                                .'%',
                        )
                        ->orWhere(
                            'description',
                            'like',
                            '%'
                                .$search
                                .'%',
                        );
                },
            );
        }

        foreach (
            [
                'status',
                'priority',
                'department_id',
            ] as $field
        ) {
            if (
                isset(
                    $filters[$field],
                )
                && $filters[$field] !==
                ''
            ) {
                $query->where(
                    $field,
                    $filters[$field],
                );
            }
        }

        if (
            isset(
                $filters['project_id'],
            )
        ) {
            $query->where(
                'task_project_id',
                $filters['project_id'],
            );
        }

        if (
            isset(
                $filters['assignee_id'],
            )
        ) {
            $assignee =
                (int) $filters['assignee_id'];

            $query->where(
                function (
                    Builder $builder,
                ) use (
                    $assignee,
                ): void {
                    $builder
                        ->where(
                            'primary_assignee_id',
                            $assignee,
                        )
                        ->orWhereHas(
                            'assignees',
                            fn (
                                Builder $assignees,
                            ) => $assignees->where(
                                'staff_members.id',
                                $assignee,
                            ),
                        );
                },
            );
        }

        if (
            $request->boolean(
                'overdue',
            )
        ) {
            $query
                ->whereNotIn(
                    'status',
                    [
                        'completed',
                        'cancelled',
                    ],
                )
                ->whereDate(
                    'due_on',
                    '<',
                    today(),
                );
        }

        $page =
            $query
                ->orderByRaw(
                    'CASE priority
                        WHEN "urgent" THEN 1
                        WHEN "high" THEN 2
                        WHEN "normal" THEN 3
                        ELSE 4
                    END',
                )
                ->orderBy(
                    'due_on',
                )
                ->latest(
                    'id',
                )
                ->paginate(
                    $filters['per_page']
                        ?? 30,
                );

        $page->setCollection(
            $page
                ->getCollection()
                ->map(
                    fn (
                        Task $task,
                    ): array => $this->serializeTask(
                        $task,
                    ),
                ),
        );

        return response()->json([
            'data' => $page,
        ]);
    }

    /**
     * Return one task using the consolidated browser contract.
     */
    public function show(
        Request $request,
        string $task,
    ): JsonResponse {
        $item =
            TaskAccess::applyVisible(
                Task::query()
                    ->with([
                        'project:id,name,accent',
                        'department:id,name',
                        'primaryAssignee:id,name,user_id',
                        'assignees:id,name,user_id,department_id',
                        'creator:id,name,email',
                    ])
                    ->withCount([
                        'assignees',
                    ]),
                $request->user(),
            )->findOrFail(
                $task,
            );

        return response()->json(
            $this->taskDetailPayload(
                $item,
            ),
        );
    }

    /**
     * Create one real task from either the current consolidated browser
     * payload or the legacy Task Management payload.
     */
    public function store(
        Request $request,
    ): JsonResponse {
        abort_unless(
            TaskAccess::allowed(
                'tasks.create',
            ),
            403,
        );

        $browserPayload =
            $request->hasAny([
                'project_id',
                'assignees',
                'checklist',
                'estimated_hours',
                'visibility',
                'tags',
            ]);

        if ($browserPayload) {
            $request->merge(
                $this->normalizeBrowserPayload(
                    $request->all(),
                ),
            );
        }

        $data =
            $request->validate(
                $this->taskRules(),
            );

        $task =
            DB::transaction(
                function () use (
                    $request,
                    $data,
                ): Task {
                    $primary =
                        ! empty($data['primary_assignee_id'])
                        ? StaffMember::findOrFail(
                            $data['primary_assignee_id'],
                        )
                        : TaskAccess::currentStaff(
                            $request->user(),
                        );

                    if ($primary) {
                        abort_unless(
                            TaskAccess::canAssign(
                                $primary,
                                $request->user(),
                            ),
                            403,
                        );
                    }

                    foreach (
                        $data['assignee_ids']
                            ?? [] as $staffId
                    ) {
                        abort_unless(
                            TaskAccess::canAssign(
                                StaffMember::findOrFail(
                                    $staffId,
                                ),
                                $request->user(),
                            ),
                            403,
                        );
                    }

                    $payload =
                        collect(
                            $data,
                        )
                            ->except([
                                'assignee_ids',
                                'subtasks',
                            ])
                            ->toArray();

                    $payload['created_by'] =
                        $request
                            ->user()
                            ->id;

                    $payload['primary_assignee_id'] =
                        $primary?->id;

                    if (
                        empty($payload['department_id'])
                        && $primary
                    ) {
                        $payload['department_id'] =
                            $primary->department_id;
                    }

                    $this->normalizeLifecycle(
                        $payload,
                    );

                    $task =
                        Task::create(
                            $payload,
                        );

                    $assignees =
                        collect(
                            $data['assignee_ids']
                                ?? [],
                        );

                    if ($primary) {
                        $assignees->push(
                            $primary->id,
                        );
                    }

                    $this->syncAssignees(
                        $task,
                        $assignees
                            ->unique()
                            ->values()
                            ->all(),
                    );

                    $this->replaceSubtasks(
                        $task,
                        $data['subtasks']
                            ?? [],
                    );

                    $this->log(
                        $task,
                        $request,
                        'created',
                    );

                    return $task;
                },
                3,
            );

        if ($browserPayload) {
            return response()->json([
                'task' => $this->serializeWorkspaceTask(
                    $task->fresh([
                        'project:id,name,accent',
                        'department:id,name',
                        'primaryAssignee:id,name,user_id',
                        'assignees:id,name,user_id,department_id',
                    ]),
                ),
            ], 201);
        }

        return response()->json([
            'task' => $this->serializeTask(
                $task->fresh([
                    'project:id,name',
                    'department:id,name',
                    'primaryAssignee:id,name',
                    'assignees:id,name',
                ]),
            ),
        ], 201);
    }

    /**
     * Update one task when the caller has authority over it.
     *
     * The browser payload is translated into the existing persisted schema so
     * the current UI can operate without a destructive data migration.
     */
    public function update(
        Request $request,
        string $task,
    ): JsonResponse {
        $item =
            Task::findOrFail(
                $task,
            );

        abort_unless(
            TaskAccess::canUpdate(
                $item,
                $request->user(),
            ),
            403,
        );

        $browserPayload =
            $request->hasAny([
                'project_id',
                'assignees',
                'checklist',
                'estimated_hours',
                'visibility',
                'tags',
                'revision',
            ])
            || in_array(
                $request->input(
                    'status',
                ),
                [
                    'idea',
                ],
                true,
            )
            || in_array(
                $request->input(
                    'priority',
                ),
                [
                    'medium',
                ],
                true,
            );

        if ($browserPayload) {
            $request->merge(
                $this->normalizeBrowserPayload(
                    $request->all(),
                ),
            );
        }

        $data =
            $request->validate(
                $this->taskRules(
                    true,
                ),
            );

        DB::transaction(
            function () use (
                $request,
                $item,
                $data,
            ): void {
                if (
                    array_key_exists(
                        'primary_assignee_id',
                        $data,
                    )
                    && $data['primary_assignee_id']
                ) {
                    $primary =
                        StaffMember::findOrFail(
                            $data['primary_assignee_id'],
                        );

                    abort_unless(
                        TaskAccess::canAssign(
                            $primary,
                            $request->user(),
                        )
                            || (int) $item->primary_assignee_id ===
                            $primary->id,
                        403,
                    );
                }

                if (
                    array_key_exists(
                        'assignee_ids',
                        $data,
                    )
                ) {
                    foreach (
                        $data['assignee_ids'] as $staffId
                    ) {
                        $staff =
                            StaffMember::findOrFail(
                                $staffId,
                            );

                        abort_unless(
                            TaskAccess::canAssign(
                                $staff,
                                $request->user(),
                            )
                                || $item
                                    ->assignees()
                                    ->where(
                                        'staff_members.id',
                                        $staff->id,
                                    )
                                    ->exists(),
                            403,
                        );
                    }
                }

                $payload =
                    collect(
                        $data,
                    )
                        ->except([
                            'assignee_ids',
                            'subtasks',
                        ])
                        ->toArray();

                if (
                    array_key_exists(
                        'primary_assignee_id',
                        $payload,
                    )
                    && $payload['primary_assignee_id']
                    && empty($payload['department_id'])
                ) {
                    $primary =
                        StaffMember::find(
                            $payload['primary_assignee_id'],
                        );

                    if ($primary) {
                        $payload['department_id'] =
                            $primary->department_id;
                    }
                }

                $this->normalizeLifecycle(
                    $payload,
                    $item,
                );

                $item->update(
                    $payload,
                );

                if (
                    array_key_exists(
                        'assignee_ids',
                        $data,
                    )
                ) {
                    $ids =
                        collect(
                            $data['assignee_ids'],
                        );

                    if (
                        $item->primary_assignee_id
                    ) {
                        $ids->push(
                            $item->primary_assignee_id,
                        );
                    }

                    $this->syncAssignees(
                        $item,
                        $ids
                            ->unique()
                            ->values()
                            ->all(),
                    );
                }

                if (
                    array_key_exists(
                        'subtasks',
                        $data,
                    )
                ) {
                    $this->replaceSubtasks(
                        $item,
                        $data['subtasks'],
                    );
                }

                $this->log(
                    $item,
                    $request,
                    'updated',
                );
            },
            3,
        );

        if ($browserPayload) {
            return response()->json([
                'task' => $this->serializeWorkspaceTask(
                    $item->fresh([
                        'project:id,name,accent',
                        'department:id,name',
                        'primaryAssignee:id,name,user_id',
                        'assignees:id,name,user_id,department_id',
                    ]),
                ),
            ]);
        }

        return response()->json([
            'task' => $this->serializeTask(
                $item->fresh([
                    'project:id,name',
                    'department:id,name',
                    'primaryAssignee:id,name',
                    'assignees:id,name',
                ]),
            ),
        ]);
    }

    /**
     * Archive one task without destroying history.
     */
    public function archive(
        Request $request,
        string $task,
    ): JsonResponse {
        abort_unless(
            TaskAccess::allowed(
                'tasks.archive',
            ),
            403,
        );

        $item =
            Task::findOrFail(
                $task,
            );

        $item->update([
            'archived_at' => now(),
        ]);

        $this->log(
            $item,
            $request,
            'archived',
        );

        return response()->json([
            'archived' => true,
        ]);
    }

    /**
     * Return projects with real task counters.
     */
    public function projects(
        Request $request,
    ): JsonResponse {
        $projects =
            TaskProject::query()
                ->where(
                    'status',
                    '!=',
                    'archived',
                )
                ->withCount([
                    'tasks as tasks_total' => fn (
                        Builder $query,
                    ) => TaskAccess::applyVisible(
                        $query->operational(),
                        $request->user(),
                    ),

                    'tasks as tasks_completed' => fn (
                        Builder $query,
                    ) => TaskAccess::applyVisible(
                        $query
                            ->operational()
                            ->where(
                                'status',
                                'completed',
                            ),
                        $request->user(),
                    ),

                    'tasks as tasks_overdue' => fn (
                        Builder $query,
                    ) => TaskAccess::applyVisible(
                        $query
                            ->operational()
                            ->whereNotIn(
                                'status',
                                [
                                    'completed',
                                    'cancelled',
                                ],
                            )
                            ->whereDate(
                                'due_on',
                                '<',
                                today(),
                            ),
                        $request->user(),
                    ),
                ])
                ->orderBy(
                    'name',
                )
                ->get();

        return response()->json([
            'projects' => $projects,
        ]);
    }

    /**
     * Create one task project.
     */
    public function storeProject(
        Request $request,
    ): JsonResponse {
        abort_unless(
            TaskAccess::allowed(
                'tasks.projects_manage',
            )
                || TaskAccess::allowed(
                    'tasks.projects.manage',
                ),
            403,
        );

        $data =
            $request->validate([
                'name' => [
                    'required',
                    'string',
                    'max:160',
                ],

                'description' => [
                    'nullable',
                    'string',
                    'max:3000',
                ],

                'color' => [
                    'nullable',

                    Rule::in([
                        'blue',
                        'green',
                        'purple',
                        'orange',
                    ]),
                ],

                'starts_on' => [
                    'nullable',
                    'date_format:Y-m-d',
                ],

                'due_on' => [
                    'nullable',
                    'date_format:Y-m-d',
                    'after_or_equal:starts_on',
                ],
            ]);

        $project =
            TaskProject::create([
                'name' => $data['name'],

                'description' => $data['description']
                    ?? null,

                'accent' => $data['color']
                    ?? null,

                'starts_on' => $data['starts_on']
                    ?? null,

                'due_on' => $data['due_on']
                    ?? null,

                'created_by' => $request
                    ->user()
                    ->id,

                'status' => 'active',
            ]);

        return response()->json([
            'project' => $project,
        ], 201);
    }

    /**
     * Return workload analytics for a permitted team manager.
     */
    public function team(
        Request $request,
    ): JsonResponse {
        abort_unless(
            TaskAccess::canViewTeam(),
            403,
        );

        $canViewAll =
            TaskAccess::allowed(
                'tasks.view_all',
            );

        /*
         * Team managers receive only workload/member data in their permitted
         * scope. Presence and company-wide department analytics are reserved
         * for accounts with tasks.view_all.
         */
        return response()->json([
            'members' => $this->teamRows(
                $request,
            ),

            'departments' => $canViewAll
                ? $this->departmentRows(
                    $request,
                )
                : [],

            'active_members' => $canViewAll
                ? $this->activeMembers(
                    $request,
                )
                : [],
        ]);
    }

    /**
     * Return department summary cards and performance totals.
     */
    public function departmentsSummary(
        Request $request,
    ): JsonResponse {
        abort_unless(
            TaskAccess::canViewTeam()
                && TaskAccess::allowed(
                    'tasks.view_all',
                ),
            403,
        );

        return response()->json([
            'departments' => $this->departmentRows(
                $request,
            ),
        ]);
    }

    /**
     * Add a comment to a visible task.
     */
    public function comment(
        Request $request,
        string $task,
    ): JsonResponse {
        $item =
            TaskAccess::applyVisible(
                Task::query(),
                $request->user(),
            )->findOrFail(
                $task,
            );

        $data =
            $request->validate([
                'body' => [
                    'required',
                    'string',
                    'max:5000',
                ],
            ]);

        $id =
            DB::table(
                'task_comments',
            )->insertGetId([
                'organization_id' => app(
                    TenantContext::class,
                )->id(),

                'task_id' => $item->id,

                'user_id' => $request
                    ->user()
                    ->id,

                'body' => $data['body'],

                'created_at' => now(),

                'updated_at' => now(),
            ]);

        $this->log(
            $item,
            $request,
            'commented',
        );

        return response()->json([
            'id' => $id,
        ], 201);
    }

    /**
     * Add one checklist item to a task.
     */
    public function subtask(
        Request $request,
        string $task,
    ): JsonResponse {
        $item =
            Task::findOrFail(
                $task,
            );

        abort_unless(
            TaskAccess::canUpdate(
                $item,
                $request->user(),
            ),
            403,
        );

        $data =
            $request->validate([
                'title' => [
                    'required',
                    'string',
                    'max:220',
                ],
            ]);

        $position =
            (int) DB::table(
                'task_subtasks',
            )
                ->where(
                    'task_id',
                    $item->id,
                )
                ->max(
                    'position',
                )
            + 1;

        $id =
            DB::table(
                'task_subtasks',
            )->insertGetId([
                'organization_id' => app(
                    TenantContext::class,
                )->id(),

                'task_id' => $item->id,

                'title' => $data['title'],

                'is_completed' => false,

                'position' => $position,

                'created_at' => now(),

                'updated_at' => now(),
            ]);

        $this->log(
            $item,
            $request,
            'subtask.created',
        );

        return response()->json([
            'id' => $id,
        ], 201);
    }

    /**
     * Toggle one checklist item.
     */
    public function toggleSubtask(
        Request $request,
        string $task,
        string $subtask,
    ): JsonResponse {
        $item =
            Task::findOrFail(
                $task,
            );

        abort_unless(
            TaskAccess::canUpdate(
                $item,
                $request->user(),
            ),
            403,
        );

        $row =
            DB::table(
                'task_subtasks',
            )
                ->where(
                    'task_id',
                    $item->id,
                )
                ->where(
                    'id',
                    $subtask,
                )
                ->first();

        abort_unless(
            $row,
            404,
        );

        DB::table(
            'task_subtasks',
        )
            ->where(
                'id',
                $row->id,
            )
            ->update([
                'is_completed' => ! (bool) $row->is_completed,

                'updated_at' => now(),
            ]);

        $this->log(
            $item,
            $request,
            'subtask.updated',
        );

        return response()->json([
            'saved' => true,
        ]);
    }

    /**
     * Upload one private task attachment.
     */
    public function attachment(
        Request $request,
        string $task,
    ): JsonResponse {
        $item =
            TaskAccess::applyVisible(
                Task::query(),
                $request->user(),
            )->findOrFail(
                $task,
            );

        $request->validate([
            'file' => [
                'required',
                'file',
                'max:20480',
            ],
        ]);

        $file =
            $request->file(
                'file',
            );

        $path =
            $file->store(
                'task-attachments/'
                    .app(
                        TenantContext::class,
                    )->id()
                    .'/'
                    .$item->id,
                'local',
            );

        $id =
            DB::table(
                'task_attachments',
            )->insertGetId([
                'organization_id' => app(
                    TenantContext::class,
                )->id(),

                'task_id' => $item->id,

                'uploaded_by' => $request
                    ->user()
                    ->id,

                'original_name' => $file
                    ->getClientOriginalName(),

                'path' => $path,

                'mime_type' => $file
                    ->getMimeType(),

                'size' => $file
                    ->getSize(),

                'created_at' => now(),

                'updated_at' => now(),
            ]);

        $this->log(
            $item,
            $request,
            'attachment.uploaded',
        );

        return response()->json([
            'id' => $id,
        ], 201);
    }

    /**
     * Download one attachment only when the task itself is visible.
     */
    public function downloadAttachment(
        Request $request,
        string $task,
        string $attachment,
    ): StreamedResponse {
        $item =
            TaskAccess::applyVisible(
                Task::query(),
                $request->user(),
            )->findOrFail(
                $task,
            );

        $file =
            DB::table(
                'task_attachments',
            )
                ->where(
                    'task_id',
                    $item->id,
                )
                ->where(
                    'id',
                    $attachment,
                )
                ->first();

        abort_unless(
            $file,
            404,
        );

        abort_unless(
            Storage::disk(
                'local',
            )->exists(
                $file->path,
            ),
            404,
        );

        return Storage::disk(
            'local',
        )->download(
            $file->path,
            $file->original_name,
        );
    }

    /**
     * Return the consolidated Task Management payload consumed by the current
     * React workspace.
     */
    private function workspaceData(
        Request $request,
    ): JsonResponse {
        $tasks =
            TaskAccess::applyVisible(
                Task::query()
                    ->operational()
                    ->with([
                        'project:id,name,accent',
                        'department:id,name',
                        'primaryAssignee:id,name,user_id',
                        'assignees:id,name,user_id,department_id',
                    ])
                    ->withCount([
                        'assignees',
                    ]),
                $request->user(),
            )
                ->where(
                    'status',
                    '!=',
                    'cancelled',
                )
                ->latest(
                    'id',
                )
                ->get();

        $visibleTaskIds =
            $tasks
                ->pluck(
                    'id',
                );

        $members =
            StaffMember::query()
                ->leftJoin(
                    'departments',
                    'departments.id',
                    '=',
                    'staff_members.department_id',
                )
                ->where(
                    'staff_members.active',
                    true,
                )
                ->orderBy(
                    'staff_members.name',
                )
                ->get([
                    'staff_members.id',
                    'staff_members.user_id',
                    'staff_members.name',
                    'staff_members.job_title',
                    'staff_members.department_id',
                    'departments.name as department',
                ])
                ->map(
                    fn (
                        object $member,
                    ): array => [
                        'id' => (int) $member->id,

                        'user_id' => $member->user_id !== null
                            ? (int) $member->user_id
                            : null,

                        'name' => $member->name,

                        'job_title' => $member->job_title,

                        'department' => $member->department,

                        'department_id' => $member->department_id !== null
                            ? (int) $member->department_id
                            : null,
                    ],
                )
                ->values();

        $projects =
            TaskProject::query()
                ->where(
                    'status',
                    '!=',
                    'archived',
                )
                ->orderBy(
                    'name',
                )
                ->get()
                ->map(
                    fn (
                        TaskProject $project,
                    ): array => [
                        'id' => $project->id,

                        'name' => $project->name,

                        'description' => $project->description,

                        'color' => $project->accent
                            ?: 'blue',
                    ],
                )
                ->values();

        $events =
            $visibleTaskIds->isEmpty()
            ? collect()
            : DB::table(
                'task_activity_logs',
            )
                ->leftJoin(
                    'users',
                    'users.id',
                    '=',
                    'task_activity_logs.user_id',
                )
                ->whereIn(
                    'task_activity_logs.task_id',
                    $visibleTaskIds,
                )
                ->latest(
                    'task_activity_logs.id',
                )
                ->limit(
                    100,
                )
                ->get([
                    'task_activity_logs.id',
                    'task_activity_logs.task_id',
                    'task_activity_logs.user_id',
                    'task_activity_logs.action',
                    'task_activity_logs.created_at',
                    'users.name',
                ])
                ->map(
                    fn (
                        object $event,
                    ): array => [
                        'id' => (int) $event->id,

                        'task_id' => $event->task_id !== null
                            ? (int) $event->task_id
                            : null,

                        'user_id' => $event->user_id !== null
                            ? (int) $event->user_id
                            : null,

                        'name' => $event->name
                            ?? 'System',

                        'action' => $this->browserAction(
                            $event->action,
                        ),

                        'created_at' => (string) $event->created_at,
                    ],
                )
                ->values();

        return response()->json([
            'tasks' => $tasks
                ->map(
                    fn (
                        Task $task,
                    ): array => $this->serializeWorkspaceTask(
                        $task,
                    ),
                )
                ->values(),

            'members' => $members,

            'projects' => $projects,

            'events' => $events,

            'permissions' => $this->browserPermissions(
                $request,
            ),
        ]);
    }

    /**
     * Convert the current browser payload into the persisted task schema.
     *
     * Tags and visibility are intentionally ignored here because the current
     * database schema has no durable columns for them.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function normalizeBrowserPayload(
        array $payload,
    ): array {
        $normalized = [];

        foreach (
            [
                'title',
                'description',
                'progress',
                'starts_on',
                'due_on',
            ] as $field
        ) {
            if (
                array_key_exists(
                    $field,
                    $payload,
                )
            ) {
                $normalized[$field] =
                    $payload[$field];
            }
        }

        if (
            array_key_exists(
                'project_id',
                $payload,
            )
        ) {
            $normalized['task_project_id'] =
                $payload['project_id'];
        }

        if (
            array_key_exists(
                'assignees',
                $payload,
            )
        ) {
            $assignees =
                collect(
                    is_array(
                        $payload['assignees']
                    )
                        ? $payload['assignees']
                        : [],
                )
                    ->map(
                        fn (
                            mixed $id,
                        ): int => (int) $id,
                    )
                    ->filter(
                        fn (
                            int $id,
                        ): bool => $id > 0,
                    )
                    ->unique()
                    ->values()
                    ->all();

            $normalized['assignee_ids'] =
                $assignees;

            $normalized['primary_assignee_id'] =
                $assignees[0]
                ?? null;
        }

        if (
            array_key_exists(
                'checklist',
                $payload,
            )
        ) {
            $normalized['subtasks'] =
                collect(
                    is_array(
                        $payload['checklist']
                    )
                        ? $payload['checklist']
                        : [],
                )
                    ->map(
                        fn (
                            mixed $item,
                        ): array => [
                            'title' => is_array(
                                $item,
                            )
                                ? (string) (
                                    $item['title']
                                    ?? ''
                                )
                                : '',

                            'is_completed' => is_array(
                                $item,
                            )
                                ? (bool) (
                                    $item['done']
                                    ?? false
                                )
                                : false,
                        ],
                    )
                    ->filter(
                        fn (
                            array $item,
                        ): bool => trim(
                            $item['title'],
                        ) !== '',
                    )
                    ->values()
                    ->all();
        }

        if (
            array_key_exists(
                'estimated_hours',
                $payload,
            )
        ) {
            $hours =
                max(
                    0,
                    (float) $payload['estimated_hours'],
                );

            $normalized['estimated_minutes'] =
                $hours > 0
                ? (int) round(
                    $hours
                        * 60,
                )
                : null;
        }

        if (
            array_key_exists(
                'status',
                $payload,
            )
        ) {
            $normalized['status'] =
                match ($payload['status']) {
                    'idea' => 'todo',

                    'in_progress',
                    'review',
                    'completed' => $payload['status'],

                    default => $payload['status'],
                };
        }

        if (
            array_key_exists(
                'priority',
                $payload,
            )
        ) {
            $normalized['priority'] =
                match ($payload['priority']) {
                    'medium' => 'normal',

                    'high',
                    'low' => $payload['priority'],

                    default => $payload['priority'],
                };
        }

        return $normalized;
    }

    /**
     * Convert one persisted task into the consolidated browser task contract.
     *
     * @return array<string, mixed>
     */
    private function serializeWorkspaceTask(
        Task $task,
    ): array {
        $task->loadMissing([
            'project:id,name,accent',
            'department:id,name',
            'primaryAssignee:id,name,user_id',
            'assignees:id,name,user_id,department_id',
        ]);

        $checklist =
            DB::table(
                'task_subtasks',
            )
                ->where(
                    'task_id',
                    $task->id,
                )
                ->orderBy(
                    'position',
                )
                ->orderBy(
                    'id',
                )
                ->get([
                    'title',
                    'is_completed',
                ])
                ->map(
                    fn (
                        object $item,
                    ): array => [
                        'title' => $item->title,

                        'done' => (bool) $item->is_completed,
                    ],
                )
                ->values()
                ->all();

        return [
            'id' => $task->id,

            'title' => $task->title,

            'description' => $task->description,

            'project_id' => $task->task_project_id !== null
                ? (int) $task->task_project_id
                : null,

            'status' => match ($task->status) {
                'in_progress' => 'in_progress',

                'review' => 'review',

                'completed' => 'completed',

                default => 'idea',
            },

            'priority' => match ($task->priority) {
                'urgent',
                'high' => 'high',

                'low' => 'low',

                default => 'medium',
            },

            'visibility' => 'workspace',

            'assignees' => $task
                ->assignees
                ->pluck(
                    'id',
                )
                ->map(
                    fn (
                        mixed $id,
                    ): int => (int) $id,
                )
                ->values()
                ->all(),

            'checklist' => $checklist,

            'tags' => [],

            'progress' => (int) $task->progress,

            'starts_on' => $task
                ->starts_on
                ?->toDateString(),

            'due_on' => $task
                ->due_on
                ?->toDateString(),

            'estimated_hours' => $task->estimated_minutes
                ? round(
                    $task->estimated_minutes
                        / 60,
                    2,
                )
                : 0,

            'revision' => $task
                ->updated_at
                ?->getTimestamp()
                ?? 1,

            'created_at' => $task
                ->created_at
                ?->toIso8601String()
                ?? '',

            'updated_at' => $task
                ->updated_at
                ?->toIso8601String(),

            'comments_count' => DB::table(
                'task_comments',
            )
                ->where(
                    'task_id',
                    $task->id,
                )
                ->count(),

            'attachments_count' => DB::table(
                'task_attachments',
            )
                ->where(
                    'task_id',
                    $task->id,
                )
                ->count(),
        ];
    }

    /**
     * Build the detailed browser payload for one task.
     *
     * @return array<string, mixed>
     */
    private function taskDetailPayload(
        Task $task,
    ): array {
        $comments =
            DB::table(
                'task_comments',
            )
                ->join(
                    'users',
                    'users.id',
                    '=',
                    'task_comments.user_id',
                )
                ->where(
                    'task_comments.task_id',
                    $task->id,
                )
                ->orderBy(
                    'task_comments.created_at',
                )
                ->get([
                    'task_comments.id',
                    'task_comments.body',
                    'task_comments.created_at',
                    'users.name',
                ])
                ->map(
                    fn (
                        object $comment,
                    ): array => [
                        'id' => (int) $comment->id,

                        'name' => $comment->name,

                        'body' => $comment->body,

                        'created_at' => (string) $comment->created_at,
                    ],
                )
                ->values();

        $attachments =
            DB::table(
                'task_attachments',
            )
                ->where(
                    'task_id',
                    $task->id,
                )
                ->latest()
                ->get()
                ->map(
                    fn (
                        object $file,
                    ): array => [
                        'id' => (int) $file->id,

                        'name' => $file->original_name,

                        'size' => (int) $file->size,

                        'url' => '/api/task-management/tasks/'
                            .$task->id
                            .'/attachments/'
                            .$file->id,
                    ],
                )
                ->values();

        $events =
            DB::table(
                'task_activity_logs',
            )
                ->leftJoin(
                    'users',
                    'users.id',
                    '=',
                    'task_activity_logs.user_id',
                )
                ->where(
                    'task_activity_logs.task_id',
                    $task->id,
                )
                ->latest(
                    'task_activity_logs.id',
                )
                ->limit(
                    50,
                )
                ->get([
                    'task_activity_logs.id',
                    'task_activity_logs.task_id',
                    'task_activity_logs.user_id',
                    'task_activity_logs.action',
                    'task_activity_logs.created_at',
                    'users.name',
                ])
                ->map(
                    fn (
                        object $event,
                    ): array => [
                        'id' => (int) $event->id,

                        'task_id' => $event->task_id !== null
                            ? (int) $event->task_id
                            : null,

                        'user_id' => $event->user_id !== null
                            ? (int) $event->user_id
                            : null,

                        'name' => $event->name
                            ?? 'System',

                        'action' => $this->browserAction(
                            $event->action,
                        ),

                        'created_at' => (string) $event->created_at,
                    ],
                )
                ->values();

        return [
            'task' => $this->serializeWorkspaceTask(
                $task,
            ),

            'comments' => $comments,

            'attachments' => $attachments,

            'events' => $events,
        ];
    }

    /**
     * Translate server-side Task Management capabilities into the permission
     * keys consumed by the consolidated browser surface.
     *
     * @return list<string>
     */
    private function browserPermissions(
        Request $request,
    ): array {
        $permissions = [
            'tasks.dashboard',
            'tasks.view',
            'tasks.projects.view',
            'tasks.update',
        ];

        if (
            TaskAccess::allowed(
                'tasks.create',
            )
        ) {
            $permissions[] =
                'tasks.create';
        }

        if (
            TaskAccess::allowed(
                'tasks.assign_all',
            )
            || TaskAccess::allowed(
                'tasks.assign_team',
            )
            || TaskAccess::currentStaff(
                $request->user(),
            )
        ) {
            $permissions[] =
                'tasks.assign';
        }

        if (
            TaskAccess::allowed(
                'tasks.projects_manage',
            )
            || TaskAccess::allowed(
                'tasks.projects.manage',
            )
        ) {
            $permissions[] =
                'tasks.projects.manage';
        }

        if (
            TaskAccess::canViewTeam()
        ) {
            $permissions[] =
                'tasks.team';
        }

        if (
            TaskAccess::allowed(
                'tasks.view_all',
            )
        ) {
            $permissions[] =
                'tasks.view_all';
        }

        if (
            TaskAccess::allowed(
                'tasks.archive',
            )
        ) {
            $permissions[] =
                'tasks.delete';
        }

        return array_values(
            array_unique(
                $permissions,
            ),
        );
    }

    /**
     * Normalize activity names used by the old backend into the current UI
     * vocabulary.
     */
    private function browserAction(
        string $action,
    ): string {
        return match ($action) {
            'attachment.uploaded' => 'attachment_added',

            'subtask.created',
            'subtask.updated' => 'updated',

            default => $action,
        };
    }

    /**
     * Return reusable validation rules for task creation and editing.
     *
     * @return array<string, mixed>
     */
    private function taskRules(
        bool $partial = false,
    ): array {
        $prefix =
            $partial
            ? 'sometimes'
            : 'required';

        return [
            'title' => [
                $prefix,
                'string',
                'max:220',
            ],

            'description' => [
                'nullable',
                'string',
                'max:10000',
            ],

            'task_project_id' => [
                'nullable',
                'integer',

                Rule::exists(
                    'task_projects',
                    'id',
                )->where(
                    'organization_id',
                    app(
                        TenantContext::class,
                    )->id(),
                ),
            ],

            'department_id' => [
                'nullable',
                'integer',

                Rule::exists(
                    'departments',
                    'id',
                )->where(
                    'organization_id',
                    app(
                        TenantContext::class,
                    )->id(),
                ),
            ],

            'primary_assignee_id' => [
                'nullable',
                'integer',

                Rule::exists(
                    'staff_members',
                    'id',
                )->where(
                    'organization_id',
                    app(
                        TenantContext::class,
                    )->id(),
                ),
            ],

            'assignee_ids' => [
                'sometimes',
                'array',
                'max:50',
            ],

            'assignee_ids.*' => [
                'integer',
                'distinct',

                Rule::exists(
                    'staff_members',
                    'id',
                )->where(
                    'organization_id',
                    app(
                        TenantContext::class,
                    )->id(),
                ),
            ],

            'status' => [
                $partial
                    ? 'sometimes'
                    : 'nullable',

                Rule::in([
                    'backlog',
                    'todo',
                    'in_progress',
                    'review',
                    'completed',
                    'cancelled',
                ]),
            ],

            'priority' => [
                $partial
                    ? 'sometimes'
                    : 'nullable',

                Rule::in([
                    'low',
                    'normal',
                    'high',
                    'urgent',
                ]),
            ],

            'progress' => [
                'sometimes',
                'integer',
                'min:0',
                'max:100',
            ],

            'starts_on' => [
                'nullable',
                'date_format:Y-m-d',
            ],

            'due_on' => [
                'nullable',
                'date_format:Y-m-d',
                'after_or_equal:starts_on',
            ],

            'estimated_minutes' => [
                'nullable',
                'integer',
                'min:1',
                'max:525600',
            ],

            'requires_approval' => [
                'sometimes',
                'boolean',
            ],

            'subtasks' => [
                'sometimes',
                'array',
                'max:100',
            ],

            'subtasks.*.title' => [
                'required',
                'string',
                'max:220',
            ],

            'subtasks.*.is_completed' => [
                'sometimes',
                'boolean',
            ],
        ];
    }

    /**
     * Normalize lifecycle values before persisting a task.
     *
     * @param  array<string, mixed>  $payload
     */
    private function normalizeLifecycle(
        array &$payload,
        ?Task $existing = null,
    ): void {
        $status =
            $payload['status']
            ?? $existing?->status
            ?? 'todo';

        $payload['status'] =
            $status;

        $payload['priority'] ??=
            $existing?->priority
            ?? 'normal';

        if (
            $status ===
            'completed'
        ) {
            $payload['progress'] =
                100;

            $payload['completed_at'] =
                $existing?->completed_at
                ?? now();

            return;
        }

        if (
            array_key_exists(
                'status',
                $payload,
            )
        ) {
            $payload['completed_at'] =
                null;
        }
    }

    /**
     * Sync task assignees while preserving tenant identity on the pivot table.
     *
     * @param  list<int>  $ids
     */
    private function syncAssignees(
        Task $task,
        array $ids,
    ): void {
        $sync =
            collect(
                $ids,
            )->mapWithKeys(
                fn (
                    int $id,
                ): array => [
                    $id => [
                        'organization_id' => app(
                            TenantContext::class,
                        )->id(),
                    ],
                ],
            )->all();

        $task
            ->assignees()
            ->sync(
                $sync,
            );
    }

    /**
     * Replace the editable checklist for one task.
     *
     * @param  list<array<string, mixed>>  $subtasks
     */
    private function replaceSubtasks(
        Task $task,
        array $subtasks,
    ): void {
        DB::table(
            'task_subtasks',
        )
            ->where(
                'task_id',
                $task->id,
            )
            ->delete();

        foreach (
            array_values(
                $subtasks,
            ) as $position => $subtask
        ) {
            DB::table(
                'task_subtasks',
            )->insert([
                'organization_id' => app(
                    TenantContext::class,
                )->id(),

                'task_id' => $task->id,

                'title' => $subtask['title'],

                'is_completed' => $subtask['is_completed']
                    ?? false,

                'position' => $position,

                'created_at' => now(),

                'updated_at' => now(),
            ]);
        }
    }

    /**
     * Record an immutable task activity event.
     *
     * @param  array<string, mixed>  $metadata
     */
    private function log(
        Task $task,
        Request $request,
        string $action,
        array $metadata = [],
    ): void {
        DB::table(
            'task_activity_logs',
        )->insert([
            'organization_id' => app(
                TenantContext::class,
            )->id(),

            'task_id' => $task->id,

            'user_id' => $request
                ->user()
                ->id,

            'action' => $action,

            'metadata' => $metadata === []
                ? null
                : json_encode(
                    $metadata,
                    JSON_UNESCAPED_UNICODE
                        | JSON_UNESCAPED_SLASHES,
                ),

            'created_at' => now(),

            'updated_at' => now(),
        ]);
    }

    /**
     * Convert one task into the browser contract.
     *
     * @return array<string, mixed>
     */
    private function serializeTask(
        Task $task,
        bool $detailed = false,
    ): array {
        $task->loadMissing([
            'project:id,name',
            'department:id,name',
            'primaryAssignee:id,name',
            'assignees:id,name',
        ]);

        return [
            'id' => $task->id,

            'title' => $task->title,

            'description' => $task->description,

            'status' => $task->status,

            'priority' => $task->priority,

            'progress' => $task->progress,

            'starts_on' => $task
                ->starts_on
                ?->toDateString(),

            'due_on' => $task
                ->due_on
                ?->toDateString(),

            'estimated_minutes' => $task->estimated_minutes,

            'requires_approval' => $task->requires_approval,

            'created_at' => $task
                ->created_at
                ?->toIso8601String(),

            'updated_at' => $task
                ->updated_at
                ?->toIso8601String(),

            'overdue' => $task->due_on
                && ! in_array(
                    $task->status,
                    [
                        'completed',
                        'cancelled',
                    ],
                    true,
                )
                && $task
                    ->due_on
                    ->isBefore(
                        today(),
                    ),

            'project' => $task->project
                ? [
                    'id' => $task
                        ->project
                        ->id,

                    'name' => $task
                        ->project
                        ->name,
                ]
                : null,

            'department' => $task->department
                ? [
                    'id' => $task
                        ->department
                        ->id,

                    'name' => $task
                        ->department
                        ->name,
                ]
                : null,

            'primary_assignee' => $task->primaryAssignee
                ? [
                    'id' => $task
                        ->primaryAssignee
                        ->id,

                    'name' => $task
                        ->primaryAssignee
                        ->name,
                ]
                : null,

            'assignees' => $task
                ->assignees
                ->map(
                    fn (
                        StaffMember $member,
                    ): array => [
                        'id' => $member->id,

                        'name' => $member->name,
                    ],
                )
                ->values(),

            'creator' => $detailed
                && $task->relationLoaded(
                    'creator',
                )
                && $task->creator
                ? [
                    'id' => $task
                        ->creator
                        ->id,

                    'name' => $task
                        ->creator
                        ->name,

                    'email' => $task
                        ->creator
                        ->email,
                ]
                : null,
        ];
    }

    /**
     * Build real employee workload rows.
     *
     * @return list<array<string, mixed>>
     */
    private function teamRows(
        Request $request,
        ?int $limit = null,
    ): array {
        $staff =
            StaffMember::query()
                ->where(
                    'active',
                    true,
                );

        if (
            ! TaskAccess::allowed(
                'tasks.view_all',
            )
        ) {
            $staff->whereIn(
                'department_id',
                StaffController::managedDepartmentIds(),
            );
        }

        if ($limit) {
            $staff->limit(
                $limit,
            );
        }

        return $staff
            ->orderBy(
                'name',
            )
            ->get()
            ->map(
                function (
                    StaffMember $member,
                ): array {
                    $tasks =
                        Task::query()
                            ->operational()
                            ->where(
                                'primary_assignee_id',
                                $member->id,
                            );

                    $total =
                        (clone $tasks)
                            ->count();

                    $completed =
                        (clone $tasks)
                            ->where(
                                'status',
                                'completed',
                            )
                            ->count();

                    $overdue =
                        (clone $tasks)
                            ->whereNotIn(
                                'status',
                                [
                                    'completed',
                                    'cancelled',
                                ],
                            )
                            ->whereDate(
                                'due_on',
                                '<',
                                today(),
                            )
                            ->count();

                    $active =
                        (clone $tasks)
                            ->whereNotIn(
                                'status',
                                [
                                    'completed',
                                    'cancelled',
                                ],
                            )
                            ->count();

                    return [
                        'id' => $member->id,

                        'name' => $member->name,

                        'job_title' => $member->job_title,

                        'department_id' => $member->department_id,

                        'active_tasks' => $active,

                        'completed_tasks' => $completed,

                        'overdue_tasks' => $overdue,

                        'completion_rate' => $total > 0
                            ? (int) round(
                                (
                                    $completed
                                    / $total
                                )
                                    * 100,
                            )
                            : 0,

                        'load' => match (true) {
                            $active >= 15
                                || $overdue >= 5 => 'critical',

                            $active >= 10
                                || $overdue >= 3 => 'busy',

                            $active <= 3 => 'light',

                            default => 'balanced',
                        },
                    ];
                },
            )
            ->values()
            ->all();
    }

    /**
     * Build department-level workload summaries.
     *
     * @return list<array<string, mixed>>
     */
    private function departmentRows(
        Request $request,
    ): array {
        $query =
            Department::query();

        if (
            ! TaskAccess::allowed(
                'tasks.view_all',
            )
        ) {
            $query->whereIn(
                'id',
                StaffController::managedDepartmentIds(),
            );
        }

        return $query
            ->orderBy(
                'name',
            )
            ->get()
            ->map(
                function (
                    Department $department,
                ): array {
                    $members =
                        StaffMember::where(
                            'department_id',
                            $department->id,
                        )
                            ->where(
                                'active',
                                true,
                            )
                            ->count();

                    $tasks =
                        Task::query()
                            ->operational()
                            ->where(
                                'department_id',
                                $department->id,
                            );

                    $total =
                        (clone $tasks)
                            ->count();

                    $completed =
                        (clone $tasks)
                            ->where(
                                'status',
                                'completed',
                            )
                            ->count();

                    $overdue =
                        (clone $tasks)
                            ->whereNotIn(
                                'status',
                                [
                                    'completed',
                                    'cancelled',
                                ],
                            )
                            ->whereDate(
                                'due_on',
                                '<',
                                today(),
                            )
                            ->count();

                    return [
                        'id' => $department->id,

                        'name' => $department->name,

                        'members' => $members,

                        'tasks_total' => $total,

                        'completed' => $completed,

                        'overdue' => $overdue,

                        'completion_rate' => $total > 0
                            ? (int) round(
                                (
                                    $completed
                                    / $total
                                )
                                    * 100,
                            )
                            : 0,
                    ];
                },
            )
            ->values()
            ->all();
    }

    /**
     * Determine currently active employees from database-backed sessions.
     *
     * @return list<array<string, mixed>>
     */
    private function activeMembers(
        Request $request,
    ): array {
        if (
            config(
                'session.driver',
            )
            !== 'database'
        ) {
            return [];
        }

        $activeUserIds =
            DB::connection(
                config(
                    'session.connection',
                ),
            )
                ->table(
                    config(
                        'session.table',
                        'sessions',
                    ),
                )
                ->whereNotNull(
                    'user_id',
                )
                ->where(
                    'last_activity',
                    '>=',
                    now()
                        ->subMinutes(
                            15,
                        )
                        ->timestamp,
                )
                ->pluck(
                    'last_activity',
                    'user_id',
                );

        if (
            $activeUserIds->isEmpty()
        ) {
            return [];
        }

        $staff =
            StaffMember::query()
                ->where(
                    'active',
                    true,
                )
                ->whereIn(
                    'user_id',
                    $activeUserIds
                        ->keys(),
                );

        if (
            ! TaskAccess::allowed(
                'tasks.view_all',
            )
        ) {
            $staff->whereIn(
                'department_id',
                StaffController::managedDepartmentIds(),
            );
        }

        return $staff
            ->orderBy(
                'name',
            )
            ->get()
            ->map(
                fn (
                    StaffMember $member,
                ): array => [
                    'id' => $member->id,

                    'name' => $member->name,

                    'job_title' => $member->job_title,

                    'department_id' => $member->department_id,

                    'last_activity' => (int) (
                        $activeUserIds[$member->user_id]
                        ?? 0
                    ),
                ],
            )
            ->values()
            ->all();
    }
}
