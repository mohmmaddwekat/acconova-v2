import { AppShell } from '@/layouts/AppShell';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import type { AppPageProps } from '@/types/app';
import {
    Head,
    Link,
    usePage,
} from '@inertiajs/react';
import {
    Activity,
    ArrowDownToLine,
    ArrowUpRight,
    BarChart3,
    CalendarDays,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Filter,
    Flag,
    FolderKanban,
    Gauge,
    LayoutGrid,
    ListTodo,
    MessageSquare,
    MoreHorizontal,
    Paperclip,
    Plus,
    Search,
    ShieldCheck,
    UsersRound,
    X,
    type LucideIcon,
} from 'lucide-react';
import {
    useEffect,
    useState,
    type FormEvent,
} from 'react';
import {
    api,
    base,
    Avatar,
    Assignees,
    Badge,
    button,
    CheckMark,
    dateLabel,
    DueDate,
    Empty,
    errorText,
    input,
    Modal,
    overdue,
    Panel,
    primary,
    PriorityBadge,
    priorityMeta,
    Progress,
    Stat,
    StatusBadge,
    statusMeta,
    today,
} from '@/features/task-management/ui';
import type {
    Member,
    Priority,
    Project,
    Task,
    TaskActivityEvent,
    TaskData,
    TaskStatus,
    TaskView,
} from '@/features/task-management/types';
import { TaskEditor } from '@/features/task-management/TaskEditor';
import { TaskDrawer } from '@/features/task-management/TaskDrawer';
import {
    TeamsExperience,
    type TeamsView,
} from '@/features/task-management/TeamsExperience';
import '../../css/task-management.css';

type Filters = {
    search: string;
    project: string;
    assignee: string;
    priority: string;
    status: string;
    department: string;
    due: string;
};

type NavItem = {
    key: TaskView;
    permission: string;
    path: string;
    ar: string;
    en: string;
    icon: LucideIcon;
};

type MemberWorkload = Member & {
    tasks: number;
    active: number;
    overdue: number;
    completed: number;
    hours: number;
};

type DepartmentWorkload = {
    name: string;
    members: number;
    active: number;
    overdue: number;
};

type TeamSection = 'overview' | 'members' | 'active' | 'departments';

type TeamApiMember = {
    id: number;
    name: string;
    job_title?: string | null;
    department_id?: number | null;
    active_tasks: number;
    completed_tasks: number;
    overdue_tasks: number;
    completion_rate: number;
    load: 'light' | 'balanced' | 'busy' | 'critical';
};

type TeamApiDepartment = {
    id: number;
    name: string;
    members: number;
    tasks_total: number;
    completed: number;
    overdue: number;
    completion_rate: number;
};

type TeamApiActiveMember = {
    id: number;
    name: string;
    job_title?: string | null;
    department_id?: number | null;
    last_activity: number;
};

type TeamApiResponse = {
    members: TeamApiMember[];
    departments: TeamApiDepartment[];
    active_members: TeamApiActiveMember[];
};

const emptyFilters: Filters = {
    search: '',
    project: '',
    assignee: '',
    priority: '',
    status: '',
    department: '',
    due: '',
};

const actions: Record<string, [string, string]> = {
    created: ['أنشأ مهمة', 'Created a task'],
    updated: ['عدّل مهمة', 'Updated a task'],
    status_changed: ['غيّر حالة مهمة', 'Changed task status'],
    commented: ['أضاف تعليقًا', 'Added a comment'],
    attachment_added: ['أرفق ملفًا', 'Attached a file'],
};

/**
 * Mount the Task Management module for the requested server-side page view.
 */
export default function TaskManagement() {
    const page = usePage<
        AppPageProps & {
            taskView: TaskView;
            taskId: number | null;
            teamId: number | null;
            taskPermissions: string[];
        }
    >();

    return (
        <TaskWorkspace
            key={page.props.workspace.activeOrganization?.id ?? 'none'}
            view={page.props.taskView}
            taskId={page.props.taskId}
            teamId={page.props.teamId}
            taskPermissions={page.props.taskPermissions}
        />
    );
}

/**
 * Coordinate Task Management data, filters, navigation and child surfaces.
 */
