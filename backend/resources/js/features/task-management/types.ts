export type TaskView =
    | 'dashboard'
    | 'list'
    | 'projects'
    | 'team'
    | 'teams'
    | 'teams-create'
    | 'teams-detail'
    | 'teams-members'
    | 'create'
    | 'edit'
    | 'detail';

export type TaskStatus =
    | 'idea'
    | 'in_progress'
    | 'review'
    | 'completed';

export type Priority = 'high' | 'medium' | 'low';

export type TaskVisibility = 'workspace' | 'participants';

export type ChecklistItem = {
    title: string;
    done: boolean;
};

export type Member = {
    id: number;
    user_id?: number | null;
    name: string;
    email?: string | null;
    job_title?: string | null;
    department?: string | null;
    department_id?: number | null;
};

export type Project = {
    id: number;
    name: string;
    description?: string | null;
    color?: string;
};

export type Task = {
    id: number;
    title: string;
    description: string | null;
    project_id: number | null;
    status: TaskStatus;
    priority: Priority;
    visibility: TaskVisibility;
    assignees: number[];
    checklist: ChecklistItem[];
    tags: string[];
    progress: number;
    starts_on: string | null;
    due_on: string | null;
    estimated_hours: number;
    revision: number;
    created_at: string;
    updated_at?: string | null;
    comments_count?: number;
    attachments_count?: number;
};

export type TaskPayload = Pick<
    Task,
    | 'title'
    | 'description'
    | 'project_id'
    | 'status'
    | 'priority'
    | 'visibility'
    | 'assignees'
    | 'checklist'
    | 'tags'
    | 'progress'
    | 'starts_on'
    | 'due_on'
    | 'estimated_hours'
> & {
    revision?: number;
};

export type TaskTeam = {
    id: number;
    name: string;
    description?: string | null;
    department_id: number;
    department?: string | null;
    leader_id: number | null;
    leader_name?: string | null;
    capacity: number;
    priority: 'low' | 'medium' | 'high';
    member_ids: number[];
    project_ids: number[];
};

export type TaskActivityEvent = {
    id: number;
    task_id: number | null;
    user_id?: number | null;
    name: string;
    action: string;
    created_at: string;
};

export type TaskComment = {
    id: number;
    name: string;
    body: string;
    created_at: string;
};

export type TaskAttachment = {
    id: number;
    name: string;
    size: number;
    url: string;
};

export type TaskDetail = {
    task: Task;
    comments: TaskComment[];
    attachments: TaskAttachment[];
    events: TaskActivityEvent[];
};

export type TaskData = {
    tasks: Task[];
    members: Member[];
    projects: Project[];
    teams: TaskTeam[];
    events: TaskActivityEvent[];
    permissions: string[];
};
