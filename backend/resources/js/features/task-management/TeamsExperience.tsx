import { apiRequest } from '@/lib/http';
import {
    Link,
    router,
} from '@inertiajs/react';
import {
    Activity,
    ArrowLeft,
    BarChart3,
    BriefcaseBusiness,
    CheckCircle2,
    Code2,
    Crown,
    EllipsisVertical,
    FolderKanban,
    Gauge,
    Layers3,
    Link2,
    ListTodo,
    MoreHorizontal,
    Pencil,
    Plus,
    Search,
    Settings2,
    ShieldCheck,
    Smartphone,
    Sparkles,
    UserRoundPlus,
    UsersRound,
    X,
    type LucideIcon,
} from 'lucide-react';
import {
    useMemo,
    useState,
    type FormEvent,
} from 'react';
import {
    Avatar,
    Badge,
    Modal,
    Panel,
    Progress,
    Stat,
    api,
    base,
    errorText,
    button,
    input,
    primary,
} from './ui';
import type {
    Member,
    Project,
    Task,
    TaskActivityEvent,
    TaskData,
    TaskTeam,
} from './types';

export type TeamsView =
    | 'teams'
    | 'teams-create'
    | 'teams-detail'
    | 'teams-members';

type TeamTone = 'blue' | 'green' | 'amber' | 'purple';

type UiTeam = {
    id: number;
    nameAr: string;
    nameEn: string;
    descriptionAr: string;
    descriptionEn: string;
    tone: TeamTone;
    Icon: LucideIcon;
    members: Member[];
    leader?: Member;
    projects: Project[];
    tasks: Task[];
    workload: number;
    department?: string | null;
    capacity: number;
    priority: 'low' | 'medium' | 'high';
};

const teamVisuals: Array<{
    tone: TeamTone;
    Icon: LucideIcon;
}> = [
    { tone: 'blue', Icon: Code2 },
    { tone: 'green', Icon: Layers3 },
    { tone: 'green', Icon: Smartphone },
    { tone: 'amber', Icon: ShieldCheck },
    { tone: 'purple', Icon: UsersRound },
];

const toneClasses: Record<TeamTone, string> = {
    blue: 'bg-blue-500 text-white',
    green: 'bg-emerald-500 text-white',
    amber: 'bg-amber-400 text-white',
    purple: 'bg-violet-500 text-white',
};

/**
 * Render the Teams UI family: teams list, create, team details and member
 * management using the persisted teams returned by Task Management.
 */
export function TeamsExperience({
    view,
    teamId,
    data,
    tasks,
    ar,
    onChanged,
}: {
    view: TeamsView;
    teamId: number | null;
    data: TaskData;
    tasks: Task[];
    ar: boolean;
    onChanged: () => void;
}) {
    const teams = useMemo(
        () => buildTeams(data, tasks),
        [data, tasks],
    );
    const selected = teams.find((team: UiTeam) => team.id === teamId) ?? null;

    if (view === 'teams-create') {
        return (
            <CreateTeamSurface
                data={data}
                ar={ar}
            />
        );
    }

    if (view === 'teams-members') {
        return selected ? (
            <TeamMembersSurface
                team={selected}
                data={data}
                ar={ar}
                onChanged={onChanged}
            />
        ) : (
            <MissingTeam ar={ar} />
        );
    }

    if (view === 'teams-detail') {
        return selected ? (
            <TeamDetailSurface
                team={selected}
                data={data}
                ar={ar}
                onChanged={onChanged}
            />
        ) : (
            <MissingTeam ar={ar} />
        );
    }

    return (
        <TeamsHub
            teams={teams}
            data={data}
            tasks={tasks}
            ar={ar}
        />
    );
}

/**
 * Join persisted team records with the current member/project/task payload.
 */
function buildTeams(
    data: TaskData,
    tasks: Task[],
): UiTeam[] {
    return (data.teams ?? []).map((team: TaskTeam, index: number) => {
        const visual = teamVisuals[index % teamVisuals.length];
        const members = data.members.filter(
            (member: Member) => team.member_ids.includes(member.id),
        );
        const memberIds = new Set(team.member_ids);
        const projects = data.projects.filter(
            (project: Project) => team.project_ids.includes(project.id),
        );
        const projectIds = new Set(team.project_ids);
        const teamTasks = tasks.filter((task: Task) => (
            task.assignees.some((id: number) => memberIds.has(id))
            || (task.project_id !== null && projectIds.has(task.project_id))
        ));
        const active = teamTasks.filter((task: Task) => task.status !== 'completed');
        const workload = Math.min(
            100,
            Math.round(active.length / Math.max(1, team.capacity) * 25),
        );

        return {
            id: team.id,
            nameAr: team.name,
            nameEn: team.name,
            descriptionAr: team.description ?? '',
            descriptionEn: team.description ?? '',
            tone: visual.tone,
            Icon: visual.Icon,
            members,
            leader: data.members.find((member: Member) => member.id === team.leader_id),
            projects,
            tasks: teamTasks,
            workload,
            department: team.department,
            capacity: team.capacity,
            priority: team.priority,
        };
    });
}

function MissingTeam({
    ar,
}: {
    ar: boolean;
}) {
    return (
        <Panel
            title={ar ? 'الفريق غير موجود' : 'Team not found'}
            icon={UsersRound}
        >
            <div className="py-8 text-center">
                <p className="text-xs text-slate-400">
                    {ar
                        ? 'لم يتم العثور على هذا الفريق ضمن نطاق صلاحياتك.'
                        : 'This team was not found in your permission scope.'}
                </p>
                <Link
                    href={base + '/teams'}
                    className={button + ' mt-4'}
                >
                    {ar ? 'العودة إلى الفرق' : 'Back to teams'}
                </Link>
            </div>
        </Panel>
    );
}