function TaskWorkspace({
    view,
    taskId,
    teamId,
    taskPermissions,
}: {
    view: TaskView;
    taskId: number | null;
    teamId: number | null;
    taskPermissions: string[];
}) {
    const ar = useLocale() === 'ar';
    const page = usePage<AppPageProps>();
    const { auth } = page.props;
    const teamSectionValue = new URLSearchParams(
        page.url.split('?')[1] ?? '',
    ).get('section');
    const teamSection: TeamSection = (
        teamSectionValue === 'members'
        || teamSectionValue === 'active'
        || teamSectionValue === 'departments'
    )
        ? teamSectionValue
        : 'overview';
    const [data, setData] = useState<TaskData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const [filters, setFilters] = useState<Filters>(emptyFilters);
    const [selected, setSelected] = useState<number | null>(
        view === 'detail' ? taskId : null,
    );
    const [projectDialog, setProjectDialog] = useState(false);
    const [busy, setBusy] = useState(false);
    const [boardMode, setBoardMode] = useState<'board' | 'projects'>('board');

    /**
     * Return localized workspace copy.
     */
    const text = (arabic: string, english: string): string => (
        ar ? arabic : english
    );

    const permissions = data?.permissions ?? taskPermissions;
    const canViewFullTeam = permissions.includes('tasks.view_all');
    const effectiveTeamSection: TeamSection = (
        teamSection === 'active'
        || teamSection === 'departments'
    ) && ! canViewFullTeam
        ? 'overview'
        : teamSection;

    /**
     * Check one permission returned by the Task Management API.
     */
    const can = (permission: string): boolean => (
        permissions.includes(permission)
    );

    /**
     * Trigger a complete module data refresh after a mutation.
     */
    const refresh = (): void => {
        setRevision((value: number) => value + 1);
    };

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');

        apiRequest<TaskData>(
            api,
            { signal: controller.signal },
        )
            .then((value: TaskData) => setData(value))
            .catch((failure: unknown) => {
                if (! controller.signal.aborted) {
                    setError(errorText(failure));
                }
            })
            .finally(() => {
                if (! controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [revision]);

    useEffect(() => {
        setSelected(view === 'detail' ? taskId : null);
    }, [view, taskId]);

    const firstName = auth.user?.name.split(' ')[0] ?? '';

    const titles: Record<TaskView, [string, string]> = {
        dashboard: [
            `مرحبًا، ${firstName} 👋`,
            `Welcome, ${firstName}`,
        ],
        list: ['قائمة المهام', 'Task list'],
        projects: ['لوحة المهام والمشاريع', 'Projects & task board'],
        team: ['الفريق وعبء العمل', 'Team & workload'],
        teams: ['الفرق', 'Teams'],
        'teams-create': ['إنشاء فريق جديد', 'Create a new team'],
        'teams-detail': ['تفاصيل الفريق', 'Team details'],
        'teams-members': ['إدارة أعضاء الفريق', 'Manage team members'],
        create: ['إضافة مهمة جديدة', 'Create a task'],
        edit: ['تعديل المهمة', 'Edit task'],
        detail: ['قائمة المهام', 'Task list'],
    };

    const descriptions: Record<TaskView, [string, string]> = {
        dashboard: [
            'إليك نظرة شاملة على مهام فريقك وأداء العمل اليوم.',
            'An overview of your team’s tasks and progress.',
        ],
        list: [
            'نظّم مهام فريقك وتابع التقدم في مكان واحد.',
            'Organize work and track progress in one place.',
        ],
        projects: [
            'تابع مراحل المشاريع، وحرّك المهام بين حالات التنفيذ.',
            'Follow project progress and move tasks through each stage.',
        ],
        team: [
            'رؤية شاملة لتوزيع العمل والمهام المتأخرة على أعضاء الفريق.',
            'Understand assignments, workload and overdue work.',
        ],
        teams: [
            'إدارة فرق القسم ومتابعة الأعضاء والمشاريع وعبء العمل.',
            'Manage department teams, members, projects and workload.',
        ],
        'teams-create': [
            'أنشئ فريقًا جديدًا داخل القسم وحدد القائد والأعضاء والمشاريع المبدئية.',
            'Create a team and configure its lead, members and initial projects.',
        ],
        'teams-detail': [
            'تابع أعضاء الفريق ومشاريعه وعبء العمل والنشاط في مكان واحد.',
            'Review team members, projects, workload and recent activity.',
        ],
        'teams-members': [
            'إدارة أعضاء الفريق وتوزيع الأدوار ومتابعة نسبة الانشغال.',
            'Manage team membership, roles and utilization.',
        ],
        create: [
            'أضف مهمة واضحة وحدد المسؤوليات والأولويات والجدول الزمني.',
            'Define responsibilities, priorities and a timeline.',
        ],
        edit: [
            'حدّث تفاصيل المهمة واحفظ التغييرات لفريقك.',
            'Update the task details for your team.',
        ],
        detail: [
            'نظّم مهام فريقك وتابع التقدم في مكان واحد.',
            'Organize work and track progress in one place.',
        ],
    };

    const teamTitles: Record<TeamSection, [string, string]> = {
        overview: ['الفريق وعبء العمل', 'Team & workload'],
        members: ['أعضاء الفريق', 'Team members'],
        active: ['الأعضاء النشطون', 'Active members'],
        departments: ['ملخص الأقسام', 'Department summary'],
    };

    const teamDescriptions: Record<TeamSection, [string, string]> = {
        overview: [
            'رؤية شاملة لتوزيع العمل والمهام المتأخرة وأداء أعضاء الفريق.',
            'A complete view of workload, overdue work and team performance.',
        ],
        members: [
            'استعرض أعضاء الفريق وأعباء العمل ومعدلات الإنجاز ضمن نطاق صلاحياتك.',
            'Browse team members, workload and completion metrics within your access scope.',
        ],
        active: [
            'تابع الأعضاء الذين لديهم جلسة نشطة خلال آخر 15 دقيقة ونشاطهم الحالي.',
            'See members with an application session active within the last 15 minutes.',
        ],
        departments: [
            'قارن أحمال الأقسام والمهام المكتملة والمتأخرة ومعدلات الإنجاز.',
            'Compare department workload, completion and overdue work.',
        ],
    };

    const pageTitle = view === 'team'
        ? teamTitles[effectiveTeamSection]
        : titles[view];
    const pageDescription = view === 'team'
        ? teamDescriptions[effectiveTeamSection]
        : descriptions[view];

    const navigation: NavItem[] = [
        {
            key: 'dashboard',
            permission: 'tasks.dashboard',
            path: '',
            ar: 'الرئيسية',
            en: 'Overview',
            icon: Gauge,
        },
        {
            key: 'list',
            permission: 'tasks.view',
            path: '/tasks',
            ar: 'المهام',
            en: 'Tasks',
            icon: ListTodo,
        },
        {
            key: 'projects',
            permission: 'tasks.projects.view',
            path: '/projects',
            ar: 'المشاريع',
            en: 'Projects',
            icon: FolderKanban,
        },
        {
            key: 'team',
            permission: 'tasks.team',
            path: '/team',
            ar: 'الفريق وعبء العمل',
            en: 'Team & workload',
            icon: UsersRound,
        },
        {
            key: 'teams',
            permission: 'teams.view',
            path: '/teams',
            ar: 'الفرق',
            en: 'Teams',
            icon: UsersRound,
        },
    ];

    const tasks: Task[] = data?.tasks ?? [];

    const filtered = tasks.filter((task: Task) => {
        const memberIds = data?.members
            .filter((member: Member) => (
                ! filters.department
                || member.department === filters.department
            ))
            .map((member: Member) => member.id) ?? [];

        const haystack = `${task.title} ${task.description ?? ''} ${task.tags.join(' ')}`
            .toLocaleLowerCase();

        return (
            (! filters.search || haystack.includes(filters.search.toLocaleLowerCase()))
            && (! filters.project || task.project_id === Number(filters.project))
            && (! filters.assignee || task.assignees.includes(Number(filters.assignee)))
            && (! filters.priority || task.priority === filters.priority)
            && (
                ! filters.status
                || (
                    filters.status === 'overdue'
                        ? overdue(task)
                        : task.status === filters.status
                )
            )
            && (
                ! filters.department
                || task.assignees.some((id: number) => memberIds.includes(id))
            )
            && (
                ! filters.due
                || (
                    filters.due === 'overdue'
                        ? overdue(task)
                        : task.due_on === today()
                )
            )
        );
    });

    /**
     * Move a task to another workflow status using optimistic concurrency.
     */
    async function move(
        task: Task,
        status: TaskStatus,
    ): Promise<void> {
        if (busy || task.status === status) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                `${api}/tasks/${task.id}`,
                {
                    method: 'PATCH',
                    body: JSON.stringify({
                        status,
                        revision: task.revision,
                    }),
                },
            );
            refresh();
        } catch (failure) {
            setError(errorText(failure));
        } finally {
            setBusy(false);
        }
    }

    /**
     * Create a new task project from the project modal.
     */
    async function createProject(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                `${api}/projects`,
                {
                    method: 'POST',
                    body: JSON.stringify(
                        Object.fromEntries(
                            new FormData(event.currentTarget),
                        ),
                    ),
                },
            );
            setProjectDialog(false);
            refresh();
        } catch (failure) {
            setError(errorText(failure));
        } finally {
            setBusy(false);
        }
    }

    const editor = view === 'create' || view === 'edit';
    const teamsView = view.startsWith('teams');

    return (
        <AppShell>
            <Head title={pageTitle[ar ? 0 : 1]} />

            <main className="task-module mx-auto min-h-[calc(100dvh-72px)] max-w-[1800px] bg-[#f5f8ff] px-3 py-5 sm:px-5 lg:px-7">
                <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="flex items-center gap-2 text-xl font-bold">
                            <span className="text-blue-500">
                                {view === 'team' || teamsView
                                    ? <UsersRound size={24} />
                                    : view === 'projects'
                                        ? <FolderKanban size={24} />
                                        : <ListTodo size={24} />}
                            </span>
                            {pageTitle[ar ? 0 : 1]}
                        </h1>
                        <p className="mt-1.5 text-xs text-slate-400">
                            {pageDescription[ar ? 0 : 1]}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {view === 'projects' && (
                            <>
                                <button
                                    type="button"
                                    className={boardMode === 'board' ? primary : button}
                                    onClick={() => setBoardMode('board')}
                                >
                                    <LayoutGrid size={14} />
                                    {text('لوحة المهام', 'Task board')}
                                </button>
                                <button
                                    type="button"
                                    className={boardMode === 'projects' ? primary : button}
                                    onClick={() => setBoardMode('projects')}
                                >
                                    <FolderKanban size={14} />
                                    {text('عرض المشاريع', 'Projects')}
                                </button>
                                {can('tasks.projects.manage') && (
                                    <button
                                        type="button"
                                        className={button}
                                        onClick={() => {
                                            setError('');
                                            setProjectDialog(true);
                                        }}
                                    >
                                        <Plus size={14} />
                                        {text('مشروع جديد', 'New project')}
                                    </button>
                                )}
                            </>
                        )}

                        {! editor && ! teamsView && can('tasks.create') && (
                            <Link
                                className={primary}
                                href={`${base}/create`}
                            >
                                <Plus size={16} />
                                {text('إضافة مهمة', 'Add task')}
                            </Link>
                        )}
                    </div>
                </header>

                <nav
                    aria-label={text('إدارة المهام', 'Task management')}
                    className="mb-5 flex gap-2 overflow-x-auto"
                >
                    {navigation.map((item: NavItem) => {
                        if (! can(item.permission)) {
                            return null;
                        }

                        const Icon = item.icon;
                        const active =
                            view === item.key
                            || (view === 'detail' && item.key === 'list')
                            || (teamsView && item.key === 'teams');

                        return (
                            <Link
                                key={item.key}
                                href={`${base}${item.path}`}
                                className={`${active ? primary : button} shrink-0`}
                            >
                                <Icon size={14} />
                                <span>{ar ? item.ar : item.en}</span>
                            </Link>
                        );
                    })}
                </nav>

                {error && ! projectDialog && (
                    <div
                        role="alert"
                        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-xs text-red-600"
                    >
                        {error}
                        <button
                            type="button"
                            className={button}
                            onClick={refresh}
                        >
                            {text('إعادة المحاولة', 'Retry')}
                        </button>
                    </div>
                )}

                {loading && ! data ? (
                    <div
                        role="status"
                        className="tm-panel p-16 text-center text-sm text-slate-400"
                    >
                        {text('جارٍ تحميل مساحة المهام…', 'Loading tasks…')}
                    </div>
                ) : data ? (
                    <>
                        {editor ? (
                            <TaskEditor
                                key={`${view}-${taskId ?? 'new'}`}
                                data={data}
                                taskId={view === 'edit' ? taskId : null}
                                ar={ar}
                                userId={auth.user?.id ?? 0}
                            />
                        ) : (
                            <>
                                {view !== 'projects' && view !== 'team' && ! teamsView && (
                                    <Summary
                                        tasks={tasks}
                                        members={data.members}
                                        ar={ar}
                                    />
                                )}

                                {view !== 'team' && ! teamsView && (
                                    <FiltersBar
                                        data={data}
                                        filters={filters}
                                        onChange={setFilters}
                                        ar={ar}
                                    />
                                )}

                                {view === 'dashboard' && (
                                    <Dashboard
                                        data={data}
                                        tasks={filtered}
                                        ar={ar}
                                        onOpen={can('tasks.view') ? setSelected : undefined}
                                    />
                                )}

                                {(view === 'list' || view === 'detail') && (
                                    <TaskTable
                                        tasks={filtered}
                                        data={data}
                                        ar={ar}
                                        onOpen={setSelected}
                                        status={filters.status}
                                        onStatus={(status: string) => setFilters({
                                            ...filters,
                                            status,
                                        })}
                                    />
                                )}

                                {view === 'projects' && (
                                    boardMode === 'board' ? (
                                        <Board
                                            tasks={filtered}
                                            data={data}
                                            ar={ar}
                                            onOpen={can('tasks.view') ? setSelected : undefined}
                                            onMove={move}
                                            busy={busy}
                                        />
                                    ) : (
                                        <ProjectCards
                                            data={data}
                                            tasks={filtered}
                                            ar={ar}
                                            onSelect={(projectId: number) => {
                                                setFilters({
                                                    ...emptyFilters,
                                                    project: String(projectId),
                                                });
                                                setBoardMode('board');
                                            }}
                                        />
                                    )
                                )}

                                {view === 'team' && (
                                    <TeamCenter
                                        data={data}
                                        tasks={tasks}
                                        ar={ar}
                                        section={effectiveTeamSection}
                                    />
                                )}

                                {teamsView && (
                                    <TeamsExperience
                                        view={view as TeamsView}
                                        teamId={teamId}
                                        data={data}
                                        tasks={tasks}
                                        ar={ar}
                                        permissions={permissions}
                                        onChanged={refresh}
                                    />
                                )}
                            </>
                        )}

                        {selected !== null && (
                            <TaskDrawer
                                key={selected}
                                taskId={selected}
                                data={data}
                                ar={ar}
                                onClose={() => setSelected(null)}
                                onChanged={refresh}
                            />
                        )}
                    </>
                ) : null}

                <Modal
                    open={projectDialog}
                    onClose={() => {
                        if (! busy) {
                            setProjectDialog(false);
                        }
                    }}
                    title={text('مشروع جديد', 'New project')}
                >
                    <form onSubmit={createProject}>
                        <div className="mb-5 flex justify-between">
                            <h2 className="font-bold">
                                {text('إضافة مشروع جديد', 'Create a project')}
                            </h2>
                            <button
                                type="button"
                                disabled={busy}
                                aria-label={text('إغلاق', 'Close')}
                                onClick={() => setProjectDialog(false)}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <label className="tm-field mb-4">
                            {text('اسم المشروع', 'Project name')}
                            <input
                                className={input}
                                autoFocus
                                required
                                maxLength={255}
                                name="name"
                            />
                        </label>

                        <label className="tm-field mb-4">
                            {text('وصف المشروع', 'Description')}
                            <textarea
                                className={input}
                                name="description"
                                maxLength={5000}
                                rows={3}
                            />
                        </label>

                        <label className="tm-field mb-5">
                            {text('لون المشروع', 'Project color')}
                            <select
                                className={input}
                                name="color"
                            >
                                <option value="blue">{text('أزرق', 'Blue')}</option>
                                <option value="green">{text('أخضر', 'Green')}</option>
                                <option value="purple">{text('بنفسجي', 'Purple')}</option>
                                <option value="orange">{text('برتقالي', 'Orange')}</option>
                            </select>
                        </label>

                        {error && (
                            <p
                                role="alert"
                                className="mb-4 text-xs text-red-600"
                            >
                                {error}
                            </p>
                        )}

                        <button
                            disabled={busy}
                            className={`${primary} w-full`}
                        >
                            {text('حفظ المشروع', 'Save project')}
                        </button>
                    </form>
                </Modal>
            </main>
        </AppShell>
    );
}

