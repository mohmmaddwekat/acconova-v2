import { Link } from '@inertiajs/react';
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
    Panel,
    Progress,
    Stat,
    base,
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
};

const presets: Array<{
    id: number;
    nameAr: string;
    nameEn: string;
    descriptionAr: string;
    descriptionEn: string;
    tone: TeamTone;
    Icon: LucideIcon;
}> = [
    {
        id: 1,
        nameAr: 'فريق الواجهة الأمامية',
        nameEn: 'Frontend team',
        descriptionAr: 'تطوير واجهات المستخدم وتجربة الاستخدام',
        descriptionEn: 'Frontend and user experience development',
        tone: 'blue',
        Icon: Code2,
    },
    {
        id: 2,
        nameAr: 'فريق الخلفية',
        nameEn: 'Backend team',
        descriptionAr: 'الخدمات وقواعد البيانات والتكاملات',
        descriptionEn: 'Services, databases and integrations',
        tone: 'green',
        Icon: Layers3,
    },
    {
        id: 3,
        nameAr: 'فريق التطبيقات المحمولة',
        nameEn: 'Mobile applications team',
        descriptionAr: 'تطوير تطبيقات الجوال عبر المنصات',
        descriptionEn: 'Cross-platform mobile application development',
        tone: 'green',
        Icon: Smartphone,
    },
    {
        id: 4,
        nameAr: 'فريق ضمان الجودة',
        nameEn: 'Quality assurance team',
        descriptionAr: 'الاختبار وضمان الجودة',
        descriptionEn: 'Testing and quality assurance',
        tone: 'amber',
        Icon: ShieldCheck,
    },
];

const toneClasses: Record<TeamTone, string> = {
    blue: 'bg-blue-500 text-white',
    green: 'bg-emerald-500 text-white',
    amber: 'bg-amber-400 text-white',
    purple: 'bg-violet-500 text-white',
};

/**
 * Render the Teams UI family: teams list, create, team details and member
 * management. The first delivery is intentionally UI-only and derives its
 * preview data from the existing task/staff/project payload.
 */