function TeamsHub({
    teams,
    data,
    tasks,
    ar,
}: {
    teams: UiTeam[];
    data: TaskData;
    tasks: Task[];
    ar: boolean;
}) {
    const text = (arabic: string, english: string): string => ar ? arabic : english;
    const departments = Array.from(
        new Set(
            data.members
                .map((member: Member) => member.department)
                .filter((value): value is string => Boolean(value)),
        ),
    );
    const [department, setDepartment] = useState(departments[0] ?? '');
    const visibleTeams = department
        ? teams.filter((team: UiTeam) => team.department === department)
        : teams;
    const visibleProjectIds = new Set(
        visibleTeams.flatMap((team: UiTeam) => team.projects.map((project: Project) => project.id)),
    );
    const activeProjects = visibleProjectIds.size;
    const averageWorkload = visibleTeams.length
        ? Math.round(
              visibleTeams.reduce(
                  (sum: number, team: UiTeam) => sum + team.workload,
                  0,
              ) / visibleTeams.length,
          )
        : 0;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-52 items-center gap-2">
                    <select
                        className={input + ' min-w-52 !w-auto'}
                        aria-label={text('القسم', 'Department')}
                        value={department}
                        onChange={(event) => setDepartment(event.target.value)}
                    >
                        {! departments.length && (
                            <option value="">
                                {text('القسم الحالي', 'Current department')}
                            </option>
                        )}
                        {departments.map((name: string) => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                </div>

                <Link
                    href={base + '/teams/create'}
                    className={primary}
                >
                    <Plus size={16} />
                    {text('إنشاء فريق', 'Create team')}
                </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                    title={text('إجمالي الفرق', 'Total teams')}
                    value={visibleTeams.length}
                    icon={UsersRound}
                    hint={text('فرق داخل القسم', 'Teams in this department')}
                />
                <Stat
                    title={text('إجمالي أعضاء القسم', 'Department members')}
                    value={
                        department
                            ? data.members.filter((member: Member) => member.department === department).length
                            : data.members.length
                    }
                    icon={UserRoundPlus}
                    hint={text('موظفون ضمن نطاقك', 'Members in your scope')}
                />
                <Stat
                    title={text('المشاريع النشطة', 'Active projects')}
                    value={activeProjects}
                    icon={FolderKanban}
                    color="green"
                    hint={text(
                        tasks.filter((task: Task) => task.status === 'completed').length + ' مهمة مكتملة',
                        tasks.filter((task: Task) => task.status === 'completed').length + ' completed tasks',
                    )}
                />
                <Stat
                    title={text('متوسط عبء العمل', 'Average workload')}
                    value={averageWorkload + '%'}
                    icon={BarChart3}
                    color="red"
                    hint={text('عبر جميع الفرق', 'Across all teams')}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(300px,.8fr)]">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {visibleTeams.map((team: UiTeam) => (
                        <TeamCard
                            key={team.id}
                            team={team}
                            ar={ar}
                        />
                    ))}

                    <Link
                        href={base + '/teams/create'}
                        className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-7 text-center transition hover:border-blue-300 hover:bg-blue-50/30"
                    >
                        <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                            <UsersRound size={28} />
                        </span>
                        <strong className="text-sm">
                            {text('إنشاء فريق جديد', 'Create a new team')}
                        </strong>
                        <span className="mt-2 text-[11px] leading-6 text-slate-400">
                            {text('قم بإنشاء فريق جديد داخل هذا القسم', 'Create another team inside this department')}
                        </span>
                        <span className={button + ' mt-5'}>
                            <Plus size={14} />
                            {text('إنشاء فريق', 'Create team')}
                        </span>
                    </Link>
                </div>

                <aside className="space-y-4">
                    <Panel
                        title={text('توزيع أعضاء القسم', 'Department member distribution')}
                        icon={UsersRound}
                    >
                        <TeamDistribution
                            teams={visibleTeams}
                            total={
                                department
                                    ? data.members.filter((member: Member) => member.department === department).length
                                    : data.members.length
                            }
                            ar={ar}
                        />
                    </Panel>

                    <Panel
                        title={text('عبء العمل حسب الفريق', 'Workload by team')}
                        icon={Gauge}
                    >
                        <div className="space-y-4">
                            {visibleTeams.map((team: UiTeam) => (
                                <div key={team.id}>
                                    <div className="mb-2 flex items-center justify-between text-[10px]">
                                        <span>{ar ? team.nameAr : team.nameEn}</span>
                                        <strong>{team.workload}%</strong>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                        <div
                                            className={
                                                'h-full rounded-full '
                                                + (team.workload >= 80
                                                    ? 'bg-red-400'
                                                    : team.workload >= 65
                                                        ? 'bg-amber-400'
                                                        : 'bg-emerald-400')
                                            }
                                            style={{ width: team.workload + '%' }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Panel>

                    <Panel
                        title={text('أحدث الأنشطة', 'Recent activity')}
                        icon={Activity}
                    >
                        <RecentActivity
                            events={data.events}
                            tasks={tasks}
                            ar={ar}
                        />
                    </Panel>
                </aside>
            </div>
        </div>
    );
}

function TeamCard({
    team,
    ar,
}: {
    team: UiTeam;
    ar: boolean;
}) {
    const text = (arabic: string, english: string): string => ar ? arabic : english;
    const Icon = team.Icon;

    return (
        <section className="tm-panel flex min-h-72 flex-col">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className={'flex size-11 items-center justify-center rounded-xl ' + toneClasses[team.tone]}>
                        <Icon size={22} />
                    </span>
                    <div>
                        <h2 className="text-sm font-bold">
                            {ar ? team.nameAr : team.nameEn}
                        </h2>
                        <p className="mt-1 text-[10px] text-slate-400">
                            {ar ? team.descriptionAr : team.descriptionEn}
                        </p>
                    </div>
                </div>
                <MoreHorizontal size={18} className="text-slate-400" />
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                <Metric value={team.members.length} label={text('أعضاء', 'Members')} />
                <Metric value={team.projects.length} label={text('مشاريع', 'Projects')} />
                <Metric value={team.workload + '%'} label={text('عبء العمل', 'Workload')} />
            </div>

            <div className="mb-4">
                <p className="mb-2 text-[10px] text-slate-400">
                    {text('قائد الفريق', 'Team lead')}
                </p>
                <div className="flex items-center gap-2">
                    <Avatar member={team.leader} />
                    <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">
                            {team.leader?.name ?? text('لم يتم التعيين', 'Not assigned')}
                        </p>
                        <p className="truncate text-[9px] text-slate-400">
                            {team.leader?.job_title ?? text('قائد الفريق', 'Team lead')}
                        </p>
                    </div>
                </div>
            </div>

            <div className="mb-5 flex min-h-8 items-center">
                <div className="flex -space-x-2 rtl:space-x-reverse">
                    {team.members.slice(0, 5).map((member: Member) => (
                        <Avatar key={member.id} member={member} />
                    ))}
                </div>
                {team.members.length > 5 && (
                    <span className="ms-2 text-[10px] text-blue-500">
                        +{team.members.length - 5}
                    </span>
                )}
            </div>

            <div className="mt-auto grid grid-cols-2 gap-2">
                <Link
                    href={base + '/teams/' + team.id}
                    className={button}
                >
                    {text('عرض الفريق', 'View team')}
                </Link>
                <Link
                    href={base + '/teams/' + team.id + '/members'}
                    className={primary}
                >
                    {text('إدارة الأعضاء', 'Manage members')}
                </Link>
            </div>
        </section>
    );
}

function Metric({
    value,
    label,
}: {
    value: string | number;
    label: string;
}) {
    return (
        <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-2 py-3">
            <strong className="block text-base">{value}</strong>
            <span className="mt-1 block text-[9px] text-slate-400">{label}</span>
        </div>
    );
}

function TeamDistribution({
    teams,
    total,
    ar,
}: {
    teams: UiTeam[];
    total: number;
    ar: boolean;
}) {
    const colors = ['#2879ff', '#fb5f67', '#22b987', '#ffb72b'];
    let offset = 0;
    const segments = teams.map((team: UiTeam, index: number) => {
        const start = offset;
        offset += total ? team.members.length / total * 100 : 25;

        return colors[index] + ' ' + start + '% ' + offset + '%';
    }).join(',');

    return (
        <div className="flex flex-wrap items-center justify-around gap-5">
            <div
                className="flex size-32 items-center justify-center rounded-full"
                style={{ background: total ? 'conic-gradient(' + segments + ')' : '#edf2fa' }}
            >
                <div className="flex size-20 flex-col items-center justify-center rounded-full bg-white">
                    <strong className="text-2xl">{total}</strong>
                    <span className="text-[9px] text-slate-400">
                        {ar ? 'موظف' : 'members'}
                    </span>
                </div>
            </div>

            <div className="min-w-40 space-y-3">
                {teams.map((team: UiTeam, index: number) => (
                    <div
                        key={team.id}
                        className="flex items-center gap-2 text-[10px]"
                    >
                        <span
                            className="size-2 rounded-full"
                            style={{ background: colors[index] }}
                        />
                        <span className="min-w-0 flex-1 truncate">
                            {ar ? team.nameAr : team.nameEn}
                        </span>
                        <strong>{team.members.length}</strong>
                    </div>
                ))}
            </div>
        </div>
    );
}

function CreateTeamSurface({
    data,
    ar,
}: {
    data: TaskData;
    ar: boolean;
}) {
    const text = (arabic: string, english: string): string => ar ? arabic : english;
    const departments = Array.from(
        new Set(
            data.members
                .map((member: Member) => member.department)
                .filter((value): value is string => Boolean(value)),
        ),
    );
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [department, setDepartment] = useState(departments[0] ?? '');
    const [leader, setLeader] = useState('');
    const [capacity, setCapacity] = useState('8');
    const [priority, setPriority] = useState('medium');
    const [memberSearch, setMemberSearch] = useState('');
    const [submitError, setSubmitError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
    const [selectedProjects, setSelectedProjects] = useState<number[]>(
        data.projects.slice(0, 3).map((project: Project) => project.id),
    );

    const departmentMembers = data.members.filter((member: Member) => (
        ! department || member.department === department
    ));
    const memberSearchValue = memberSearch.trim().toLocaleLowerCase();
    const availableMembers = departmentMembers
        .filter((member: Member) => ! selectedMembers.includes(member.id))
        .filter((member: Member) => {
            if (! memberSearchValue) {
                return true;
            }

            return [
                member.name,
                member.email ?? '',
                member.job_title ?? '',
            ]
                .join(' ')
                .toLocaleLowerCase()
                .includes(memberSearchValue);
        })
        .slice(0, 8);

    function addMember(id: number): void {
        const maxMembers = Math.max(1, Number(capacity) || 1);

        setSelectedMembers((current: number[]) => {
            if (current.includes(id) || current.length >= maxMembers) {
                return current;
            }

            return [...current, id];
        });
        setMemberSearch('');
    }

    function removeMember(id: number): void {
        setSelectedMembers((current: number[]) => (
            current.filter((value: number) => value !== id)
        ));

        if (leader === String(id)) {
            setLeader('');
        }
    }

    function toggleProject(id: number): void {
        setSelectedProjects((current: number[]) => (
            current.includes(id)
                ? current.filter((value: number) => value !== id)
                : [...current, id]
        ));
    }

    async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        if (submitting) {
            return;
        }

        const departmentId = departmentMembers[0]?.department_id ?? null;

        if (! name.trim()) {
            setSubmitError(text('اكتب اسم الفريق أولًا.', 'Enter a team name first.'));
            return;
        }

        if (! departmentId) {
            setSubmitError(text('اختر قسمًا صالحًا للفريق.', 'Choose a valid department.'));
            return;
        }

        if (! leader) {
            setSubmitError(text('اختر قائد الفريق.', 'Choose a team lead.'));
            return;
        }

        if (! selectedMembers.length) {
            setSubmitError(text('أضف عضوًا واحدًا على الأقل إلى الفريق.', 'Add at least one team member.'));
            return;
        }

        setSubmitting(true);
        setSubmitError('');

        try {
            const response = await apiRequest<{ team: TaskTeam }>(
                api + '/teams',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        name: name.trim(),
                        description: description.trim() || null,
                        department_id: departmentId,
                        leader_id: Number(leader),
                        capacity: Math.max(1, Number(capacity) || 1),
                        priority,
                        member_ids: selectedMembers,
                        project_ids: selectedProjects,
                    }),
                },
            );

            router.visit(base + '/teams/' + response.team.id);
        } catch (failure) {
            setSubmitError(errorText(failure));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_330px]">
            <form onSubmit={submit} className="space-y-4">
                <Panel
                    title={text('المعلومات الأساسية', 'Basic information')}
                    icon={ListTodo}
                >
                    <div className="space-y-4">
                        <label className="tm-field">
                            {text('اسم الفريق', 'Team name')}
                            <input
                                className={input}
                                value={name}
                                required
                                onChange={(event) => setName(event.target.value)}
                                placeholder={text('مثال: فريق تطوير الواجهة الأمامية', 'Example: Frontend development team')}
                            />
                        </label>

                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="tm-field">
                                {text('القسم', 'Department')}
                                <select
                                    className={input}
                                    value={department}
                                    onChange={(event) => {
                                        const nextDepartment = event.target.value;
                                        setDepartment(nextDepartment);
                                        setLeader('');
                                        setSelectedMembers([]);
                                        setMemberSearch('');
                                    }}
                                >
                                    {! departments.length && (
                                        <option value="">{text('قسم البرمجة', 'Engineering')}</option>
                                    )}
                                    {departments.map((departmentName: string) => (
                                        <option key={departmentName} value={departmentName}>
                                            {departmentName}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="tm-field">
                                {text('قائد الفريق', 'Team lead')}
                                <select
                                    className={input}
                                    value={leader}
                                    required
                                    onChange={(event) => {
                                        const nextLeader = event.target.value;
                                        setLeader(nextLeader);

                                        if (nextLeader) {
                                            addMember(Number(nextLeader));
                                        }
                                    }}
                                >
                                    <option value="">
                                        {text('اختر قائد الفريق', 'Choose team lead')}
                                    </option>
                                    {departmentMembers.map((member: Member) => (
                                        <option key={member.id} value={member.id}>
                                            {member.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <label className="tm-field">
                            {text('وصف الفريق', 'Team description')}
                            <textarea
                                className={input}
                                rows={4}
                                maxLength={500}
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                placeholder={text('اكتب وصفًا مختصرًا عن أهداف الفريق ومهامه…', 'Describe the team goals and responsibilities…')}
                            />
                            <span className="text-[9px] font-normal text-slate-400">
                                {description.length}/500
                            </span>
                        </label>
                    </div>
                </Panel>

                <Panel
                    title={text('أعضاء الفريق', 'Team members')}
                    icon={UsersRound}
                >
                    <div className="relative mb-3">
                        <Search
                            size={14}
                            className="absolute start-3 top-3 text-slate-400"
                        />
                        <input
                            className={input + ' !ps-9'}
                            value={memberSearch}
                            onChange={(event) => setMemberSearch(event.target.value)}
                            placeholder={text('البحث عن موظفين لإضافتهم إلى الفريق…', 'Search employees to add…')}
                        />

                        {memberSearch.trim() && (
                            <div className="absolute inset-x-0 top-[42px] z-30 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                                {availableMembers.length ? (
                                    availableMembers.map((member: Member) => (
                                        <div
                                            key={member.id}
                                            className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
                                        >
                                            <Avatar member={member} />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[11px] font-semibold">
                                                    {member.name}
                                                </p>
                                                <p className="truncate text-[9px] text-slate-400">
                                                    {member.job_title ?? member.email ?? text('موظف', 'Employee')}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                className={primary}
                                                disabled={selectedMembers.length >= Math.max(1, Number(capacity) || 1)}
                                                onClick={() => addMember(member.id)}
                                            >
                                                <Plus size={13} />
                                                {text('إضافة', 'Add')}
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <p className="px-3 py-4 text-center text-[10px] text-slate-400">
                                        {text(
                                            'لا يوجد موظفون متاحون يطابقون البحث.',
                                            'No available employees match this search.',
                                        )}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {selectedMembers.map((memberId: number) => {
                            const member = data.members.find(
                                (item: Member) => item.id === memberId,
                            );

                            if (! member) {
                                return null;
                            }

                            return (
                                <span
                                    key={member.id}
                                    className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[10px] text-blue-700"
                                >
                                    <Avatar member={member} />
                                    {member.name}
                                    <button
                                        type="button"
                                        aria-label={text('إزالة العضو', 'Remove member')}
                                        className="rounded-full p-0.5 hover:bg-blue-100"
                                        onClick={() => removeMember(member.id)}
                                    >
                                        <X size={11} />
                                    </button>
                                </span>
                            );
                        })}

                        {! selectedMembers.length && (
                            <span className="text-[10px] text-slate-400">
                                {text(
                                    'ابحث عن موظف ثم اضغط «إضافة».',
                                    'Search for an employee, then press “Add”.',
                                )}
                            </span>
                        )}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 text-[9px] text-slate-400">
                        <span>
                            {selectedMembers.length} / {Math.max(1, Number(capacity) || 1)}
                            {' '}
                            {text('أعضاء محددون', 'members selected')}
                        </span>
                        {! memberSearch.trim() && availableMembers.length > 0 && (
                            <span>
                                {text(
                                    'اكتب اسم الموظف في البحث لإظهار زر الإضافة.',
                                    'Type an employee name to show the Add button.',
                                )}
                            </span>
                        )}
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <label className="tm-field">
                            {text('سعة الفريق', 'Team capacity')}
                            <input
                                className={input}
                                type="number"
                                min="1"
                                max="100"
                                value={capacity}
                                onChange={(event) => {
                                    const next = event.target.value;
                                    setCapacity(next);
                                    const maxMembers = Math.max(1, Number(next) || 1);
                                    setSelectedMembers((current: number[]) => current.slice(0, maxMembers));
                                }}
                            />
                            <span className="text-[9px] font-normal text-slate-400">
                                {text('العدد الأقصى للأعضاء في الفريق', 'Maximum number of team members')}
                            </span>
                        </label>

                        <label className="tm-field">
                            {text('مستوى الأولوية', 'Priority level')}
                            <select
                                className={input}
                                value={priority}
                                onChange={(event) => setPriority(event.target.value)}
                            >
                                <option value="low">{text('منخفضة', 'Low')}</option>
                                <option value="medium">{text('متوسطة', 'Medium')}</option>
                                <option value="high">{text('عالية', 'High')}</option>
                            </select>
                        </label>
                    </div>
                </Panel>

                <Panel
                    title={text('المشاريع المبدئية', 'Initial projects')}
                    icon={FolderKanban}
                >
                    <div className="grid gap-2 md:grid-cols-2">
                        {data.projects.map((project: Project) => {
                            const selected = selectedProjects.includes(project.id);

                            return (
                                <button
                                    type="button"
                                    key={project.id}
                                    onClick={() => toggleProject(project.id)}
                                    className={
                                        'flex items-center justify-between rounded-lg border p-3 text-start '
                                        + (selected
                                            ? 'border-blue-200 bg-blue-50'
                                            : 'border-slate-100 bg-white')
                                    }
                                >
                                    <span className="flex items-center gap-2 text-xs font-semibold">
                                        <FolderKanban size={15} className="text-blue-500" />
                                        {project.name}
                                    </span>
                                    {selected && <CheckCircle2 size={16} className="text-blue-500" />}
                                </button>
                            );
                        })}
                        {! data.projects.length && (
                            <p className="text-[11px] text-slate-400">
                                {text('لا توجد مشاريع حالية للربط.', 'There are no current projects to link.')}
                            </p>
                        )}
                    </div>
                </Panel>

                {submitError && (
                    <div
                        role="alert"
                        className="rounded-xl border border-red-100 bg-red-50 p-3 text-[11px] text-red-600"
                    >
                        {submitError}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="submit"
                        className={primary}
                        disabled={submitting}
                    >
                        <Plus size={15} />
                        {submitting
                            ? text('جارٍ إنشاء الفريق…', 'Creating team…')
                            : text('إنشاء الفريق', 'Create team')}
                    </button>
                    <Link href={base + '/teams'} className={button}>
                        {text('إلغاء', 'Cancel')}
                    </Link>
                </div>
            </form>

            <aside className="space-y-4">
                <Panel
                    title={text('معاينة الفريق', 'Team preview')}
                    icon={Sparkles}
                >
                    <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 p-6 text-center">
                        <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                            <UsersRound size={28} />
                        </span>
                        <h3 className="font-bold">
                            {name || text('فريق جديد', 'New team')}
                        </h3>
                        <p className="mt-1 text-[10px] text-slate-400">
                            {department || text('قسم البرمجة', 'Engineering')}
                        </p>
                    </div>

                    <div className="mt-5 space-y-4 text-[11px]">
                        <PreviewRow
                            label={text('قائد الفريق', 'Team lead')}
                            value={
                                data.members.find((member: Member) => String(member.id) === leader)?.name
                                ?? text('لم يتم التحديد بعد', 'Not selected yet')
                            }
                        />
                        <PreviewRow
                            label={text('الأعضاء', 'Members')}
                            value={selectedMembers.length + ' ' + text('عضو', 'members')}
                        />
                        <PreviewRow
                            label={text('سعة الفريق', 'Capacity')}
                            value={capacity + ' ' + text('أعضاء', 'members')}
                        />
                        <PreviewRow
                            label={text('مستوى الأولوية', 'Priority')}
                            value={
                                priority === 'high'
                                    ? text('عالية', 'High')
                                    : priority === 'low'
                                        ? text('منخفضة', 'Low')
                                        : text('متوسطة', 'Medium')
                            }
                        />
                        <PreviewRow
                            label={text('المشاريع المرتبطة', 'Linked projects')}
                            value={selectedProjects.length + ' ' + text('مشاريع', 'projects')}
                        />
                    </div>
                </Panel>

                <Panel
                    title={text('نصائح لإنشاء فريق ناجح', 'Tips for a successful team')}
                    icon={Sparkles}
                >
                    <div className="space-y-3 text-[10px] text-slate-500">
                        {[
                            text('اختر اسمًا واضحًا ومميزًا للفريق', 'Choose a clear team name'),
                            text('قم بتعيين قائد فريق مناسب', 'Assign an appropriate team lead'),
                            text('أضف أعضاء ذوي مهارات متكاملة', 'Add complementary skills'),
                            text('حدد سعة الفريق بشكل واقعي', 'Set realistic team capacity'),
                            text('اربط المشاريع ذات الصلة', 'Link related projects'),
                        ].map((tip: string) => (
                            <p key={tip} className="flex items-center gap-2">
                                <CheckCircle2 size={14} className="text-emerald-500" />
                                {tip}
                            </p>
                        ))}
                    </div>
                </Panel>
            </aside>
        </div>
    );
}

async function updateTeamRecord(
    teamId: number,
    payload: Record<string, unknown>,
): Promise<TaskTeam> {
    const response = await apiRequest<{ team: TaskTeam }>(
        api + '/teams/' + teamId,
        {
            method: 'PATCH',
            body: JSON.stringify(payload),
        },
    );

    return response.team;
}

function PreviewRow({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="flex items-start justify-between gap-3">
            <span className="text-slate-400">{label}</span>
            <strong className="text-end">{value}</strong>
        </div>
    );
}

function TeamDetailSurface({
    team,
    data,
    ar,
    onChanged,
}: {
    team: UiTeam;
    data: TaskData;
    ar: boolean;
    onChanged: () => void;
}) {
    const text = (arabic: string, english: string): string => ar ? arabic : english;
    const Icon = team.Icon;
    const completed = team.tasks.filter((task: Task) => task.status === 'completed').length;
    const [editOpen, setEditOpen] = useState(false);
    const [projectsOpen, setProjectsOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState('');
    const [editName, setEditName] = useState(ar ? team.nameAr : team.nameEn);
    const [editDescription, setEditDescription] = useState(
        ar ? team.descriptionAr : team.descriptionEn,
    );
    const [editCapacity, setEditCapacity] = useState(String(team.capacity));
    const [editPriority, setEditPriority] = useState(team.priority);
    const [editLeader, setEditLeader] = useState(String(team.leader?.id ?? ''));
    const [projectIds, setProjectIds] = useState<number[]>(
        team.projects.map((project: Project) => project.id),
    );

    async function saveTeam(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        setBusy(true);
        setActionError('');

        try {
            await updateTeamRecord(team.id, {
                name: editName.trim(),
                description: editDescription.trim() || null,
                capacity: Math.max(team.members.length, Number(editCapacity) || 1),
                priority: editPriority,
                leader_id: Number(editLeader),
            });
            setEditOpen(false);
            onChanged();
        } catch (failure) {
            setActionError(errorText(failure));
        } finally {
            setBusy(false);
        }
    }

    async function saveProjects(): Promise<void> {
        setBusy(true);
        setActionError('');

        try {
            await updateTeamRecord(team.id, {
                project_ids: projectIds,
            });
            setProjectsOpen(false);
            onChanged();
        } catch (failure) {
            setActionError(errorText(failure));
        } finally {
            setBusy(false);
        }
    }

    async function archiveTeam(): Promise<void> {
        if (! window.confirm(
            text(
                'هل تريد أرشفة هذا الفريق؟ ستبقى البيانات محفوظة.',
                'Archive this team? Historical data will remain preserved.',
            ),
        )) {
            return;
        }

        setBusy(true);
        setActionError('');

        try {
            await apiRequest(
                api + '/teams/' + team.id,
                { method: 'DELETE' },
            );
            router.visit(base + '/teams');
        } catch (failure) {
            setActionError(errorText(failure));
            setBusy(false);
        }
    }

    return (
        <div className="space-y-4">
            {actionError && (
                <div
                    role="alert"
                    className="rounded-xl border border-red-100 bg-red-50 p-3 text-[11px] text-red-600"
                >
                    {actionError}
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className={'flex size-14 items-center justify-center rounded-xl ' + toneClasses[team.tone]}>
                        <Icon size={28} />
                    </span>
                    <div>
                        <h2 className="text-2xl font-bold">
                            {ar ? team.nameAr : team.nameEn}
                        </h2>
                        <p className="mt-1 text-xs text-slate-400">
                            {ar ? team.descriptionAr : team.descriptionEn}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <div className="relative">
                        <button
                            type="button"
                            className={button}
                            aria-expanded={moreOpen}
                            onClick={() => setMoreOpen((value: boolean) => ! value)}
                        >
                            <MoreHorizontal size={15} />
                        </button>

                        {moreOpen && (
                            <div className="absolute end-0 top-11 z-30 w-44 rounded-xl border border-slate-100 bg-white p-2 shadow-xl">
                                <button
                                    type="button"
                                    className="flex w-full items-center rounded-lg px-3 py-2 text-start text-[10px] text-red-500 hover:bg-red-50"
                                    disabled={busy}
                                    onClick={archiveTeam}
                                >
                                    <X size={13} />
                                    {text('أرشفة الفريق', 'Archive team')}
                                </button>
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        className={button}
                        onClick={() => {
                            setProjectIds(team.projects.map((project: Project) => project.id));
                            setProjectsOpen(true);
                        }}
                    >
                        <Link2 size={15} />
                        {text('ربط مشروع', 'Link project')}
                    </button>
                    <button
                        type="button"
                        className={button}
                        onClick={() => {
                            setEditName(ar ? team.nameAr : team.nameEn);
                            setEditDescription(ar ? team.descriptionAr : team.descriptionEn);
                            setEditCapacity(String(team.capacity));
                            setEditPriority(team.priority);
                            setEditLeader(String(team.leader?.id ?? ''));
                            setEditOpen(true);
                        }}
                    >
                        <Pencil size={15} />
                        {text('تعديل الفريق', 'Edit team')}
                    </button>
                    <Link
                        href={base + '/teams/' + team.id + '/members'}
                        className={primary}
                    >
                        <UsersRound size={15} />
                        {text('إدارة الأعضاء', 'Manage members')}
                    </Link>
                </div>
            </div>

            <div className="tm-panel grid gap-4 lg:grid-cols-[1.2fr_2fr]">
                <div className="flex items-center gap-4">
                    <span className={'flex size-20 items-center justify-center rounded-2xl ' + toneClasses[team.tone]}>
                        <Icon size={38} />
                    </span>
                    <div>
                        <h3 className="text-lg font-bold">
                            {ar ? team.nameAr : team.nameEn}
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">
                            {ar ? team.descriptionAr : team.descriptionEn}
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                            <Avatar member={team.leader} />
                            <div>
                                <p className="text-xs font-semibold">
                                    {team.leader?.name ?? text('لم يتم تعيين قائد', 'No lead assigned')}
                                </p>
                                <p className="text-[9px] text-slate-400">
                                    {team.leader?.job_title ?? text('قائد الفريق', 'Team lead')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <Stat
                        title={text('أعضاء', 'Members')}
                        value={team.members.length}
                        icon={UsersRound}
                    />
                    <Stat
                        title={text('مشاريع نشطة', 'Active projects')}
                        value={team.projects.length}
                        icon={FolderKanban}
                        color="green"
                        hint={text(completed + ' مهام مكتملة', completed + ' completed tasks')}
                    />
                    <Stat
                        title={text('عبء العمل', 'Workload')}
                        value={team.workload + '%'}
                        icon={BarChart3}
                        color="red"
                    />
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <Panel
                    title={text('أعضاء الفريق', 'Team members')}
                    icon={UsersRound}
                    action={(
                        <Link
                            href={base + '/teams/' + team.id + '/members'}
                            className="text-[10px] font-semibold text-blue-600"
                        >
                            {text('عرض الكل', 'View all')}
                        </Link>
                    )}
                >
                    <div className="space-y-3">
                        {team.members.map((member: Member) => (
                            <div key={member.id} className="flex items-center gap-3">
                                <Avatar member={member} size="large" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="truncate text-xs font-semibold">{member.name}</p>
                                        {member.id === team.leader?.id && (
                                            <Badge color="blue">{text('القائد', 'Lead')}</Badge>
                                        )}
                                    </div>
                                    <p className="mt-1 truncate text-[9px] text-slate-400">
                                        {member.job_title ?? text('عضو فريق', 'Team member')}
                                    </p>
                                </div>
                                <span className="size-2 rounded-full bg-emerald-400" />
                            </div>
                        ))}
                        {! team.members.length && (
                            <p className="text-[11px] text-slate-400">
                                {text('لا يوجد أعضاء في هذا الفريق بعد.', 'No team members yet.')}
                            </p>
                        )}
                    </div>
                </Panel>

                <Panel
                    title={text('المشاريع الحالية', 'Current projects')}
                    icon={FolderKanban}
                >
                    <div className="space-y-4">
                        {team.projects.map((project: Project) => {
                            const projectTasks = team.tasks.filter((task: Task) => task.project_id === project.id);
                            const done = projectTasks.filter((task: Task) => task.status === 'completed').length;
                            const progress = projectTasks.length
                                ? Math.round(done / projectTasks.length * 100)
                                : 0;

                            return (
                                <div key={project.id}>
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <strong className="truncate text-[11px]">{project.name}</strong>
                                        <span className="text-[10px] text-slate-400">{progress}%</span>
                                    </div>
                                    <Progress value={progress} label={false} />
                                </div>
                            );
                        })}
                        {! team.projects.length && (
                            <p className="text-[11px] text-slate-400">
                                {text('لا توجد مشاريع مرتبطة بهذا الفريق.', 'No projects are linked to this team.')}
                            </p>
                        )}
                    </div>
                </Panel>

                <Panel
                    title={text('عبء العمل', 'Workload')}
                    icon={BarChart3}
                >
                    <div className="flex items-center justify-center py-2">
                        <div
                            className="flex size-40 items-center justify-center rounded-full"
                            style={{
                                background: 'conic-gradient(#2879ff 0 38%, #fb5f67 38% 60%, #ffb72b 60% 78%, #22b987 78% 90%, #dfe7f2 90% 100%)',
                            }}
                        >
                            <div className="flex size-28 flex-col items-center justify-center rounded-full bg-white">
                                <strong className="text-2xl">{team.workload}%</strong>
                                <span className="text-[9px] text-slate-400">
                                    {text('عبء العمل', 'Workload')}
                                </span>
                            </div>
                        </div>
                    </div>
                    <p className="rounded-lg bg-emerald-50 p-3 text-center text-xs font-semibold text-emerald-600">
                        {text('أداء الفريق ضمن النطاق الصحي', 'Team performance is within a healthy range')}
                    </p>
                </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Panel
                    title={text('المهام الأخيرة', 'Recent tasks')}
                    icon={ListTodo}
                >
                    <div className="space-y-3">
                        {team.tasks.slice(0, 5).map((task: Task) => (
                            <div key={task.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                                <CheckCircle2
                                    size={16}
                                    className={task.status === 'completed' ? 'text-emerald-500' : 'text-amber-400'}
                                />
                                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
                                    {task.title}
                                </span>
                                <span className="text-[9px] text-slate-400">
                                    {task.progress}%
                                </span>
                            </div>
                        ))}
                        {! team.tasks.length && (
                            <p className="text-[11px] text-slate-400">
                                {text('لا توجد مهام مرتبطة بأعضاء الفريق بعد.', 'No tasks are assigned to team members yet.')}
                            </p>
                        )}
                    </div>
                </Panel>

                <Panel
                    title={text('النشاط الأخير', 'Recent activity')}
                    icon={Activity}
                >
                    <RecentActivity
                        events={data.events}
                        tasks={team.tasks}
                        ar={ar}
                    />
                </Panel>
            </div>

            <Modal
                open={editOpen}
                onClose={() => ! busy && setEditOpen(false)}
                title={text('تعديل الفريق', 'Edit team')}
            >
                <form onSubmit={saveTeam} className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="font-bold">{text('تعديل الفريق', 'Edit team')}</h3>
                        <button type="button" className={button} onClick={() => setEditOpen(false)}>
                            <X size={14} />
                        </button>
                    </div>
                    <label className="tm-field">
                        {text('اسم الفريق', 'Team name')}
                        <input
                            className={input}
                            required
                            value={editName}
                            onChange={(event) => setEditName(event.target.value)}
                        />
                    </label>
                    <label className="tm-field">
                        {text('وصف الفريق', 'Description')}
                        <textarea
                            className={input}
                            rows={4}
                            value={editDescription}
                            onChange={(event) => setEditDescription(event.target.value)}
                        />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="tm-field">
                            {text('قائد الفريق', 'Team lead')}
                            <select
                                className={input}
                                value={editLeader}
                                onChange={(event) => setEditLeader(event.target.value)}
                            >
                                {team.members.map((member: Member) => (
                                    <option key={member.id} value={member.id}>{member.name}</option>
                                ))}
                            </select>
                        </label>
                        <label className="tm-field">
                            {text('سعة الفريق', 'Capacity')}
                            <input
                                className={input}
                                type="number"
                                min={Math.max(1, team.members.length)}
                                max="100"
                                value={editCapacity}
                                onChange={(event) => setEditCapacity(event.target.value)}
                            />
                        </label>
                    </div>
                    <label className="tm-field">
                        {text('الأولوية', 'Priority')}
                        <select
                            className={input}
                            value={editPriority}
                            onChange={(event) => setEditPriority(event.target.value as 'low' | 'medium' | 'high')}
                        >
                            <option value="low">{text('منخفضة', 'Low')}</option>
                            <option value="medium">{text('متوسطة', 'Medium')}</option>
                            <option value="high">{text('عالية', 'High')}</option>
                        </select>
                    </label>
                    <div className="flex justify-end gap-2">
                        <button type="button" className={button} disabled={busy} onClick={() => setEditOpen(false)}>
                            {text('إلغاء', 'Cancel')}
                        </button>
                        <button type="submit" className={primary} disabled={busy || ! editLeader}>
                            {busy ? text('جارٍ الحفظ…', 'Saving…') : text('حفظ التعديلات', 'Save changes')}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                open={projectsOpen}
                onClose={() => ! busy && setProjectsOpen(false)}
                title={text('ربط المشاريع', 'Link projects')}
            >
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="font-bold">{text('ربط المشاريع بالفريق', 'Link projects to team')}</h3>
                        <button type="button" className={button} onClick={() => setProjectsOpen(false)}>
                            <X size={14} />
                        </button>
                    </div>
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                        {data.projects.map((project: Project) => {
                            const selected = projectIds.includes(project.id);

                            return (
                                <label
                                    key={project.id}
                                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 p-3 hover:bg-slate-50"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={() => setProjectIds((current: number[]) => (
                                            current.includes(project.id)
                                                ? current.filter((id: number) => id !== project.id)
                                                : [...current, project.id]
                                        ))}
                                    />
                                    <FolderKanban size={15} className="text-blue-500" />
                                    <span className="text-xs font-semibold">{project.name}</span>
                                </label>
                            );
                        })}
                        {! data.projects.length && (
                            <p className="py-6 text-center text-xs text-slate-400">
                                {text('لا توجد مشاريع متاحة.', 'No projects are available.')}
                            </p>
                        )}
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" className={button} disabled={busy} onClick={() => setProjectsOpen(false)}>
                            {text('إلغاء', 'Cancel')}
                        </button>
                        <button type="button" className={primary} disabled={busy} onClick={saveProjects}>
                            {busy ? text('جارٍ الحفظ…', 'Saving…') : text('حفظ الربط', 'Save links')}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function TeamMembersSurface({
    team,
    data,
    ar,
    onChanged,
}: {
    team: UiTeam;
    data: TaskData;
    ar: boolean;
    onChanged: () => void;
}) {
    const text = (arabic: string, english: string): string => ar ? arabic : english;
    const [activeTab, setActiveTab] = useState<'members' | 'tasks' | 'projects' | 'settings'>('members');
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | 'lead' | 'member'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'busy'>('all');
    const [actionMemberId, setActionMemberId] = useState<number | null>(null);
    const [profileMemberId, setProfileMemberId] = useState<number | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [leadOpen, setLeadOpen] = useState(false);
    const [removeOpen, setRemoveOpen] = useState(false);
    const [transferOpen, setTransferOpen] = useState(false);
    const [candidateId, setCandidateId] = useState('');
    const [leadId, setLeadId] = useState(String(team.leader?.id ?? ''));
    const [removeId, setRemoveId] = useState('');
    const [transferMemberId, setTransferMemberId] = useState('');
    const [targetTeamId, setTargetTeamId] = useState('');
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState('');

    const memberIds = team.members.map((member: Member) => member.id);
    const departmentMembers = data.members.filter((member: Member) => (
        member.department_id === team.members[0]?.department_id
        || member.department === team.department
    ));
    const addCandidates = departmentMembers.filter(
        (member: Member) => ! memberIds.includes(member.id),
    );
    const targetTeams = (data.teams ?? []).filter((item: TaskTeam) => (
        item.id !== team.id
        && item.department_id === team.members[0]?.department_id
        && item.member_ids.length < item.capacity
    ));

    const memberWorkload = (member: Member): number => {
        const active = team.tasks.filter((task: Task) => (
            task.status !== 'completed'
            && task.assignees.includes(member.id)
        )).length;

        return Math.min(100, active * 25);
    };

    const filtered = team.members.filter((member: Member) => {
        const workload = memberWorkload(member);
        const busyMember = workload >= 80;
        const isLead = member.id === team.leader?.id;
        const haystack = [
            member.name,
            member.email ?? '',
            member.job_title ?? '',
        ].join(' ').toLocaleLowerCase();

        return (
            haystack.includes(search.toLocaleLowerCase())
            && (
                roleFilter === 'all'
                || (roleFilter === 'lead' && isLead)
                || (roleFilter === 'member' && ! isLead)
            )
            && (
                statusFilter === 'all'
                || (statusFilter === 'busy' && busyMember)
                || (statusFilter === 'available' && ! busyMember)
            )
        );
    });

    const averageWorkload = team.members.length
        ? Math.round(
              team.members.reduce(
                  (sum: number, member: Member) => sum + memberWorkload(member),
                  0,
              ) / team.members.length,
          )
        : 0;

    async function patchTeam(
        payload: Record<string, unknown>,
        after?: () => void,
    ): Promise<void> {
        setBusy(true);
        setActionError('');

        try {
            await updateTeamRecord(team.id, payload);
            after?.();
            onChanged();
        } catch (failure) {
            setActionError(errorText(failure));
        } finally {
            setBusy(false);
        }
    }

    async function addMember(): Promise<void> {
        if (! candidateId) {
            return;
        }

        await patchTeam(
            {
                member_ids: [...memberIds, Number(candidateId)],
            },
            () => {
                setCandidateId('');
                setAddOpen(false);
            },
        );
    }

    async function assignLead(id: number): Promise<void> {
        await patchTeam(
            { leader_id: id },
            () => {
                setLeadId(String(id));
                setLeadOpen(false);
                setActionMemberId(null);
            },
        );
    }

    async function removeMember(id: number): Promise<void> {
        if (id === team.leader?.id) {
            setActionError(
                text(
                    'عيّن قائدًا آخر قبل إزالة قائد الفريق الحالي.',
                    'Assign another lead before removing the current team lead.',
                ),
            );
            return;
        }

        await patchTeam(
            {
                member_ids: memberIds.filter((memberId: number) => memberId !== id),
            },
            () => {
                setRemoveId('');
                setRemoveOpen(false);
                setActionMemberId(null);
            },
        );
    }

    async function transferMember(): Promise<void> {
        if (! transferMemberId || ! targetTeamId) {
            return;
        }

        setBusy(true);
        setActionError('');

        try {
            await apiRequest(
                api + '/teams/' + team.id + '/transfer-member',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        staff_member_id: Number(transferMemberId),
                        target_team_id: Number(targetTeamId),
                    }),
                },
            );
            setTransferOpen(false);
            setTransferMemberId('');
            setTargetTeamId('');
            setActionMemberId(null);
            onChanged();
        } catch (failure) {
            setActionError(errorText(failure));
        } finally {
            setBusy(false);
        }
    }

    const tabs: Array<{
        key: 'members' | 'tasks' | 'projects' | 'settings';
        ar: string;
        en: string;
    }> = [
        { key: 'members', ar: 'الأعضاء', en: 'Members' },
        { key: 'tasks', ar: 'المهام', en: 'Tasks' },
        { key: 'projects', ar: 'المشاريع', en: 'Projects' },
        { key: 'settings', ar: 'الإعدادات', en: 'Settings' },
    ];

    const profileMember = data.members.find(
        (member: Member) => member.id === profileMemberId,
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold">
                        {ar ? team.nameAr : team.nameEn}
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">
                        {text('إدارة أعضاء الفريق وتوزيع الأدوار ومتابعة نسبة الانشغال', 'Manage team members, roles and utilization')}
                    </p>
                </div>
                <Link href={base + '/teams/' + team.id} className={button}>
                    <ArrowLeft size={15} />
                    {text('العودة إلى الفريق', 'Back to team')}
                </Link>
            </div>

            {actionError && (
                <div
                    role="alert"
                    className="rounded-xl border border-red-100 bg-red-50 p-3 text-[11px] text-red-600"
                >
                    {actionError}
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                    title={text('إجمالي الأعضاء', 'Total members')}
                    value={team.members.length}
                    icon={UsersRound}
                    hint={text('أعضاء الفريق الحاليون', 'Current team members')}
                />
                <Stat
                    title={text('قائد الفريق', 'Team lead')}
                    value={team.leader ? 1 : 0}
                    icon={Crown}
                    color="green"
                />
                <Stat
                    title={text('متوسط نسبة الانشغال', 'Average utilization')}
                    value={averageWorkload + '%'}
                    icon={BarChart3}
                    color="red"
                />
                <Stat
                    title={text('المشاريع النشطة', 'Active projects')}
                    value={team.projects.length}
                    icon={FolderKanban}
                    color="amber"
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,2.1fr)_320px]">
                <div className="tm-panel !p-0">
                    <div className="border-b border-slate-100 px-4 pt-3">
                        <div className="flex gap-5 overflow-x-auto">
                            {tabs.map((tab) => (
                                <button
                                    type="button"
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={
                                        'border-b-2 px-1 py-3 text-[11px] font-semibold transition '
                                        + (activeTab === tab.key
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-slate-400 hover:text-slate-600')
                                    }
                                >
                                    {ar ? tab.ar : tab.en}
                                </button>
                            ))}
                        </div>
                    </div>

                    {activeTab === 'members' && (
                        <>
                            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
                                <button
                                    type="button"
                                    className={primary}
                                    disabled={team.members.length >= team.capacity}
                                    onClick={() => {
                                        setCandidateId('');
                                        setAddOpen(true);
                                    }}
                                >
                                    <Plus size={14} />
                                    {text('إضافة عضو', 'Add member')}
                                </button>

                                <label className="relative min-w-48 flex-1">
                                    <Search
                                        size={14}
                                        className="absolute start-3 top-3 text-slate-400"
                                    />
                                    <input
                                        className={input + ' !ps-9'}
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder={text('البحث عن موظف…', 'Search member…')}
                                    />
                                </label>

                                <select
                                    className={input + ' !w-auto min-w-32'}
                                    value={roleFilter}
                                    onChange={(event) => setRoleFilter(event.target.value as 'all' | 'lead' | 'member')}
                                >
                                    <option value="all">{text('جميع الأدوار', 'All roles')}</option>
                                    <option value="lead">{text('قائد الفريق', 'Team lead')}</option>
                                    <option value="member">{text('عضو', 'Member')}</option>
                                </select>
                                <select
                                    className={input + ' !w-auto min-w-32'}
                                    value={statusFilter}
                                    onChange={(event) => setStatusFilter(event.target.value as 'all' | 'available' | 'busy')}
                                >
                                    <option value="all">{text('جميع الحالات', 'All statuses')}</option>
                                    <option value="available">{text('متاح', 'Available')}</option>
                                    <option value="busy">{text('مشغول', 'Busy')}</option>
                                </select>
                                <button
                                    type="button"
                                    className={button}
                                    onClick={() => {
                                        setSearch('');
                                        setRoleFilter('all');
                                        setStatusFilter('all');
                                    }}
                                >
                                    <Settings2 size={14} />
                                    {text('إعادة ضبط', 'Reset')}
                                </button>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="tm-table tm-team-members-table">
                                    <colgroup>
                                        <col style={{ width: '29%' }} />
                                        <col style={{ width: '18%' }} />
                                        <col style={{ width: '12%' }} />
                                        <col style={{ width: '18%' }} />
                                        <col style={{ width: '15%' }} />
                                        <col style={{ width: '8%' }} />
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            {[
                                                text('الموظف', 'Employee'),
                                                text('المسمى الوظيفي', 'Job title'),
                                                text('الحالة', 'Status'),
                                                text('نسبة الانشغال', 'Utilization'),
                                                text('الدور داخل الفريق', 'Team role'),
                                                text('إجراءات', 'Actions'),
                                            ].map((label: string) => (
                                                <th key={label}>{label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((member: Member) => {
                                            const workload = memberWorkload(member);
                                            const busyMember = workload >= 80;
                                            const isLead = member.id === team.leader?.id;

                                            return (
                                                <tr key={member.id}>
                                                    <td>
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <Avatar member={member} />
                                                            <div className="min-w-0">
                                                                <p className="truncate font-semibold">{member.name}</p>
                                                                <p className="truncate text-[9px] text-slate-400">
                                                                    {member.email ?? '—'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="truncate">
                                                        {member.job_title ?? text('عضو فريق', 'Team member')}
                                                    </td>
                                                    <td>
                                                        <Badge color={busyMember ? 'red' : 'green'}>
                                                            {busyMember ? text('مشغول', 'Busy') : text('متاح', 'Available')}
                                                        </Badge>
                                                    </td>
                                                    <td>
                                                        <Progress value={workload} />
                                                    </td>
                                                    <td>
                                                        {isLead ? (
                                                            <Badge color="amber">
                                                                <Crown size={10} />
                                                                {text('قائد الفريق', 'Team lead')}
                                                            </Badge>
                                                        ) : (
                                                            <Badge color="blue">
                                                                {text('عضو', 'Member')}
                                                            </Badge>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className={button}
                                                            aria-label={text('إجراءات العضو', 'Member actions')}
                                                            onClick={() => setActionMemberId(member.id)}
                                                        >
                                                            <EllipsisVertical size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {! filtered.length && (
                                <div className="p-8 text-center text-xs text-slate-400">
                                    {text('لا يوجد أعضاء يطابقون البحث.', 'No members match the search.')}
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'tasks' && (
                        <div className="p-4">
                            <div className="space-y-2">
                                {team.tasks.map((task: Task) => (
                                    <div
                                        key={task.id}
                                        className="grid gap-3 rounded-xl border border-slate-100 p-3 sm:grid-cols-[minmax(0,1fr)_120px_160px] sm:items-center"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-semibold">{task.title}</p>
                                            <p className="mt-1 text-[9px] text-slate-400">
                                                {text('تقدم المهمة', 'Task progress')} · {task.progress}%
                                            </p>
                                        </div>
                                        <Badge color={task.status === 'completed' ? 'green' : 'blue'}>
                                            {task.status === 'completed'
                                                ? text('مكتملة', 'Completed')
                                                : text('قيد العمل', 'In progress')}
                                        </Badge>
                                        <Progress value={task.progress} />
                                    </div>
                                ))}
                                {! team.tasks.length && (
                                    <div className="py-10 text-center text-xs text-slate-400">
                                        {text('لا توجد مهام مرتبطة بهذا الفريق.', 'No tasks are linked to this team.')}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'projects' && (
                        <div className="grid gap-3 p-4 md:grid-cols-2">
                            {team.projects.map((project: Project) => {
                                const projectTasks = team.tasks.filter(
                                    (task: Task) => task.project_id === project.id,
                                );
                                const completedTasks = projectTasks.filter(
                                    (task: Task) => task.status === 'completed',
                                ).length;
                                const progress = projectTasks.length
                                    ? Math.round(completedTasks / projectTasks.length * 100)
                                    : 0;

                                return (
                                    <div key={project.id} className="rounded-xl border border-slate-100 p-4">
                                        <div className="mb-3 flex items-center gap-2">
                                            <FolderKanban size={16} className="text-blue-500" />
                                            <strong className="text-xs">{project.name}</strong>
                                        </div>
                                        <Progress value={progress} />
                                        <p className="mt-2 text-[9px] text-slate-400">
                                            {projectTasks.length} {text('مهام مرتبطة', 'linked tasks')}
                                        </p>
                                    </div>
                                );
                            })}
                            {! team.projects.length && (
                                <div className="col-span-full py-10 text-center text-xs text-slate-400">
                                    {text('لا توجد مشاريع مرتبطة بهذا الفريق.', 'No projects are linked to this team.')}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="grid gap-3 p-4 sm:grid-cols-2">
                            <Metric
                                value={team.capacity}
                                label={text('سعة الفريق', 'Team capacity')}
                            />
                            <Metric
                                value={
                                    team.priority === 'high'
                                        ? text('عالية', 'High')
                                        : team.priority === 'low'
                                            ? text('منخفضة', 'Low')
                                            : text('متوسطة', 'Medium')
                                }
                                label={text('الأولوية', 'Priority')}
                            />
                            <div className="sm:col-span-2 rounded-xl border border-slate-100 p-4">
                                <p className="text-[10px] text-slate-400">
                                    {text('قائد الفريق الحالي', 'Current team lead')}
                                </p>
                                <div className="mt-3 flex items-center gap-3">
                                    <Avatar member={team.leader} size="large" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-semibold">
                                            {team.leader?.name ?? '—'}
                                        </p>
                                        <p className="text-[9px] text-slate-400">
                                            {team.leader?.job_title ?? text('قائد الفريق', 'Team lead')}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className={button}
                                        onClick={() => {
                                            setLeadId(String(team.leader?.id ?? ''));
                                            setLeadOpen(true);
                                        }}
                                    >
                                        <Pencil size={13} />
                                        {text('تغيير القائد', 'Change lead')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <aside className="space-y-4">
                    <Panel
                        title={text('توزيع الأدوار', 'Role distribution')}
                        icon={BriefcaseBusiness}
                    >
                        <div className="flex items-center justify-center py-2">
                            <div
                                className="flex size-36 items-center justify-center rounded-full"
                                style={{
                                    background: 'conic-gradient(#2879ff 0 20%, #22b987 20% 60%, #ffb72b 60% 80%, #fb5f67 80% 100%)',
                                }}
                            >
                                <div className="flex size-24 flex-col items-center justify-center rounded-full bg-white">
                                    <strong className="text-2xl">{team.members.length}</strong>
                                    <span className="text-[9px] text-slate-400">
                                        {text('أعضاء', 'members')}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-3 space-y-2 text-[10px]">
                            <RoleRow label={text('قائد الفريق', 'Team lead')} count={team.leader ? 1 : 0} color="#2879ff" />
                            <RoleRow label={text('أعضاء الفريق', 'Team members')} count={Math.max(0, team.members.length - 1)} color="#22b987" />
                        </div>
                    </Panel>

                    <Panel
                        title={text('سعة الفريق', 'Team capacity')}
                        icon={Gauge}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <strong className="text-xl">{averageWorkload}%</strong>
                                <p className="text-[9px] text-slate-400">
                                    {text('متوسط نسبة الانشغال', 'Average utilization')}
                                </p>
                            </div>
                            <Gauge size={27} className="text-blue-500" />
                        </div>
                        <Progress value={averageWorkload} label={false} />
                        <div className="mt-3 flex justify-between text-[10px] text-slate-400">
                            <span>
                                {team.members.length} / {team.capacity}
                                {' '}
                                {text('أعضاء', 'members')}
                            </span>
                            <span>
                                {Math.max(0, team.capacity - team.members.length)}
                                {' '}
                                {text('أماكن متاحة', 'spots available')}
                            </span>
                        </div>
                    </Panel>

                    <Panel
                        title={text('إجراءات سريعة', 'Quick actions')}
                        icon={Sparkles}
                    >
                        <div className="grid gap-2">
                            <button
                                type="button"
                                className={button}
                                disabled={team.members.length >= team.capacity}
                                onClick={() => {
                                    setCandidateId('');
                                    setAddOpen(true);
                                }}
                            >
                                <Plus size={14} />
                                {text('إضافة عضو جديد', 'Add member')}
                            </button>
                            <button
                                type="button"
                                className={button}
                                disabled={team.members.length <= 1 || ! targetTeams.length}
                                onClick={() => {
                                    setTransferMemberId('');
                                    setTargetTeamId('');
                                    setTransferOpen(true);
                                }}
                            >
                                <UsersRound size={14} />
                                {text('نقل عضو إلى فريق آخر', 'Move member')}
                            </button>
                            <button
                                type="button"
                                className={button}
                                onClick={() => {
                                    setLeadId(String(team.leader?.id ?? ''));
                                    setLeadOpen(true);
                                }}
                            >
                                <Crown size={14} />
                                {text('تعيين قائد للفريق', 'Assign team lead')}
                            </button>
                            <button
                                type="button"
                                className="tm-button border-red-100 text-red-500 hover:bg-red-50 hover:text-red-600"
                                disabled={team.members.filter((member: Member) => member.id !== team.leader?.id).length === 0}
                                onClick={() => {
                                    setRemoveId('');
                                    setRemoveOpen(true);
                                }}
                            >
                                <X size={14} />
                                {text('إزالة عضو من الفريق', 'Remove member')}
                            </button>
                        </div>
                    </Panel>

                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-[10px] leading-6 text-blue-700">
                        <strong className="mb-1 block">{text('معلومة', 'Info')}</strong>
                        {text(
                            'يمكن إضافة أعضاء من نفس القسم، ونقل غير القائد بين فرق القسم نفسه.',
                            'You can add employees from the same department and move non-lead members between its teams.',
                        )}
                    </div>
                </aside>
            </div>

            <Modal
                open={actionMemberId !== null}
                onClose={() => ! busy && setActionMemberId(null)}
                title={text('إجراءات العضو', 'Member actions')}
            >
                {actionMemberId !== null && (() => {
                    const member = team.members.find((item: Member) => item.id === actionMemberId);

                    if (! member) {
                        return null;
                    }

                    return (
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                                <Avatar member={member} size="large" />
                                <div>
                                    <p className="text-sm font-bold">{member.name}</p>
                                    <p className="text-[10px] text-slate-400">{member.job_title ?? '—'}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className={button + ' w-full'}
                                onClick={() => {
                                    setProfileMemberId(member.id);
                                    setActionMemberId(null);
                                }}
                            >
                                {text('عرض الملف الشخصي', 'View profile')}
                            </button>
                            <button
                                type="button"
                                className={button + ' w-full'}
                                disabled={member.id === team.leader?.id || ! targetTeams.length}
                                onClick={() => {
                                    setTransferMemberId(String(member.id));
                                    setTargetTeamId('');
                                    setTransferOpen(true);
                                    setActionMemberId(null);
                                }}
                            >
                                {text('نقل إلى فريق آخر', 'Move to another team')}
                            </button>
                            <button
                                type="button"
                                className={button + ' w-full'}
                                disabled={member.id === team.leader?.id || busy}
                                onClick={() => assignLead(member.id)}
                            >
                                {text('تعيين قائد للفريق', 'Make team lead')}
                            </button>
                            <button
                                type="button"
                                className="tm-button w-full border-red-100 text-red-500 hover:bg-red-50"
                                disabled={member.id === team.leader?.id || busy}
                                onClick={() => removeMember(member.id)}
                            >
                                {text('إزالة من الفريق', 'Remove from team')}
                            </button>
                        </div>
                    );
                })()}
            </Modal>

            <Modal
                open={profileMemberId !== null}
                onClose={() => setProfileMemberId(null)}
                title={text('الملف الشخصي', 'Member profile')}
            >
                {profileMember && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <Avatar member={profileMember} size="large" />
                            <div>
                                <h3 className="font-bold">{profileMember.name}</h3>
                                <p className="text-[10px] text-slate-400">
                                    {profileMember.job_title ?? text('عضو فريق', 'Team member')}
                                </p>
                            </div>
                        </div>
                        <PreviewRow label={text('البريد الإلكتروني', 'Email')} value={profileMember.email ?? '—'} />
                        <PreviewRow label={text('القسم', 'Department')} value={profileMember.department ?? '—'} />
                        <PreviewRow
                            label={text('نسبة الانشغال', 'Utilization')}
                            value={memberWorkload(profileMember) + '%'}
                        />
                        <button type="button" className={button + ' w-full'} onClick={() => setProfileMemberId(null)}>
                            {text('إغلاق', 'Close')}
                        </button>
                    </div>
                )}
            </Modal>

            <Modal
                open={addOpen}
                onClose={() => ! busy && setAddOpen(false)}
                title={text('إضافة عضو', 'Add member')}
            >
                <div className="space-y-4">
                    <h3 className="font-bold">{text('إضافة عضو إلى الفريق', 'Add member to team')}</h3>
                    {team.members.length >= team.capacity ? (
                        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
                            {text('وصل الفريق إلى سعته القصوى. ارفع السعة أولًا.', 'This team is at capacity. Increase capacity first.')}
                        </p>
                    ) : (
                        <label className="tm-field">
                            {text('الموظف', 'Employee')}
                            <select
                                className={input}
                                value={candidateId}
                                onChange={(event) => setCandidateId(event.target.value)}
                            >
                                <option value="">{text('اختر موظفًا', 'Choose an employee')}</option>
                                {addCandidates.map((member: Member) => (
                                    <option key={member.id} value={member.id}>
                                        {member.name} — {member.job_title ?? text('موظف', 'Employee')}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    {! addCandidates.length && team.members.length < team.capacity && (
                        <p className="text-xs text-slate-400">
                            {text('لا يوجد موظفون متاحون من نفس القسم.', 'No available employees remain in this department.')}
                        </p>
                    )}
                    <div className="flex justify-end gap-2">
                        <button type="button" className={button} disabled={busy} onClick={() => setAddOpen(false)}>
                            {text('إلغاء', 'Cancel')}
                        </button>
                        <button
                            type="button"
                            className={primary}
                            disabled={busy || ! candidateId || team.members.length >= team.capacity}
                            onClick={addMember}
                        >
                            {busy ? text('جارٍ الإضافة…', 'Adding…') : text('إضافة العضو', 'Add member')}
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={leadOpen}
                onClose={() => ! busy && setLeadOpen(false)}
                title={text('تعيين قائد', 'Assign team lead')}
            >
                <div className="space-y-4">
                    <label className="tm-field">
                        {text('قائد الفريق', 'Team lead')}
                        <select
                            className={input}
                            value={leadId}
                            onChange={(event) => setLeadId(event.target.value)}
                        >
                            {team.members.map((member: Member) => (
                                <option key={member.id} value={member.id}>{member.name}</option>
                            ))}
                        </select>
                    </label>
                    <div className="flex justify-end gap-2">
                        <button type="button" className={button} disabled={busy} onClick={() => setLeadOpen(false)}>
                            {text('إلغاء', 'Cancel')}
                        </button>
                        <button
                            type="button"
                            className={primary}
                            disabled={busy || ! leadId}
                            onClick={() => assignLead(Number(leadId))}
                        >
                            {text('حفظ القائد', 'Save lead')}
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={removeOpen}
                onClose={() => ! busy && setRemoveOpen(false)}
                title={text('إزالة عضو', 'Remove member')}
            >
                <div className="space-y-4">
                    <label className="tm-field">
                        {text('اختر العضو', 'Choose member')}
                        <select
                            className={input}
                            value={removeId}
                            onChange={(event) => setRemoveId(event.target.value)}
                        >
                            <option value="">{text('اختر عضوًا', 'Choose a member')}</option>
                            {team.members
                                .filter((member: Member) => member.id !== team.leader?.id)
                                .map((member: Member) => (
                                    <option key={member.id} value={member.id}>{member.name}</option>
                                ))}
                        </select>
                    </label>
                    <div className="flex justify-end gap-2">
                        <button type="button" className={button} disabled={busy} onClick={() => setRemoveOpen(false)}>
                            {text('إلغاء', 'Cancel')}
                        </button>
                        <button
                            type="button"
                            className="tm-button border-red-100 text-red-500 hover:bg-red-50"
                            disabled={busy || ! removeId}
                            onClick={() => removeMember(Number(removeId))}
                        >
                            {text('إزالة العضو', 'Remove member')}
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={transferOpen}
                onClose={() => ! busy && setTransferOpen(false)}
                title={text('نقل عضو', 'Move member')}
            >
                <div className="space-y-4">
                    <label className="tm-field">
                        {text('العضو', 'Member')}
                        <select
                            className={input}
                            value={transferMemberId}
                            onChange={(event) => setTransferMemberId(event.target.value)}
                        >
                            <option value="">{text('اختر عضوًا', 'Choose a member')}</option>
                            {team.members
                                .filter((member: Member) => member.id !== team.leader?.id)
                                .map((member: Member) => (
                                    <option key={member.id} value={member.id}>{member.name}</option>
                                ))}
                        </select>
                    </label>
                    <label className="tm-field">
                        {text('الفريق الهدف', 'Target team')}
                        <select
                            className={input}
                            value={targetTeamId}
                            onChange={(event) => setTargetTeamId(event.target.value)}
                        >
                            <option value="">{text('اختر الفريق', 'Choose target team')}</option>
                            {targetTeams.map((target: TaskTeam) => (
                                <option key={target.id} value={target.id}>
                                    {target.name} ({target.member_ids.length}/{target.capacity})
                                </option>
                            ))}
                        </select>
                    </label>
                    {! targetTeams.length && (
                        <p className="text-xs text-slate-400">
                            {text('لا يوجد فريق آخر متاح في نفس القسم.', 'No other available team exists in this department.')}
                        </p>
                    )}
                    <div className="flex justify-end gap-2">
                        <button type="button" className={button} disabled={busy} onClick={() => setTransferOpen(false)}>
                            {text('إلغاء', 'Cancel')}
                        </button>
                        <button
                            type="button"
                            className={primary}
                            disabled={busy || ! transferMemberId || ! targetTeamId}
                            onClick={transferMember}
                        >
                            {text('نقل العضو', 'Move member')}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function RoleRow({
    label,
    count,
    color,
}: {
    label: string;
    count: number;
    color: string;
}) {
    return (
        <div className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: color }} />
            <span className="flex-1 text-slate-500">{label}</span>
            <strong>{count}</strong>
        </div>
    );
}

function RecentActivity({
    events,
    tasks,
    ar,
}: {
    events: TaskActivityEvent[];
    tasks: Task[];
    ar: boolean;
}) {
    const text = (arabic: string, english: string): string => ar ? arabic : english;
    const visibleIds = new Set(tasks.map((task: Task) => task.id));
    const visible = events.filter((event: TaskActivityEvent) => (
        event.task_id === null || visibleIds.has(event.task_id)
    ));

    if (! visible.length) {
        return (
            <p className="text-[11px] leading-6 text-slate-400">
                {text('سيظهر نشاط الفريق هنا عند تحديث المهام والمشاريع.', 'Team activity will appear here as work changes.')}
            </p>
        );
    }

    return (
        <div className="space-y-4">
            {visible.slice(0, 5).map((event: TaskActivityEvent) => (
                <div key={event.id} className="flex items-start gap-3">
                    <span className="mt-1.5 size-2 rounded-full bg-blue-400" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-semibold">{event.name}</p>
                        <p className="mt-1 truncate text-[9px] text-slate-400">
                            {event.action}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
}
