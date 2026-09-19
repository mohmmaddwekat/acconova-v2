import {
    apiRequest,
} from '@/lib/http';

import type {
    Member,
    Project,
    Task,
    TaskData,
    TaskDetail,
    TaskStatus,
} from './types';

type LegacyTaskStatus =
    | 'backlog'
    | 'todo'
    | 'in_progress'
    | 'review'
    | 'completed'
    | 'cancelled';

type LegacyTaskPriority =
    | 'low'
    | 'normal'
    | 'high'
    | 'urgent';

export type TaskItem = {
    id: number;
    title: string;
    description?: string | null;
    status: LegacyTaskStatus;
    priority: LegacyTaskPriority;
    progress: number;
    overdue: boolean;
    starts_on?: string | null;
    due_on?: string | null;
    estimated_minutes?: number | null;
    requires_approval?: boolean;
    project?: {
        id: number;
        name: string;
    } | null;
    department?: {
        id: number;
        name: string;
    } | null;
    primary_assignee?: {
        id: number;
        name: string;
    } | null;
};

export type TaskProject = {
    id: number;
    name: string;
    description?: string | null;
    status?: string | null;
    tasks_total?: number;
    tasks_completed?: number;
    tasks_overdue?: number;
};

export type TeamMemberRow = {
    id: number;
    name: string;
    job_title?: string | null;
    department_id?: number | null;
    active_tasks: number;
    overdue_tasks: number;
    completed_tasks: number;
    completion_rate: number;
    load:
        | 'light'
        | 'balanced'
        | 'busy'
        | 'critical';
};

export type ActiveMember = {
    id: number;
    name: string;
    job_title?: string | null;
    department_id?: number | null;
};

export type DepartmentRow = {
    id: number;
    name: string;
    members: number;
    tasks_total: number;
    completed: number;
    overdue: number;
    completion_rate: number;
};

export type DashboardResponse = {
    metrics: {
        total: number;
        in_progress: number;
        completed: number;
        overdue: number;
        completion_rate: number;
    };
    statuses: Partial<
        Record<
            LegacyTaskStatus,
            number
        >
    >;
    priorities: Partial<
        Record<
            LegacyTaskPriority,
            number
        >
    >;
    daily_activity: Array<{
        date: string;
        count: number;
    }>;
    current_tasks: TaskItem[];
    team_preview: TeamMemberRow[];
};

export type TaskMeta = {
    capabilities: {
        can_view_team: boolean;
        can_create: boolean;
        can_update?: boolean;
        can_archive?: boolean;
    };
    departments: Array<{
        id: number;
        name: string;
    }>;
    projects: Array<{
        id: number;
        name: string;
    }>;
    staff: Array<{
        id: number;
        name: string;
    }>;
};

export type LegacyTaskPayload = {
    title: string;
    description?: string | null;
    task_project_id?: number | null;
    department_id?: number | null;
    primary_assignee_id?: number | null;
    assignee_ids?: number[];
    status?: LegacyTaskStatus;
    priority?: LegacyTaskPriority;
    progress?: number;
    starts_on?: string | null;
    due_on?: string | null;
    estimated_minutes?: number | null;
    requires_approval?: boolean;
    subtasks?: Array<{
        title: string;
        is_completed: boolean;
    }>;
};

export type TaskDetailResponse = {
    task: TaskItem;
    capabilities: {
        can_update: boolean;
        can_archive: boolean;
    };
    subtasks: Array<{
        id: number;
        title: string;
        is_completed: boolean;
    }>;
    attachments: Array<{
        id: number;
        name: string;
        size: number;
        download_url: string;
    }>;
    comments: Array<{
        id: number;
        user_name: string;
        body: string;
        created_at: string;
    }>;
    activity: Array<{
        id: number;
        action: string;
        user_name?: string | null;
        created_at: string;
    }>;
};

/**
 * Load shared Task Management metadata and permissions.
 */
export function fetchTaskMeta(): Promise<TaskMeta> {
    return apiRequest<TaskMeta>(
        '/api/task-management/meta',
    );
}

/**
 * Load the real Task Management dashboard.
 */
export function fetchTaskDashboard(): Promise<DashboardResponse> {
    return apiRequest<DashboardResponse>(
        '/api/task-management/dashboard',
    );
}

/**
 * Load filtered tasks.
 */
export function fetchTasks(
    filters: Record<
        string,
        string | number | boolean | null | undefined
    > = {},
): Promise<{
    data: {
        data: TaskItem[];
        current_page: number;
        last_page: number;
        total: number;
    };
}> {
    const query =
        new URLSearchParams();

    Object.entries(
        filters,
    ).forEach(
        ([
            key,
            value,
        ]) => {
            if (
                value !== undefined
                && value !== null
                && value !== ''
            ) {
                query.set(
                    key,
                    String(
                        value,
                    ),
                );
            }
        },
    );

    const suffix =
        query.toString();

    return apiRequest<{
        data: {
            data: TaskItem[];
            current_page: number;
            last_page: number;
            total: number;
        };
    }>(
        `/api/task-management/tasks${suffix ? `?${suffix}` : ''}`,
    );
}