/**
 * Render the KPI summary used by overview, list and team views.
 */
function Summary({
    tasks,
    members,
    ar,
    team,
}: {
    tasks: Task[];
    members: Member[];
    ar: boolean;
    team?: boolean;
}) {
    const completed = tasks.filter(
        (task: Task) => task.status === 'completed',
    ).length;
    const active = tasks.filter(
        (task: Task) => task.status !== 'completed',
    );
    const assigned = new Set(
        active.flatMap((task: Task) => task.assignees),
    ).size;

    return (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Stat
                title={ar ? 'إجمالي المهام' : 'Total tasks'}
                value={tasks.length}
                icon={ListTodo}
                hint={ar ? 'ضمن نطاق صلاحياتك' : 'Within your access scope'}
            />
            <Stat
                title={ar ? 'المهام المتأخرة' : 'Overdue tasks'}
                value={tasks.filter(overdue).length}
                icon={Clock3}
                color="red"
                hint={ar ? 'تجاوزت تاريخ الاستحقاق' : 'Past the due date'}
            />
            <Stat
                title={ar ? 'المهام المكتملة' : 'Completed tasks'}
                value={completed}
                icon={CheckCircle2}
                color="green"
                hint={ar ? 'تم إنجازها بنجاح' : 'Successfully completed'}
            />
            <Stat
                title={ar ? 'نسبة الإنجاز' : 'Completion rate'}
                value={`${tasks.length ? Math.round(completed / tasks.length * 100) : 0}%`}
                icon={Gauge}
                hint={ar ? 'من إجمالي المهام الظاهرة' : 'Of visible tasks'}
            />
            <Stat
                title={
                    team
                        ? ar
                            ? 'أعضاء لديهم مهام نشطة'
                            : 'Members with active work'
                        : ar
                            ? 'المهام قيد التنفيذ'
                            : 'Tasks in progress'
                }
                value={
                    team
                        ? `${assigned} / ${members.length}`
                        : tasks.filter((task: Task) => task.status === 'in_progress').length
                }
                icon={team ? UsersRound : Activity}
                color="purple"
                hint={
                    team
                        ? ar
                            ? 'التوزيع الحالي للعمل'
                            : 'Current work distribution'
                        : ar
                            ? 'يجري العمل عليها الآن'
                            : 'Currently being worked on'
                }
            />
        </div>
    );
}

/**
 * Render the shared task filters for all data surfaces.
 */
function FiltersBar({
    data,
    filters,
    onChange,
    ar,
}: {
    data: TaskData;
    filters: Filters;
    onChange: (value: Filters) => void;
    ar: boolean;
}) {
    /**
     * Update one filter without discarding the rest.
     */
    const change = (
        key: keyof Filters,
        value: string,
    ): void => {
        onChange({
            ...filters,
            [key]: value,
        });
    };

    const departments = Array.from(
        new Set(
            data.members
                .map((member: Member) => member.department)
                .filter((department): department is string => Boolean(department)),
        ),
    );

    return (
        <div className="tm-panel mb-4 flex flex-wrap items-center gap-2 !p-3">
            <Filter
                size={16}
                className="text-blue-500"
            />

            <label className="relative min-w-44 flex-[2]">
                <Search
                    size={14}
                    className="absolute start-3 top-3 text-slate-400"
                />
                <input
                    className={`${input} !ps-9`}
                    aria-label={ar ? 'البحث في المهام' : 'Search tasks'}
                    placeholder={ar ? 'ابحث في المهام…' : 'Search tasks…'}
                    value={filters.search}
                    onChange={(event) => change('search', event.target.value)}
                />
            </label>

            <select
                className={`${input} min-w-28 flex-1 !w-auto`}
                aria-label={ar ? 'المشروع' : 'Project'}
                value={filters.project}
                onChange={(event) => change('project', event.target.value)}
            >
                <option value="">{ar ? 'جميع المشاريع' : 'All projects'}</option>
                {data.projects.map((project: Project) => (
                    <option
                        key={project.id}
                        value={project.id}
                    >
                        {project.name}
                    </option>
                ))}
            </select>

            <select
                className={`${input} min-w-28 flex-1 !w-auto`}
                aria-label={ar ? 'الموظف' : 'Assignee'}
                value={filters.assignee}
                onChange={(event) => change('assignee', event.target.value)}
            >
                <option value="">{ar ? 'جميع الموظفين' : 'All members'}</option>
                {data.members.map((member: Member) => (
                    <option
                        key={member.id}
                        value={member.id}
                    >
                        {member.name}
                    </option>
                ))}
            </select>

            <select
                className={`${input} min-w-24 flex-1 !w-auto`}
                aria-label={ar ? 'الأولوية' : 'Priority'}
                value={filters.priority}
                onChange={(event) => change('priority', event.target.value)}
            >
                <option value="">{ar ? 'جميع الأولويات' : 'All priorities'}</option>
                {(Object.entries(priorityMeta) as Array<[
                    Priority,
                    (typeof priorityMeta)[Priority],
                ]>).map(([key, meta]) => (
                    <option
                        key={key}
                        value={key}
                    >
                        {meta[ar ? 'ar' : 'en']}
                    </option>
                ))}
            </select>

            <select
                className={`${input} min-w-24 flex-1 !w-auto`}
                aria-label={ar ? 'القسم' : 'Department'}
                value={filters.department}
                onChange={(event) => change('department', event.target.value)}
            >
                <option value="">{ar ? 'جميع الأقسام' : 'All departments'}</option>
                {departments.map((department: string) => (
                    <option
                        key={department}
                        value={department}
                    >
                        {department}
                    </option>
                ))}
            </select>

            <select
                className={`${input} min-w-24 flex-1 !w-auto`}
                aria-label={ar ? 'الاستحقاق' : 'Due date'}
                value={filters.due}
                onChange={(event) => change('due', event.target.value)}
            >
                <option value="">{ar ? 'كل التواريخ' : 'All dates'}</option>
                <option value="today">{ar ? 'تستحق اليوم' : 'Due today'}</option>
                <option value="overdue">{ar ? 'متأخرة' : 'Overdue'}</option>
            </select>

            <button
                type="button"
                className={button}
                onClick={() => onChange(emptyFilters)}
            >
                {ar ? 'إعادة ضبط' : 'Reset'}
            </button>
        </div>
    );
}

/**
 * Render the paginated, sortable task table with CSV export.
 */