export function TeamsExperience({
    view,
    teamId,
    data,
    tasks,
    ar,
}: {
    view: TeamsView;
    teamId: number | null;
    data: TaskData;
    tasks: Task[];
    ar: boolean;
}) {
    const teams = useMemo(
        () => buildTeams(data, tasks),
        [data, tasks],
    );
    const selected = teams.find((team: UiTeam) => team.id === teamId) ?? teams[0];

    if (view === 'teams-create') {
        return (
            <CreateTeamSurface
                data={data}
                ar={ar}
            />
        );
    }

    if (view === 'teams-members') {
        return (
            <TeamMembersSurface
                team={selected}
                ar={ar}
            />
        );
    }

    if (view === 'teams-detail') {
        return (
            <TeamDetailSurface
                team={selected}
                data={data}
                ar={ar}
            />
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
 * Derive presentational teams from the real staff/projects/tasks payload.
 * Persistence and assignment rules are deliberately left for the backend
 * phase so this UI can ship without changing the accounting/domain model.
 */
function buildTeams(
    data: TaskData,
    tasks: Task[],
): UiTeam[] {
    const membersByTeam = presets.map(() => [] as Member[]);
    const projectsByTeam = presets.map(() => [] as Project[]);

    data.members.forEach((member: Member, index: number) => {
        membersByTeam[index % presets.length].push(member);
    });

    data.projects.forEach((project: Project, index: number) => {
        projectsByTeam[index % presets.length].push(project);
    });

    return presets.map((preset, index: number) => {
        const members = membersByTeam[index];
        const memberIds = new Set(members.map((member: Member) => member.id));
        const teamTasks = tasks.filter((task: Task) => (
            task.assignees.some((id: number) => memberIds.has(id))
        ));
        const active = teamTasks.filter((task: Task) => task.status !== 'completed');
        const capacity = Math.max(1, members.length * 4);
        const workload = Math.min(
            100,
            Math.round(active.length / capacity * 100),
        );

        return {
            ...preset,
            members,
            leader: members[0],
            projects: projectsByTeam[index],
            tasks: teamTasks,
            workload,
        };
    });
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
    const activeProjects = data.projects.length;
    const averageWorkload = teams.length
        ? Math.round(teams.reduce((sum: number, team: UiTeam) => sum + team.workload, 0) / teams.length)
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
                    value={teams.length}
                    icon={UsersRound}
                    hint={text('فرق داخل القسم', 'Teams in this department')}
                />
                <Stat
                    title={text('إجمالي أعضاء القسم', 'Department members')}
                    value={data.members.length}
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
                    {teams.map((team: UiTeam) => (
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
                            teams={teams}
                            total={data.members.length}
                            ar={ar}
                        />
                    </Panel>

                    <Panel
                        title={text('عبء العمل حسب الفريق', 'Workload by team')}
                        icon={Gauge}
                    >
                        <div className="space-y-4">
                            {teams.map((team: UiTeam) => (
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
    const [leader, setLeader] = useState('');
    const [capacity, setCapacity] = useState('8');
    const [priority, setPriority] = useState('medium');
    const [selectedMembers, setSelectedMembers] = useState<number[]>(
        data.members.slice(0, 4).map((member: Member) => member.id),
    );
    const [selectedProjects, setSelectedProjects] = useState<number[]>(
        data.projects.slice(0, 3).map((project: Project) => project.id),
    );

    function toggleMember(id: number): void {
        setSelectedMembers((current: number[]) => (
            current.includes(id)
                ? current.filter((value: number) => value !== id)
                : [...current, id]
        ));
    }

    function toggleProject(id: number): void {
        setSelectedProjects((current: number[]) => (
            current.includes(id)
                ? current.filter((value: number) => value !== id)
                : [...current, id]
        ));
    }

    function submit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();
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
                                onChange={(event) => setName(event.target.value)}
                                placeholder={text('مثال: فريق تطوير الواجهة الأمامية', 'Example: Frontend development team')}
                            />
                        </label>

                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="tm-field">
                                {text('القسم', 'Department')}
                                <select className={input}>
                                    {! departments.length && (
                                        <option>{text('قسم البرمجة', 'Engineering')}</option>
                                    )}
                                    {departments.map((department: string) => (
                                        <option key={department}>{department}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="tm-field">
                                {text('قائد الفريق', 'Team lead')}
                                <select
                                    className={input}
                                    value={leader}
                                    onChange={(event) => setLeader(event.target.value)}
                                >
                                    <option value="">
                                        {text('اختر قائد الفريق', 'Choose team lead')}
                                    </option>
                                    {data.members.map((member: Member) => (
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
                    <label className="relative mb-3 block">
                        <Search
                            size={14}
                            className="absolute start-3 top-3 text-slate-400"
                        />
                        <input
                            className={input + ' !ps-9'}
                            placeholder={text('البحث عن موظفين لإضافتهم إلى الفريق…', 'Search employees to add…')}
                        />
                    </label>

                    <div className="flex flex-wrap gap-2">
                        {data.members.map((member: Member) => {
                            const selected = selectedMembers.includes(member.id);

                            return (
                                <button
                                    key={member.id}
                                    type="button"
                                    onClick={() => toggleMember(member.id)}
                                    className={
                                        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] transition '
                                        + (selected
                                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                                            : 'border-slate-200 bg-white text-slate-500')
                                    }
                                >
                                    <Avatar member={member} />
                                    {member.name}
                                    {selected ? <X size={11} /> : <Plus size={11} />}
                                </button>
                            );
                        })}
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
                                onChange={(event) => setCapacity(event.target.value)}
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

                <div className="flex flex-wrap items-center gap-2">
                    <button type="submit" className={primary}>
                        <Plus size={15} />
                        {text('إنشاء الفريق', 'Create team')}
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
                            {departments[0] ?? text('قسم البرمجة', 'Engineering')}
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
}: {
    team: UiTeam;
    data: TaskData;
    ar: boolean;
}) {
    const text = (arabic: string, english: string): string => ar ? arabic : english;
    const Icon = team.Icon;
    const completed = team.tasks.filter((task: Task) => task.status === 'completed').length;

    return (
        <div className="space-y-4">
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
                    <button type="button" className={button}>
                        <MoreHorizontal size={15} />
                    </button>
                    <button type="button" className={button}>
                        <Link2 size={15} />
                        {text('ربط مشروع', 'Link project')}
                    </button>
                    <button type="button" className={button}>
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
                        {team.members.map((member: Member, index: number) => (
                            <div key={member.id} className="flex items-center gap-3">
                                <Avatar member={member} size="large" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="truncate text-xs font-semibold">{member.name}</p>
                                        {index === 0 && (
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
        </div>
    );
}

function TeamMembersSurface({
    team,
    ar,
}: {
    team: UiTeam;
    ar: boolean;
}) {
    const text = (arabic: string, english: string): string => ar ? arabic : english;
    const [search, setSearch] = useState('');
    const [openMenu, setOpenMenu] = useState<number | null>(team.members[0]?.id ?? null);
    const filtered = team.members.filter((member: Member) => {
        const haystack = [
            member.name,
            member.email ?? '',
            member.job_title ?? '',
        ].join(' ').toLocaleLowerCase();

        return haystack.includes(search.toLocaleLowerCase());
    });
    const averageWorkload = team.members.length
        ? Math.round(
              team.members.reduce((sum: number, member: Member) => {
                  const active = team.tasks.filter((task: Task) => (
                      task.status !== 'completed'
                      && task.assignees.includes(member.id)
                  )).length;

                  return sum + Math.min(100, active * 25);
              }, 0) / team.members.length,
          )
        : 0;

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
                            {[
                                text('الأعضاء', 'Members'),
                                text('المهام', 'Tasks'),
                                text('المشاريع', 'Projects'),
                                text('الإعدادات', 'Settings'),
                            ].map((label: string, index: number) => (
                                <button
                                    type="button"
                                    key={label}
                                    className={
                                        'border-b-2 px-1 py-3 text-[11px] font-semibold '
                                        + (index === 0
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-slate-400')
                                    }
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
                        <button type="button" className={primary}>
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

                        <select className={input + ' !w-auto min-w-32'}>
                            <option>{text('جميع الأدوار', 'All roles')}</option>
                        </select>
                        <select className={input + ' !w-auto min-w-32'}>
                            <option>{text('جميع الحالات', 'All statuses')}</option>
                        </select>
                        <button type="button" className={button}>
                            <Settings2 size={14} />
                            {text('تصفية', 'Filter')}
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="tm-table">
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
                                {filtered.map((member: Member, index: number) => {
                                    const memberTasks = team.tasks.filter((task: Task) => task.assignees.includes(member.id));
                                    const active = memberTasks.filter((task: Task) => task.status !== 'completed').length;
                                    const workload = Math.min(100, active * 25);
                                    const busy = workload >= 80;

                                    return (
                                        <tr key={member.id}>
                                            <td>
                                                <div className="flex min-w-52 items-center gap-3">
                                                    <Avatar member={member} />
                                                    <div className="min-w-0">
                                                        <p className="truncate font-semibold">{member.name}</p>
                                                        <p className="truncate text-[9px] text-slate-400">
                                                            {member.email ?? '—'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>{member.job_title ?? text('عضو فريق', 'Team member')}</td>
                                            <td>
                                                <Badge color={busy ? 'red' : 'green'}>
                                                    {busy ? text('مشغول', 'Busy') : text('متاح', 'Available')}
                                                </Badge>
                                            </td>
                                            <td className="min-w-32">
                                                <Progress value={workload} />
                                            </td>
                                            <td>
                                                {index === 0 ? (
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
                                            <td className="relative">
                                                <button
                                                    type="button"
                                                    className={button}
                                                    onClick={() => setOpenMenu(
                                                        openMenu === member.id ? null : member.id,
                                                    )}
                                                >
                                                    <EllipsisVertical size={14} />
                                                </button>

                                                {openMenu === member.id && (
                                                    <div className="absolute end-3 top-10 z-20 w-44 rounded-xl border border-slate-100 bg-white p-2 shadow-xl">
                                                        {[
                                                            text('عرض الملف الشخصي', 'View profile'),
                                                            text('نقل إلى فريق آخر', 'Move to another team'),
                                                            text('تعيين قائد للفريق', 'Make team lead'),
                                                        ].map((label: string) => (
                                                            <button
                                                                key={label}
                                                                type="button"
                                                                className="flex w-full items-center rounded-lg px-3 py-2 text-start text-[10px] text-slate-600 hover:bg-slate-50"
                                                            >
                                                                {label}
                                                            </button>
                                                        ))}
                                                        <button
                                                            type="button"
                                                            className="flex w-full items-center rounded-lg px-3 py-2 text-start text-[10px] text-red-500 hover:bg-red-50"
                                                        >
                                                            {text('إزالة من الفريق', 'Remove from team')}
                                                        </button>
                                                    </div>
                                                )}
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
                            <RoleRow label={text('مطور برمجيات', 'Developers')} count={Math.max(0, team.members.length - 2)} color="#22b987" />
                            <RoleRow label={text('UI/UX مصمم', 'UI/UX')} count={team.members.length > 1 ? 1 : 0} color="#ffb72b" />
                            <RoleRow label={text('مختبر جودة', 'QA')} count={team.members.length > 2 ? 1 : 0} color="#fb5f67" />
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
                            <span>{team.members.length * 2.6} {text('ساعة مستخدمة يوميًا', 'used hrs/day')}</span>
                            <span>{team.members.length * 4} {text('السعة المتاحة يوميًا', 'available hrs/day')}</span>
                        </div>
                    </Panel>

                    <Panel
                        title={text('إجراءات سريعة', 'Quick actions')}
                        icon={Sparkles}
                    >
                        <div className="grid gap-2">
                            <button type="button" className={button}>
                                <Plus size={14} />
                                {text('إضافة عضو جديد', 'Add member')}
                            </button>
                            <button type="button" className={button}>
                                <UsersRound size={14} />
                                {text('نقل عضو إلى فريق آخر', 'Move member')}
                            </button>
                            <button type="button" className={button}>
                                <Crown size={14} />
                                {text('تعيين قائد للفريق', 'Assign team lead')}
                            </button>
                            <button type="button" className="tm-button border-red-100 text-red-500 hover:bg-red-50 hover:text-red-600">
                                <X size={14} />
                                {text('إزالة عضو من الفريق', 'Remove member')}
                            </button>
                        </div>
                    </Panel>

                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-[10px] leading-6 text-blue-700">
                        <strong className="mb-1 block">{text('معلومة', 'Info')}</strong>
                        {text(
                            'يمكنك إضافة أعضاء من نفس القسم أو نقل موظفين من فرق أخرى داخل الشركة.',
                            'You can add members from the same department or move employees from other teams.',
                        )}
                    </div>
                </aside>
            </div>
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