/**
 * Load one detailed task.
 */
export function fetchTask(
    taskId: number,
): Promise<TaskDetailResponse> {
    return apiRequest<TaskDetailResponse>(
        `/api/task-management/tasks/${taskId}`,
    );
}

/**
 * Create one task through the legacy Task Management endpoint.
 */
export function createTask(
    payload: LegacyTaskPayload,
): Promise<{
    task: TaskItem;
}> {
    return apiRequest<{
        task: TaskItem;
    }>(
        '/api/task-management/tasks',
        {
            method:
                'POST',

            body:
                JSON.stringify(
                    payload,
                ),
        },
    );
}

/**
 * Update one existing task through the legacy Task Management endpoint.
 */
export function updateTask(
    taskId: number,
    payload: LegacyTaskPayload,
): Promise<TaskDetailResponse> {
    return apiRequest<TaskDetailResponse>(
        `/api/task-management/tasks/${taskId}`,
        {
            method:
                'PATCH',

            body:
                JSON.stringify(
                    payload,
                ),
        },
    );
}

/**
 * Archive one task.
 */
export function archiveTask(
    taskId: number,
): Promise<{
    archived: boolean;
}> {
    return apiRequest<{
        archived: boolean;
    }>(
        `/api/task-management/tasks/${taskId}`,
        {
            method:
                'DELETE',
        },
    );
}

/**
 * Load task projects with their real task counters.
 */
export function fetchTaskProjects(): Promise<{
    projects: TaskProject[];
}> {
    return apiRequest<{
        projects: TaskProject[];
    }>(
        '/api/task-management/projects',
    );
}

/**
 * Load team workload and presence information.
 */
export function fetchTaskTeam(): Promise<{
    members: TeamMemberRow[];
    departments: DepartmentRow[];
    active_members: ActiveMember[];
}> {
    return apiRequest<{
        members: TeamMemberRow[];
        departments: DepartmentRow[];
        active_members: ActiveMember[];
    }>(
        '/api/task-management/team',
    );
}

/**
 * Load department workload summaries.
 */
export function fetchTaskDepartments(): Promise<{
    departments: DepartmentRow[];
}> {
    return apiRequest<{
        departments: DepartmentRow[];
    }>(
        '/api/task-management/departments-summary',
    );
}

/**
 * Add one task comment.
 */
export function addTaskComment(
    taskId: number,
    body: string,
): Promise<void> {
    return apiRequest<void>(
        `/api/task-management/tasks/${taskId}/comments`,
        {
            method:
                'POST',

            body:
                JSON.stringify({
                    body,
                }),
        },
    );
}

/**
 * Add one checklist item.
 */
export function addTaskSubtask(
    taskId: number,
    title: string,
): Promise<void> {
    return apiRequest<void>(
        `/api/task-management/tasks/${taskId}/subtasks`,
        {
            method:
                'POST',

            body:
                JSON.stringify({
                    title,
                }),
        },
    );
}

/**
 * Toggle one checklist item.
 */
export function toggleTaskSubtask(
    taskId: number,
    subtaskId: number,
): Promise<void> {
    return apiRequest<void>(
        `/api/task-management/tasks/${taskId}/subtasks/${subtaskId}`,
        {
            method:
                'PATCH',
        },
    );
}

/**
 * Upload one private task attachment.
 */
export function uploadTaskAttachment(
    taskId: number,
    file: File,
): Promise<void> {
    const form =
        new FormData();

    form.append(
        'file',
        file,
    );

    return apiRequest<void>(
        `/api/task-management/tasks/${taskId}/attachments`,
        {
            method:
                'POST',

            body:
                form,
        },
    );
}

/**
 * Load the current unified task workspace.
 *
 * This helper uses the newer Task Management response shape used by
 * TaskManagement.tsx, TaskEditor.tsx, and TaskDrawer.tsx.
 */
export function fetchTaskWorkspace(): Promise<TaskData> {
    return apiRequest<TaskData>(
        '/api/task-management',
    );
}

/**
 * Load one task using the newer unified task-detail response.
 */
export function fetchUnifiedTask(
    taskId: number,
): Promise<TaskDetail> {
    return apiRequest<TaskDetail>(
        `/api/task-management/tasks/${taskId}`,
    );
}

/**
 * Update only a task status through the unified task endpoint.
 */
export function updateTaskStatus(
    taskId: number,
    status: TaskStatus,
    revision: number,
): Promise<{
    task: Task;
}> {
    return apiRequest<{
        task: Task;
    }>(
        `/api/task-management/tasks/${taskId}`,
        {
            method:
                'PATCH',

            body:
                JSON.stringify({
                    status,
                    revision,
                }),
        },
    );
}

/**
 * Expose current core types for consumers that use this API module directly.
 */
export type {
    Member,
    Project,
    Task,
    TaskData,
    TaskDetail,
    TaskStatus,
};