function TaskTable({
    tasks,
    data,
    ar,
    onOpen,
    status,
    onStatus,
}: {
    tasks: Task[];
    data: TaskData;
    ar: boolean;
    onOpen: (id: number) => void;
    status: string;
    onStatus: (status: string) => void;
}) {
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState('due');
    const [selected, setSelected] = useState<number[]>([]);

    const sorted = [...tasks].sort((a: Task, b: Task) => (
        sort === 'title'
            ? a.title.localeCompare(b.title)
            : sort === 'recent'
                ? b.id - a.id
                : (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999')
    ));

    const pages = Math.max(1, Math.ceil(sorted.length / 12));
    const current = Math.min(page, pages);
    const visible = sorted.slice((current - 1) * 12, current * 12);
    const allSelected =
        visible.length > 0
        && visible.every((task: Task) => selected.includes(task.id));

    const statusTabs: Array<[string, string]> = [
        ['', ar ? 'الكل' : 'All'],
        ...(Object.entries(statusMeta) as Array<[
            TaskStatus,
            (typeof statusMeta)[TaskStatus],
        ]>).map(([key, value]) => [
            key,
            value[ar ? 'ar' : 'en'],
        ] as [string, string]),
        ['overdue', ar ? 'متأخرة' : 'Overdue'],
    ];

    /**
     * Export the current task result set or selected rows as safe CSV.
     */
    function exportTasks(): void {
        const exportRows = tasks.filter((task: Task) => (
            ! selected.length || selected.includes(task.id)
        ));

        const rows: string[][] = [
            [
                ar ? 'المهمة' : 'Task',
                ar ? 'الحالة' : 'Status',
                ar ? 'الأولوية' : 'Priority',
                ar ? 'الاستحقاق' : 'Due',
            ],
            ...exportRows.map((task: Task) => [
                task.title,
                statusMeta[task.status][ar ? 'ar' : 'en'],
                priorityMeta[task.priority][ar ? 'ar' : 'en'],
                task.due_on ?? '',
            ]),
        ];

        const csv = '\uFEFF' + rows
            .map((row: string[]) => row
                .map((value: string) => {
                    const protectedValue = /^[=+@\-\t\r]/.test(value)
                        ? `'${value}`
                        : value;

                    return `"${protectedValue.replaceAll('"', '""')}"`;
                })
                .join(','))
            .join('\r\n');

        const url = URL.createObjectURL(
            new Blob([csv], { type: 'text/csv;charset=utf-8' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = 'tasks.csv';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return (
        <section className="tm-panel">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                    {statusTabs.map(([key, label]) => (
                        <button
                            type="button"
                            className={
                                status === key
                                    ? `${button} !border-blue-200 !bg-blue-50 !text-blue-600`
                                    : button
                            }
                            key={key}
                            onClick={() => {
                                onStatus(key);
                                setPage(1);
                            }}
                            aria-pressed={status === key}
                        >
                            {label}
                            <span className="rounded bg-slate-50 px-1.5 text-[10px]">
                                {data.tasks.filter((task: Task) => (
                                    ! key
                                    || (
                                        key === 'overdue'
                                            ? overdue(task)
                                            : task.status === key
                                    )
                                )).length}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="flex gap-2">
                    <select
                        aria-label={ar ? 'ترتيب المهام' : 'Sort tasks'}
                        className={`${input} !w-auto`}
                        value={sort}
                        onChange={(event) => setSort(event.target.value)}
                    >
                        <option value="due">{ar ? 'تاريخ الاستحقاق' : 'Due date'}</option>
                        <option value="recent">{ar ? 'الأحدث' : 'Newest'}</option>
                        <option value="title">{ar ? 'العنوان' : 'Title'}</option>
                    </select>
                    <button
                        type="button"
                        className={button}
                        disabled={! tasks.length}
                        onClick={exportTasks}
                    >
                        <ArrowDownToLine size={14} />
                        {ar ? 'تصدير' : 'Export'}
                        {selected.length > 0 && ` (${selected.filter(
                            (id: number) => tasks.some((task: Task) => task.id === id),
                        ).length})`}
                    </button>
                </div>
            </div>

            {visible.length ? (
                <div className="overflow-x-auto">
                    <table className="tm-table">
                        <thead>
                            <tr>
                                <th>
                                    <input
                                        aria-label={ar ? 'تحديد مهام الصفحة' : 'Select page'}
                                        type="checkbox"
                                        className="accent-blue-500"
                                        checked={allSelected}
                                        onChange={(event) => setSelected(
                                            event.target.checked
                                                ? Array.from(new Set([
                                                      ...selected,
                                                      ...visible.map((task: Task) => task.id),
                                                  ]))
                                                : selected.filter(
                                                      (id: number) => ! visible.some(
                                                          (task: Task) => task.id === id,
                                                      ),
                                                  ),
                                        )}
                                    />
                                </th>
                                {[
                                    ar ? 'المهمة' : 'Task',
                                    ar ? 'الحالة' : 'Status',
                                    ar ? 'الأولوية' : 'Priority',
                                    ar ? 'المشروع' : 'Project',
                                    ar ? 'المسند إليه' : 'Assigned to',
                                    ar ? 'تاريخ الاستحقاق' : 'Due date',
                                    ar ? 'التقدم' : 'Progress',
                                    ar ? 'إجراءات' : 'Actions',
                                ].map((label: string) => (
                                    <th key={label}>{label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((task: Task) => (
                                <tr key={task.id}>
                                    <td>
                                        <input
                                            aria-label={`${ar ? 'تحديد' : 'Select'} ${task.title}`}
                                            className="accent-blue-500"
                                            type="checkbox"
                                            checked={selected.includes(task.id)}
                                            onChange={(event) => setSelected(
                                                event.target.checked
                                                    ? Array.from(new Set([
                                                          ...selected,
                                                          task.id,
                                                      ]))
                                                    : selected.filter(
                                                          (id: number) => id !== task.id,
                                                      ),
                                            )}
                                        />
                                    </td>
                                    <td>
                                        <button
                                            type="button"
                                            onClick={() => onOpen(task.id)}
                                            className="block max-w-72 text-start"
                                        >
                                            <span className="flex items-center gap-2 font-semibold hover:text-blue-600">
                                                <ListTodo
                                                    size={15}
                                                    className="shrink-0 text-blue-500"
                                                />
                                                {task.title}
                                            </span>
                                            <span className="mt-1 block truncate text-[9px] text-slate-400">
                                                {task.description || `TSK-${task.id}`}
                                            </span>
                                        </button>
                                    </td>
                                    <td>
                                        <StatusBadge
                                            status={task.status}
                                            ar={ar}
                                        />
                                    </td>
                                    <td>
                                        <PriorityBadge
                                            priority={task.priority}
                                            ar={ar}
                                        />
                                    </td>
                                    <td>
                                        <Badge>
                                            {data.projects.find(
                                                (project: Project) => project.id === task.project_id,
                                            )?.name ?? '—'}
                                        </Badge>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <Assignees
                                                task={task}
                                                members={data.members}
                                            />
                                            <span className="text-[10px]">
                                                {data.members.find(
                                                    (member: Member) => member.id === task.assignees[0],
                                                )?.name ?? (ar ? 'غير مسندة' : 'Unassigned')}
                                            </span>
                                        </div>
                                    </td>
                                    <td>
                                        <DueDate
                                            task={task}
                                            ar={ar}
                                        />
                                    </td>
                                    <td className="min-w-24">
                                        <Progress value={task.progress} />
                                    </td>
                                    <td>
                                        <button
                                            type="button"
                                            className="rounded border border-slate-100 p-1 text-slate-400 hover:text-blue-500"
                                            aria-label={ar ? 'تفاصيل المهمة' : 'Task details'}
                                            onClick={() => onOpen(task.id)}
                                        >
                                            <MoreHorizontal size={17} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <Empty ar={ar} />
            )}

            <div className="mt-4 flex items-center justify-between gap-3 text-[10px] text-slate-400">
                <span>
                    {ar ? 'إجمالي النتائج:' : 'Total results:'} {tasks.length}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className={button}
                        disabled={current === 1}
                        onClick={() => setPage(current - 1)}
                        aria-label={ar ? 'السابق' : 'Previous'}
                    >
                        <ChevronRight size={12} />
                    </button>
                    <span>{current} / {pages}</span>
                    <button
                        type="button"
                        className={button}
                        disabled={current === pages}
                        onClick={() => setPage(current + 1)}
                        aria-label={ar ? 'التالي' : 'Next'}
                    >
                        <ChevronLeft size={12} />
                    </button>
                </div>
            </div>
        </section>
    );
}

/**
 * Render the drag-and-drop task board grouped by workflow status.
 */
function Board({
    tasks,
    data,
    ar,
    onOpen,
    onMove,
    busy,
}: {
    tasks: Task[];
    data: TaskData;
    ar: boolean;
    onOpen?: (id: number) => void;
    onMove: (task: Task, status: TaskStatus) => void;
    busy: boolean;
}) {
    const [dragged, setDragged] = useState<number | null>(null);
    const canEdit = data.permissions.includes('tasks.update');
    const statuses = Object.entries(statusMeta) as Array<[
        TaskStatus,
        (typeof statusMeta)[TaskStatus],
    ]>;

    return (
        <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {statuses.map(([status, meta]) => {
                    const Icon = meta.icon;
                    const count = tasks.filter(
                        (task: Task) => task.status === status,
                    ).length;

                    return (
                        <div
                            key={status}
                            className={`flex items-center gap-3 rounded-xl border border-white px-4 py-3 tm-${meta.color}`}
                        >
                            <Icon size={23} />
                            <div>
                                <strong className="text-xs">
                                    {meta[ar ? 'ar' : 'en']}
                                </strong>
                                <p className="mt-1 text-[10px] opacity-70">
                                    {count} {ar ? 'مهمة في هذه المرحلة' : 'tasks in this stage'}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
                {statuses.map(([status, meta]) => {
                    const Icon = meta.icon;
                    const statusTasks = tasks.filter(
                        (task: Task) => task.status === status,
                    );

                    return (
                        <section
                            key={status}
                            className={`tm-board-column tm-${meta.color}`}
                            onDragOver={(event) => {
                                if (canEdit && ! busy) {
                                    event.preventDefault();
                                }
                            }}
                            onDrop={(event) => {
                                event.preventDefault();
                                const task = tasks.find(
                                    (item: Task) => item.id === dragged,
                                );
                                setDragged(null);

                                if (task && canEdit && ! busy) {
                                    onMove(task, status);
                                }
                            }}
                        >
                            <header className="mb-4 flex items-center justify-between px-1">
                                <h2 className="flex items-center gap-2 text-sm font-bold">
                                    <Icon size={18} />
                                    {meta[ar ? 'ar' : 'en']}
                                </h2>
                                <span className="rounded-full bg-white/60 px-2 py-1 text-xs">
                                    {statusTasks.length}
                                </span>
                            </header>

                            <div className="space-y-3">
                                {statusTasks.map((task: Task) => (
                                    <article
                                        key={task.id}
                                        draggable={canEdit && ! busy}
                                        onDragStart={() => setDragged(task.id)}
                                        onDragEnd={() => setDragged(null)}
                                        className={`tm-board-card text-[#1c2c50] ${dragged === task.id ? 'opacity-40' : ''}`}
                                    >
                                        <button
                                            type="button"
                                            className="mb-3 w-full text-start text-xs font-semibold leading-6 disabled:cursor-default"
                                            disabled={! onOpen}
                                            onClick={() => onOpen?.(task.id)}
                                        >
                                            {task.title}
                                        </button>

                                        <div className="mb-3 flex items-center justify-between gap-2">
                                            <PriorityBadge
                                                priority={task.priority}
                                                ar={ar}
                                            />
                                            <Assignees
                                                task={task}
                                                members={data.members}
                                            />
                                        </div>

                                        <Progress value={task.progress} />

                                        <div className="my-3 flex items-center justify-between gap-2">
                                            <DueDate
                                                task={task}
                                                ar={ar}
                                            />
                                            <span className="flex items-center gap-2 text-[10px] text-slate-400">
                                                <span className="inline-flex items-center gap-1">
                                                    <MessageSquare size={11} />
                                                    {task.comments_count ?? 0}
                                                </span>
                                                <span className="inline-flex items-center gap-1">
                                                    <Paperclip size={11} />
                                                    {task.attachments_count ?? 0}
                                                </span>
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap gap-1">
                                            {task.project_id && (
                                                <Badge>
                                                    {data.projects.find(
                                                        (project: Project) => project.id === task.project_id,
                                                    )?.name ?? '—'}
                                                </Badge>
                                            )}
                                            {task.tags.slice(0, 2).map((tag: string) => (
                                                <Badge
                                                    color="purple"
                                                    key={tag}
                                                >
                                                    {tag}
                                                </Badge>
                                            ))}
                                        </div>

                                        {canEdit && (
                                            <select
                                                className={`${input} mt-3 !min-h-7 !py-1.5 !text-[10px]`}
                                                disabled={busy}
                                                aria-label={`${ar ? 'نقل المهمة' : 'Move task'} ${task.title}`}
                                                value={task.status}
                                                onChange={(event) => onMove(
                                                    task,
                                                    event.target.value as TaskStatus,
                                                )}
                                            >
                                                {statuses.map(([key, value]) => (
                                                    <option
                                                        key={key}
                                                        value={key}
                                                    >
                                                        {value[ar ? 'ar' : 'en']}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </article>
                                ))}

                                {! statusTasks.length && (
                                    <div className="rounded-lg border border-dashed border-current/15 p-6 text-center text-[11px] opacity-70">
                                        {ar
                                            ? 'لا توجد مهام في هذه المرحلة'
                                            : 'No tasks in this stage'}
                                    </div>
                                )}
                            </div>

                            {data.permissions.includes('tasks.create') && (
                                <Link
                                    className="mt-3 flex items-center justify-center gap-1 rounded-lg p-2 text-[11px] hover:bg-white/50"
                                    href={`${base}/create?status=${status}`}
                                >
                                    <Plus size={13} />
                                    {ar ? 'إضافة مهمة جديدة' : 'Add a new task'}
                                </Link>
                            )}
                        </section>
                    );
                })}
            </div>
        </>
    );
}

/**
 * Render project cards with completion and overdue metrics.
 */
function ProjectCards({
    data,
    tasks,
    ar,
    onSelect,
}: {
    data: TaskData;
    tasks: Task[];
    ar: boolean;
    onSelect: (id: number) => void;
}) {
    if (! data.projects.length) {
        return (
            <Empty
                ar={ar}
                text={
                    ar
                        ? 'لا توجد مشاريع بعد. أضف مشروعك الأول من الزر أعلاه.'
                        : 'No projects yet. Create your first project above.'
                }
            />
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.projects.map((project: Project) => {
                const items = tasks.filter(
                    (task: Task) => task.project_id === project.id,
                );
                const completed = items.filter(
                    (task: Task) => task.status === 'completed',
                ).length;

                return (
                    <Panel
                        key={project.id}
                        title={project.name}
                        icon={FolderKanban}
                        action={(
                            <Badge color={project.color ?? 'blue'}>
                                {items.length} {ar ? 'مهمة' : 'tasks'}
                            </Badge>
                        )}
                    >
                        <p className="mb-6 min-h-10 text-xs leading-6 text-slate-400">
                            {project.description || (
                                ar
                                    ? 'لا يوجد وصف للمشروع.'
                                    : 'No project description.'
                            )}
                        </p>
                        <Progress
                            value={
                                items.length
                                    ? Math.round(completed / items.length * 100)
                                    : 0
                            }
                        />
                        <div className="my-4 flex justify-between text-[11px] text-slate-400">
                            <span>
                                {completed} {ar ? 'مكتملة' : 'completed'}
                            </span>
                            <span>
                                {items.filter(overdue).length} {ar ? 'متأخرة' : 'overdue'}
                            </span>
                        </div>
                        <button
                            type="button"
                            className={`${button} w-full`}
                            onClick={() => onSelect(project.id)}
                        >
                            {ar ? 'فتح لوحة المشروع' : 'Open project board'}
                            <ArrowUpRight size={13} />
                        </button>
                    </Panel>
                );
            })}
        </div>
    );
}

/**
 * Render a donut-style distribution by task status or priority.
 */
function Distribution({
    tasks,
    ar,
    byPriority = false,
}: {
    tasks: Task[];
    ar: boolean;
    byPriority?: boolean;
}) {
    const rows = byPriority
        ? (Object.entries(priorityMeta) as Array<[
              Priority,
              (typeof priorityMeta)[Priority],
          ]>).map(([key, meta], index) => ({
              label: meta[ar ? 'ar' : 'en'],
              count: tasks.filter((task: Task) => task.priority === key).length,
              color: ['#fa5872', '#ffba38', '#28c58b'][index] ?? '#98a8c1',
          }))
        : (Object.entries(statusMeta) as Array<[
              TaskStatus,
              (typeof statusMeta)[TaskStatus],
          ]>).map(([key, meta], index) => ({
              label: meta[ar ? 'ar' : 'en'],
              count: tasks.filter((task: Task) => task.status === key).length,
              color: ['#98a8c1', '#3290ff', '#ffbd43', '#2dc78e'][index] ?? '#98a8c1',
          }));

    let offset = 0;
    const segments = rows
        .map((row) => {
            const start = offset;
            offset += tasks.length
                ? row.count / tasks.length * 100
                : 0;

            return `${row.color} ${start}% ${offset}%`;
        })
        .join(',');

    return (
        <div className="flex flex-wrap items-center justify-around gap-5">
            <div
                className="flex size-36 shrink-0 items-center justify-center rounded-full"
                style={{
                    background: tasks.length
                        ? `conic-gradient(${segments})`
                        : '#edf2fa',
                }}
            >
                <div className="flex size-24 flex-col items-center justify-center rounded-full bg-white">
                    <strong className="text-2xl">{tasks.length}</strong>
                    <span className="mt-1 text-[9px] text-slate-400">
                        {ar ? 'إجمالي المهام' : 'Total tasks'}
                    </span>
                </div>
            </div>

            <div className="space-y-4">
                {rows.map((row) => (
                    <p
                        key={row.label}
                        className="flex items-center gap-3 text-[11px]"
                    >
                        <span
                            className="size-2 rounded-full"
                            style={{ background: row.color }}
                        />
                        <span className="min-w-14 text-slate-500">
                            {row.label}
                        </span>
                        <strong>{row.count}</strong>
                        <span className="text-[9px] text-slate-400">
                            ({tasks.length
                                ? Math.round(row.count / tasks.length * 100)
                                : 0}%)
                        </span>
                    </p>
                ))}
            </div>
        </div>
    );
}

/**
 * Render the dashboard analytics, upcoming work and recent activity.
 */
function Dashboard({
    data,
    tasks,
    ar,
    onOpen,
}: {
    data: TaskData;
    tasks: Task[];
    ar: boolean;
    onOpen?: (id: number) => void;
}) {
    const visibleIds = new Set(tasks.map((task: Task) => task.id));
    const events = data.events.filter(
        (event: TaskActivityEvent) => (
            event.task_id !== null
            && visibleIds.has(event.task_id)
        ),
    );

    const heat = Array.from(
        { length: 70 },
        (_value: unknown, index: number) => {
            const date = new Date();
            date.setDate(date.getDate() - 69 + index);
            const key = [
                date.getFullYear(),
                String(date.getMonth() + 1).padStart(2, '0'),
                String(date.getDate()).padStart(2, '0'),
            ].join('-');

            return {
                key,
                count: events.filter(
                    (event: TaskActivityEvent) => event.created_at.slice(0, 10) === key,
                ).length,
            };
        },
    );

    const current = [...tasks]
        .filter((task: Task) => task.status !== 'completed')
        .sort((a: Task, b: Task) => (
            (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999')
        ))
        .slice(0, 6);

    return (
        <div className="grid gap-4 xl:grid-cols-3">
            <Panel
                title={ar ? 'نشاط الفريق' : 'Team activity'}
                icon={Activity}
            >
                <p className="mb-5 text-[10px] text-slate-400">
                    {ar
                        ? 'آخر 100 تحديث متاح خلال 10 أسابيع'
                        : 'Up to 100 recent updates over 10 weeks'}
                </p>
                <div className="grid grid-flow-col grid-rows-7 gap-1.5">
                    {heat.map((day) => (
                        <div
                            key={day.key}
                            title={`${day.key}: ${day.count}`}
                            className="aspect-square rounded-[3px]"
                            style={{
                                background:
                                    day.count === 0
                                        ? '#edf3fc'
                                        : day.count < 3
                                            ? '#a8d7ff'
                                            : day.count < 6
                                                ? '#58b1ff'
                                                : '#1670ff',
                            }}
                        />
                    ))}
                </div>
                <div className="mt-4 flex justify-between text-[9px] text-slate-400">
                    <span>{ar ? 'قبل 10 أسابيع' : '10 weeks ago'}</span>
                    <span>{ar ? 'اليوم' : 'Today'}</span>
                </div>
            </Panel>

            <Panel
                title={ar ? 'توزيع المهام حسب الحالة' : 'Tasks by status'}
                icon={BarChart3}
            >
                <div className="space-y-5">
                    {(Object.entries(statusMeta) as Array<[
                        TaskStatus,
                        (typeof statusMeta)[TaskStatus],
                    ]>).map(([key, meta]) => {
                        const count = tasks.filter(
                            (task: Task) => task.status === key,
                        ).length;

                        return (
                            <div key={key}>
                                <div className="mb-2 flex justify-between text-[11px]">
                                    <span>{meta[ar ? 'ar' : 'en']}</span>
                                    <span className="text-slate-400">{count}</span>
                                </div>
                                <div className="h-3 overflow-hidden rounded bg-slate-100">
                                    <div
                                        className={`h-full ${
                                            key === 'completed'
                                                ? 'bg-emerald-400'
                                                : key === 'review'
                                                    ? 'bg-amber-400'
                                                    : key === 'idea'
                                                        ? 'bg-slate-300'
                                                        : 'bg-blue-400'
                                        }`}
                                        style={{
                                            width: `${tasks.length ? count / tasks.length * 100 : 0}%`,
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Panel>

            <Panel
                title={ar ? 'توزيع المهام حسب الأولوية' : 'Tasks by priority'}
                icon={Flag}
            >
                <Distribution
                    tasks={tasks}
                    ar={ar}
                    byPriority
                />
            </Panel>

            <Panel
                title={ar ? 'أعباء العمل للفريق' : 'Team workload'}
                icon={UsersRound}
            >
                <div className="space-y-4">
                    {data.members.slice(0, 6).map((member: Member) => {
                        const items = tasks.filter(
                            (task: Task) => task.assignees.includes(member.id),
                        );

                        return (
                            <div
                                key={member.id}
                                className="flex items-center gap-2"
                            >
                                <Avatar member={member} />
                                <span className="min-w-0 flex-1 truncate text-[11px]">
                                    {member.name}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                    {items.filter(
                                        (task: Task) => task.status !== 'completed',
                                    ).length} {ar ? 'نشطة' : 'active'}
                                </span>
                                <span className="text-[10px] text-red-400">
                                    {items.filter(overdue).length}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </Panel>

            <Panel
                title={ar ? 'مواعيد المهام القادمة' : 'Upcoming tasks'}
                icon={CalendarDays}
            >
                {current.length ? (
                    <div className="space-y-2">
                        {current.map((task: Task) => (
                            <button
                                type="button"
                                disabled={! onOpen}
                                onClick={() => onOpen?.(task.id)}
                                key={task.id}
                                className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-3 text-start hover:bg-blue-50 disabled:cursor-default"
                            >
                                <span className="min-w-0 flex-1 truncate text-[11px]">
                                    {task.title}
                                </span>
                                <PriorityBadge
                                    priority={task.priority}
                                    ar={ar}
                                />
                                <DueDate
                                    task={task}
                                    ar={ar}
                                />
                            </button>
                        ))}
                    </div>
                ) : (
                    <Empty
                        ar={ar}
                        text={ar ? 'لا توجد مهام قادمة حاليًا.' : 'No upcoming tasks.'}
                    />
                )}
            </Panel>

            <Panel
                title={ar ? 'أحدث الأنشطة' : 'Recent activity'}
                icon={Activity}
            >
                {events.length ? (
                    <div className="space-y-4">
                        {events.slice(0, 6).map((event: TaskActivityEvent) => (
                            <div
                                key={event.id}
                                className="flex items-start gap-3"
                            >
                                <span className="mt-1 size-2 rounded-full bg-emerald-400" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-semibold">
                                        {event.name}
                                    </p>
                                    <p className="mt-1 truncate text-[10px] text-slate-400">
                                        {actions[event.action]?.[ar ? 0 : 1] ?? event.action}
                                        {' · '}
                                        {tasks.find(
                                            (task: Task) => task.id === event.task_id,
                                        )?.title ?? '—'}
                                    </p>
                                </div>
                                <span className="text-[9px] text-slate-400">
                                    {dateLabel(event.created_at, ar)}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <Empty
                        ar={ar}
                        text={
                            ar
                                ? 'سيظهر نشاط الفريق عند إضافة المهام وتحديثها.'
                                : 'Team activity appears as tasks are created and updated.'
                        }
                    />
                )}
            </Panel>
        </div>
    );
}

/**
 * Render the Team & Workload hub with internal navigation for the overview,
 * member directory, recently active members, and department summary.
 */
function TeamCenter({
    data,
    tasks,
    ar,
    section,
}: {
    data: TaskData;
    tasks: Task[];
    ar: boolean;
    section: TeamSection;
}) {
    const [team, setTeam] = useState<TeamApiResponse | null>(null);
    const [teamLoading, setTeamLoading] = useState(true);
    const [teamError, setTeamError] = useState('');
    const [search, setSearch] = useState('');
    const [department, setDepartment] = useState('');

    /**
     * Return localized Team Center copy.
     */
    const text = (arabic: string, english: string): string => (
        ar ? arabic : english
    );

    useEffect(() => {
        const controller = new AbortController();
        setTeamLoading(true);
        setTeamError('');

        apiRequest<TeamApiResponse>(
            `${api}/team`,
            { signal: controller.signal },
        )
            .then((value: TeamApiResponse) => setTeam(value))
            .catch((failure: unknown) => {
                if (! controller.signal.aborted) {
                    setTeamError(errorText(failure));
                }
            })
            .finally(() => {
                if (! controller.signal.aborted) {
                    setTeamLoading(false);
                }
            });

        return () => controller.abort();
    }, []);

    const canViewFullTeam = data.permissions.includes('tasks.view_all');

    /*
     * Team managers can inspect workload and members inside their permitted
     * scope. Presence and company-wide department analytics require view_all.
     */
    const sections: Array<{
        key: TeamSection;
        ar: string;
        en: string;
        href: string;
    }> = [
        {
            key: 'overview',
            ar: 'الفريق وعبء العمل',
            en: 'Team & workload',
            href: `${base}/team`,
        },
        {
            key: 'members',
            ar: 'أعضاء الفريق',
            en: 'Team members',
            href: `${base}/team?section=members`,
        },
        ...(canViewFullTeam
            ? [
                  {
                      key: 'active' as TeamSection,
                      ar: 'الأعضاء النشطون',
                      en: 'Active members',
                      href: `${base}/team?section=active`,
                  },
                  {
                      key: 'departments' as TeamSection,
                      ar: 'ملخص الأقسام',
                      en: 'Departments',
                      href: `${base}/team?section=departments`,
                  },
              ]
            : []),
    ];

    const departmentNames = Array.from(
        new Set(
            data.members
                .map((member: Member) => member.department)
                .filter((value): value is string => Boolean(value)),
        ),
    );

    const memberProfile = (memberId: number): Member | undefined => (
        data.members.find((member: Member) => member.id === memberId)
    );

    const visibleMembers = (team?.members ?? []).filter((member: TeamApiMember) => {
        const profile = memberProfile(member.id);
        const haystack = `${member.name} ${member.job_title ?? ''} ${profile?.department ?? ''}`
            .toLocaleLowerCase();

        return (
            (! search || haystack.includes(search.toLocaleLowerCase()))
            && (! department || profile?.department === department)
        );
    });

    const visibleActive = (team?.active_members ?? []).filter((member: TeamApiActiveMember) => {
        const profile = memberProfile(member.id);
        const haystack = `${member.name} ${member.job_title ?? ''} ${profile?.department ?? ''}`
            .toLocaleLowerCase();

        return (
            (! search || haystack.includes(search.toLocaleLowerCase()))
            && (! department || profile?.department === department)
        );
    });

    const totalActiveTasks = (team?.members ?? []).reduce(
        (sum: number, member: TeamApiMember) => sum + member.active_tasks,
        0,
    );
    const totalOverdue = (team?.members ?? []).reduce(
        (sum: number, member: TeamApiMember) => sum + member.overdue_tasks,
        0,
    );
    const totalCompleted = (team?.members ?? []).reduce(
        (sum: number, member: TeamApiMember) => sum + member.completed_tasks,
        0,
    );
    const averageCompletion = (team?.members.length ?? 0) > 0
        ? Math.round(
              (team?.members ?? []).reduce(
                  (sum: number, member: TeamApiMember) => sum + member.completion_rate,
                  0,
              ) / (team?.members.length ?? 1),
          )
        : 0;

    /**
     * Format the real database-session activity timestamp without claiming
     * second-by-second presence.
     */
    function activeLabel(timestamp: number): string {
        if (! timestamp) {
            return text('نشاط غير متاح', 'Activity unavailable');
        }

        const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
        const minutes = Math.floor(seconds / 60);

        if (minutes <= 1) {
            return text('نشط الآن تقريبًا', 'Active about now');
        }

        return text(
            `نشط منذ ${minutes} دقيقة`,
            `Active ${minutes} min ago`,
        );
    }

    return (
        <div>
            <div className="tm-panel mb-4 !p-2">
                <div className="flex gap-2 overflow-x-auto">
                    {sections.map((item) => (
                        <Link
                            key={item.key}
                            href={item.href}
                            preserveScroll
                            className={`${section === item.key ? primary : button} shrink-0`}
                        >
                            {ar ? item.ar : item.en}
                        </Link>
                    ))}
                </div>
            </div>

            {section !== 'overview' && (
                <div className="tm-panel mb-4 flex flex-wrap items-center gap-2 !p-3">
                    <Search size={16} className="text-blue-500" />
                    <label className="relative min-w-52 flex-[2]">
                        <Search
                            size={14}
                            className="absolute start-3 top-3 text-slate-400"
                        />
                        <input
                            className={`${input} !ps-9`}
                            aria-label={text('البحث في أعضاء الفريق', 'Search team members')}
                            placeholder={text('ابحث بالاسم أو المسمى أو القسم…', 'Search name, title or department…')}
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </label>
                    <select
                        className={`${input} min-w-40 !w-auto`}
                        aria-label={text('القسم', 'Department')}
                        value={department}
                        onChange={(event) => setDepartment(event.target.value)}
                    >
                        <option value="">
                            {text('جميع الأقسام', 'All departments')}
                        </option>
                        {departmentNames.map((name: string) => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        className={button}
                        onClick={() => {
                            setSearch('');
                            setDepartment('');
                        }}
                    >
                        {text('إعادة ضبط', 'Reset')}
                    </button>
                </div>
            )}

            {teamError && (
                <div
                    role="alert"
                    className="mb-4 rounded-xl border border-red-100 bg-red-50 p-4 text-xs text-red-600"
                >
                    {teamError}
                </div>
            )}

            {teamLoading && ! team ? (
                <div className="tm-panel p-12 text-center text-sm text-slate-400">
                    {text('جارٍ تحميل بيانات الفريق…', 'Loading team data…')}
                </div>
            ) : section === 'overview' ? (
                <>
                    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <Stat
                            title={text('إجمالي أعضاء الفريق', 'Team members')}
                            value={team?.members.length ?? data.members.length}
                            icon={UsersRound}
                            hint={text('ضمن نطاق صلاحياتك', 'Within your permission scope')}
                        />
                        <Stat
                            title={text('نشطون خلال 15 دقيقة', 'Active in last 15 min')}
                            value={team?.active_members.length ?? 0}
                            icon={Activity}
                            color="green"
                            hint={text('مبني على جلسات النظام', 'Based on application sessions')}
                        />
                        <Stat
                            title={text('المهام النشطة', 'Active assignments')}
                            value={totalActiveTasks}
                            icon={ListTodo}
                            hint={text('المسندة للفريق حاليًا', 'Currently assigned to the team')}
                        />
                        <Stat
                            title={text('المهام المتأخرة', 'Overdue assignments')}
                            value={totalOverdue}
                            icon={Clock3}
                            color="red"
                            hint={text('تجاوزت تاريخ الاستحقاق', 'Past the due date')}
                        />
                        <Stat
                            title={text('متوسط الإنجاز', 'Average completion')}
                            value={`${averageCompletion}%`}
                            icon={Gauge}
                            color="purple"
                            hint={text(`${totalCompleted} مهمة مكتملة`, `${totalCompleted} completed tasks`)}
                        />
                    </div>
                    <TeamWorkload
                        data={data}
                        tasks={tasks}
                        ar={ar}
                    />
                </>
            ) : section === 'members' ? (
                <TeamMembersSurface
                    ar={ar}
                    members={visibleMembers}
                    data={data}
                />
            ) : section === 'active' ? (
                <ActiveMembersSurface
                    ar={ar}
                    members={visibleActive}
                    team={team}
                    data={data}
                    activeLabel={activeLabel}
                />
            ) : (
                <DepartmentsSurface
                    ar={ar}
                    departments={team?.departments ?? []}
                />
            )}
        </div>
    );
}

/**
 * Render the team member directory as responsive profile cards backed by
 * real staff workload metrics.
 */
function TeamMembersSurface({
    ar,
    members,
    data,
}: {
    ar: boolean;
    members: TeamApiMember[];
    data: TaskData;
}) {
    const text = (arabic: string, english: string): string => (
        ar ? arabic : english
    );

    const loadLabel: Record<TeamApiMember['load'], [string, string, string]> = {
        light: ['خفيف', 'Light', 'green'],
        balanced: ['متوازن', 'Balanced', 'blue'],
        busy: ['مرتفع', 'Busy', 'amber'],
        critical: ['حرج', 'Critical', 'red'],
    };

    if (! members.length) {
        return (
            <Empty
                ar={ar}
                text={text('لا يوجد أعضاء يطابقون البحث الحالي.', 'No members match the current search.')}
            />
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {members.map((member: TeamApiMember) => {
                const profile = data.members.find(
                    (item: Member) => item.id === member.id,
                );
                const load = loadLabel[member.load];

                return (
                    <Panel
                        key={member.id}
                        title={member.name}
                        icon={UsersRound}
                        action={<Badge color={load[2]}>{ar ? load[0] : load[1]}</Badge>}
                    >
                        <div className="mb-5 flex items-center gap-3">
                            <Avatar
                                member={{ id: member.id, name: member.name }}
                                size="large"
                            />
                            <div className="min-w-0">
                                <p className="truncate text-xs font-semibold">
                                    {member.job_title ?? profile?.job_title ?? text('عضو فريق', 'Team member')}
                                </p>
                                <p className="mt-1 truncate text-[10px] text-slate-400">
                                    {profile?.department ?? text('بدون قسم', 'No department')}
                                </p>
                                {profile?.email && (
                                    <p className="mt-1 truncate text-[9px] text-slate-400">
                                        {profile.email}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-lg bg-blue-50 p-3">
                                <strong className="block text-sm text-blue-600">
                                    {member.active_tasks}
                                </strong>
                                <span className="mt-1 block text-[9px] text-slate-400">
                                    {text('نشطة', 'Active')}
                                </span>
                            </div>
                            <div className="rounded-lg bg-emerald-50 p-3">
                                <strong className="block text-sm text-emerald-600">
                                    {member.completed_tasks}
                                </strong>
                                <span className="mt-1 block text-[9px] text-slate-400">
                                    {text('مكتملة', 'Completed')}
                                </span>
                            </div>
                            <div className="rounded-lg bg-red-50 p-3">
                                <strong className="block text-sm text-red-500">
                                    {member.overdue_tasks}
                                </strong>
                                <span className="mt-1 block text-[9px] text-slate-400">
                                    {text('متأخرة', 'Overdue')}
                                </span>
                            </div>
                        </div>

                        <div className="mt-5">
                            <div className="mb-2 flex justify-between text-[10px]">
                                <span className="text-slate-500">
                                    {text('معدل الإنجاز', 'Completion rate')}
                                </span>
                                <strong>{member.completion_rate}%</strong>
                            </div>
                            <Progress
                                value={member.completion_rate}
                                label={false}
                            />
                        </div>
                    </Panel>
                );
            })}
        </div>
    );
}

/**
 * Render recently active members from database-backed session activity.
 */
function ActiveMembersSurface({
    ar,
    members,
    team,
    data,
    activeLabel,
}: {
    ar: boolean;
    members: TeamApiActiveMember[];
    team: TeamApiResponse | null;
    data: TaskData;
    activeLabel: (timestamp: number) => string;
}) {
    const text = (arabic: string, english: string): string => (
        ar ? arabic : english
    );

    const memberRows = team?.members ?? [];
    const totalActiveTasks = memberRows.reduce(
        (sum: number, member: TeamApiMember) => sum + member.active_tasks,
        0,
    );
    const totalOverdue = memberRows.reduce(
        (sum: number, member: TeamApiMember) => sum + member.overdue_tasks,
        0,
    );

    return (
        <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                    title={text('نشطون خلال 15 دقيقة', 'Active in last 15 min')}
                    value={members.length}
                    icon={Activity}
                    color="green"
                    hint={text('من جلسات التطبيق الحالية', 'From current application sessions')}
                />
                <Stat
                    title={text('إجمالي أعضاء الفريق', 'Total team members')}
                    value={memberRows.length}
                    icon={UsersRound}
                />
                <Stat
                    title={text('المهام النشطة', 'Active assignments')}
                    value={totalActiveTasks}
                    icon={ListTodo}
                />
                <Stat
                    title={text('المهام المتأخرة', 'Overdue assignments')}
                    value={totalOverdue}
                    icon={Clock3}
                    color="red"
                />
            </div>

            <Panel
                title={text('الأعضاء النشطون', 'Recently active members')}
                icon={Activity}
            >
                {members.length ? (
                    <div className="overflow-x-auto">
                        <table className="tm-table">
                            <thead>
                                <tr>
                                    {[
                                        text('العضو', 'Member'),
                                        text('القسم', 'Department'),
                                        text('المسمى', 'Job title'),
                                        text('المهام النشطة', 'Active tasks'),
                                        text('الإنجاز', 'Completion'),
                                        text('آخر نشاط', 'Last activity'),
                                    ].map((label: string) => (
                                        <th key={label}>{label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {members.map((member: TeamApiActiveMember) => {
                                    const profile = data.members.find(
                                        (item: Member) => item.id === member.id,
                                    );
                                    const workload = memberRows.find(
                                        (item: TeamApiMember) => item.id === member.id,
                                    );

                                    return (
                                        <tr key={member.id}>
                                            <td>
                                                <span className="flex items-center gap-2">
                                                    <Avatar
                                                        member={{ id: member.id, name: member.name }}
                                                    />
                                                    <strong>{member.name}</strong>
                                                </span>
                                            </td>
                                            <td>{profile?.department ?? '—'}</td>
                                            <td>{member.job_title ?? profile?.job_title ?? '—'}</td>
                                            <td>{workload?.active_tasks ?? 0}</td>
                                            <td className="min-w-28">
                                                <Progress
                                                    value={workload?.completion_rate ?? 0}
                                                />
                                            </td>
                                            <td>
                                                <span className="inline-flex items-center gap-2 text-emerald-600">
                                                    <span className="size-2 rounded-full bg-emerald-400" />
                                                    {activeLabel(member.last_activity)}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <Empty
                        ar={ar}
                        text={text(
                            'لا يوجد أعضاء لديهم جلسة نشطة خلال آخر 15 دقيقة، أو أن تخزين الجلسات ليس عبر قاعدة البيانات.',
                            'No members have an active session in the last 15 minutes, or database sessions are not enabled.',
                        )}
                    />
                )}
            </Panel>
        </>
    );
}

/**
 * Render department-level workload and completion metrics from the real team
 * summary endpoint.
 */
function DepartmentsSurface({
    ar,
    departments,
}: {
    ar: boolean;
    departments: TeamApiDepartment[];
}) {
    const text = (arabic: string, english: string): string => (
        ar ? arabic : english
    );
    const totalMembers = departments.reduce(
        (sum: number, item: TeamApiDepartment) => sum + item.members,
        0,
    );
    const totalTasks = departments.reduce(
        (sum: number, item: TeamApiDepartment) => sum + item.tasks_total,
        0,
    );
    const totalCompleted = departments.reduce(
        (sum: number, item: TeamApiDepartment) => sum + item.completed,
        0,
    );
    const totalOverdue = departments.reduce(
        (sum: number, item: TeamApiDepartment) => sum + item.overdue,
        0,
    );
    const averageCompletion = departments.length
        ? Math.round(
              departments.reduce(
                  (sum: number, item: TeamApiDepartment) => sum + item.completion_rate,
                  0,
              ) / departments.length,
          )
        : 0;

    if (! departments.length) {
        return (
            <Empty
                ar={ar}
                text={text('لا توجد أقسام متاحة ضمن نطاق صلاحياتك.', 'No departments are available within your access scope.')}
            />
        );
    }

    return (
        <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Stat
                    title={text('إجمالي الأقسام', 'Departments')}
                    value={departments.length}
                    icon={FolderKanban}
                />
                <Stat
                    title={text('إجمالي الأعضاء', 'Members')}
                    value={totalMembers}
                    icon={UsersRound}
                />
                <Stat
                    title={text('إجمالي المهام', 'Total tasks')}
                    value={totalTasks}
                    icon={ListTodo}
                />
                <Stat
                    title={text('المهام المتأخرة', 'Overdue tasks')}
                    value={totalOverdue}
                    icon={Clock3}
                    color="red"
                />
                <Stat
                    title={text('متوسط الإنجاز', 'Average completion')}
                    value={`${averageCompletion}%`}
                    icon={Gauge}
                    color="green"
                    hint={text(`${totalCompleted} مهمة مكتملة`, `${totalCompleted} completed tasks`)}
                />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {departments.map((department: TeamApiDepartment) => (
                    <Panel
                        key={department.id}
                        title={department.name}
                        icon={FolderKanban}
                        action={(
                            <Badge color={department.overdue > 0 ? 'amber' : 'green'}>
                                {department.members} {text('أعضاء', 'members')}
                            </Badge>
                        )}
                    >
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-lg bg-blue-50 p-3">
                                <strong className="block text-sm text-blue-600">
                                    {department.tasks_total}
                                </strong>
                                <span className="mt-1 block text-[9px] text-slate-400">
                                    {text('مهام', 'Tasks')}
                                </span>
                            </div>
                            <div className="rounded-lg bg-emerald-50 p-3">
                                <strong className="block text-sm text-emerald-600">
                                    {department.completed}
                                </strong>
                                <span className="mt-1 block text-[9px] text-slate-400">
                                    {text('مكتملة', 'Completed')}
                                </span>
                            </div>
                            <div className="rounded-lg bg-red-50 p-3">
                                <strong className="block text-sm text-red-500">
                                    {department.overdue}
                                </strong>
                                <span className="mt-1 block text-[9px] text-slate-400">
                                    {text('متأخرة', 'Overdue')}
                                </span>
                            </div>
                        </div>
                        <div className="mt-5">
                            <div className="mb-2 flex justify-between text-[10px]">
                                <span className="text-slate-500">
                                    {text('معدل إنجاز القسم', 'Department completion')}
                                </span>
                                <strong>{department.completion_rate}%</strong>
                            </div>
                            <Progress
                                value={department.completion_rate}
                                label={false}
                            />
                        </div>
                    </Panel>
                ))}
            </div>
        </>
    );
}

/**
 * Render workload analytics by member and department using visible tasks only.
 */
function TeamWorkload({
    data,
    tasks,
    ar,
}: {
    data: TaskData;
    tasks: Task[];
    ar: boolean;
}) {
    const memberStats: MemberWorkload[] = data.members.map((member: Member) => {
        const items = tasks.filter(
            (task: Task) => task.assignees.includes(member.id),
        );
        const activeItems = items.filter(
            (task: Task) => task.status !== 'completed',
        );

        return {
            ...member,
            tasks: items.length,
            active: activeItems.length,
            overdue: items.filter(overdue).length,
            completed: items.filter(
                (task: Task) => task.status === 'completed',
            ).length,
            hours: activeItems.reduce(
                (sum: number, task: Task) => (
                    sum
                    + task.estimated_hours
                    / Math.max(1, task.assignees.length)
                ),
                0,
            ),
        };
    });

    const max = Math.max(
        1,
        ...memberStats.map((member: MemberWorkload) => member.active),
    );

    const departmentNames = Array.from(
        new Set(
            memberStats.map((member: MemberWorkload) => (
                member.department ?? (ar ? 'بدون قسم' : 'No department')
            )),
        ),
    );

    const departments: DepartmentWorkload[] = departmentNames.map(
        (name: string) => {
            const members = memberStats.filter((member: MemberWorkload) => (
                (member.department ?? (ar ? 'بدون قسم' : 'No department')) === name
            ));

            return {
                name,
                members: members.length,
                active: members.reduce(
                    (sum: number, member: MemberWorkload) => sum + member.active,
                    0,
                ),
                overdue: members.reduce(
                    (sum: number, member: MemberWorkload) => sum + member.overdue,
                    0,
                ),
            };
        },
    );

    const maxDepartmentActive = Math.max(
        1,
        ...departments.map((department: DepartmentWorkload) => department.active),
    );

    const modulePermissions: Array<[string, string]> = [
        ['tasks.view', ar ? 'عرض المهام' : 'View tasks'],
        ['tasks.create', ar ? 'إنشاء مهام' : 'Create tasks'],
        ['tasks.update', ar ? 'تعديل مهام' : 'Edit tasks'],
        ['tasks.assign', ar ? 'إسناد مهام' : 'Assign tasks'],
        ['tasks.projects.manage', ar ? 'إدارة المشاريع' : 'Manage projects'],
        ['tasks.view_all', ar ? 'عرض مهام مساحة العمل' : 'View workspace tasks'],
    ];

    return (
        <div className="grid gap-4 xl:grid-cols-3">
            <Panel
                title={ar ? 'أعضاء الفريق' : 'Team members'}
                icon={UsersRound}
            >
                <div className="flex flex-wrap justify-around gap-4 py-3">
                    {memberStats.slice(0, 6).map((member: MemberWorkload) => (
                        <div
                            key={member.id}
                            className="w-16 text-center"
                        >
                            <Avatar
                                member={member}
                                size="large"
                            />
                            <p className="mt-2 truncate text-[10px] font-semibold">
                                {member.name}
                            </p>
                            <p className="mt-1 text-[9px] text-slate-400">
                                {member.active} {ar ? 'مهام نشطة' : 'active tasks'}
                            </p>
                        </div>
                    ))}
                </div>
                <p className="mt-5 rounded-lg bg-blue-50 p-3 text-[10px] leading-5 text-blue-600">
                    {ar
                        ? 'جميع الأرقام مبنية على المهام التي تسمح صلاحياتك بعرضها.'
                        : 'All metrics reflect the tasks visible within your permission scope.'}
                </p>
            </Panel>

            <Panel
                title={ar ? 'المهام النشطة حسب القسم' : 'Active assignments by department'}
                icon={BarChart3}
            >
                <div className="space-y-5">
                    {departments.map((department: DepartmentWorkload) => (
                        <div key={department.name}>
                            <div className="mb-2 flex justify-between text-[11px]">
                                <span>{department.name}</span>
                                <span>{department.active}</span>
                            </div>
                            <div className="h-2 rounded bg-slate-100">
                                <div
                                    className="h-2 rounded bg-blue-400"
                                    style={{
                                        width: `${department.active / maxDepartmentActive * 100}%`,
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </Panel>

            <Panel
                title={ar ? 'توزيع مهام الفريق' : 'Team task distribution'}
                icon={Gauge}
            >
                <Distribution
                    tasks={tasks}
                    ar={ar}
                />
            </Panel>

            <Panel
                title={ar ? 'أعضاء الفريق وعبء العمل' : 'Members & workload'}
                icon={UsersRound}
                className="xl:col-span-2"
            >
                <div className="overflow-x-auto">
                    <table className="tm-table">
                        <thead>
                            <tr>
                                {[
                                    ar ? 'الموظف' : 'Member',
                                    ar ? 'القسم' : 'Department',
                                    ar ? 'المهام النشطة' : 'Active',
                                    ar ? 'المتأخرة' : 'Overdue',
                                    ar ? 'المكتملة' : 'Completed',
                                    ar ? 'ساعات مخططة' : 'Planned hours',
                                    ar ? 'حصة المهام' : 'Relative workload',
                                ].map((label: string) => (
                                    <th key={label}>{label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {memberStats.map((member: MemberWorkload) => (
                                <tr key={member.id}>
                                    <td>
                                        <span className="flex items-center gap-2">
                                            <Avatar member={member} />
                                            {member.name}
                                        </span>
                                    </td>
                                    <td>{member.department ?? '—'}</td>
                                    <td>{member.active}</td>
                                    <td className="text-red-500">{member.overdue}</td>
                                    <td className="text-emerald-500">{member.completed}</td>
                                    <td>{member.hours.toFixed(1)}</td>
                                    <td>
                                        <div className="min-w-24">
                                            <Progress
                                                value={Math.round(member.active / max * 100)}
                                                label={false}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-3 text-[10px] leading-5 text-slate-400">
                    {ar
                        ? 'الساعات المخططة موزعة بالتساوي على المسؤولين عن المهمة؛ المؤشر يقارن عدد المهام بأعلى عدد لدى عضو، وليس قياسًا لساعات الحضور.'
                        : 'Planned hours are split across assignees. Bars compare active task counts with the busiest member, not attendance hours.'}
                </p>
            </Panel>

            <Panel
                title={ar ? 'ملخص الأقسام' : 'Department summary'}
                icon={FolderKanban}
            >
                <div className="space-y-4">
                    {departments.map((department: DepartmentWorkload) => (
                        <div
                            key={department.name}
                            className="rounded-lg border border-slate-100 p-3"
                        >
                            <h3 className="text-xs font-semibold">
                                {department.name}
                            </h3>
                            <div className="mt-3 flex justify-between text-[10px] text-slate-400">
                                <span>
                                    {department.members} {ar ? 'أعضاء' : 'members'}
                                </span>
                                <span>
                                    {department.active} {ar ? 'إسناد نشط' : 'active assignments'}
                                </span>
                                <span className="text-red-400">
                                    {department.overdue} {ar ? 'متأخر' : 'overdue'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </Panel>

            <Panel
                title={ar ? 'صلاحيات القسم' : 'Module permissions'}
                icon={ShieldCheck}
                className="xl:col-span-3"
            >
                <div className="flex flex-wrap gap-4">
                    {modulePermissions.map(([permission, label]) => (
                        <span
                            key={permission}
                            className="flex items-center gap-2 text-xs"
                        >
                            <CheckMark value={data.permissions.includes(permission)} />
                            {label}
                        </span>
                    ))}
                </div>
                <p className="mt-4 text-[10px] text-slate-400">
                    {ar
                        ? 'تعرض هذه القائمة صلاحيات حسابك الحالي، ويمكن للمالك تعديل الأدوار من صفحة الصلاحيات.'
                        : 'These are your current permissions. The owner can manage roles on the permissions page.'}
                </p>
            </Panel>
        </div>
    );
}
