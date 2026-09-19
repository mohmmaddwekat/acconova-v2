import { Link, usePage } from '@inertiajs/react';
import { ChevronDown, FolderKanban, Gauge, ListTodo, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useLocale } from '@/lib/i18n';
import type { AppPageProps } from '@/types/app';

export function TaskNavigation({ expanded, onExpand, onNavigate }: { expanded: boolean; onExpand: () => void; onNavigate?: () => void }) {
    const page = usePage<AppPageProps>();
    const ar = useLocale() === 'ar';
    const active = page.url.startsWith('/app/task-management');
    const [open, setOpen] = useState(active);
    const permissions = page.props.workspace.activeOrganization?.task_permissions ?? [];
    const items = [
        { permission: 'tasks.dashboard', href: '/app/task-management', ar: 'الرئيسية', en: 'Overview', icon: Gauge },
        { permission: 'tasks.view', href: '/app/task-management/tasks', ar: 'المهام', en: 'Tasks', icon: ListTodo },
        { permission: 'tasks.projects.view', href: '/app/task-management/projects', ar: 'المشاريع', en: 'Projects', icon: FolderKanban },
        { permission: 'tasks.team', href: '/app/task-management/team', ar: 'الفريق وعبء العمل', en: 'Team & workload', icon: UsersRound },
    ].filter((item) => permissions.includes(item.permission));
    if (!items.length) { return null; }
    return <div className="rounded-2xl"><button type="button" title={ar ? 'إدارة المهام' : 'Task management'} aria-label={ar ? 'إدارة المهام' : 'Task management'} aria-expanded={expanded && open} onClick={() => { if (!expanded) { onExpand(); setOpen(true); } else { setOpen(!open); } }} className={`flex min-h-12 w-full items-center rounded-2xl px-3 text-xs font-semibold ${expanded ? 'gap-3' : 'justify-center'} ${active ? 'bg-blue-50 text-blue-600' : 'text-[var(--ac-text-soft)] hover:bg-slate-50'}`}><ListTodo size={19} className="shrink-0" />{expanded && <><span className="flex-1 text-start">{ar ? 'إدارة المهام' : 'Task management'}</span><ChevronDown size={14} className={open ? 'rotate-180' : ''} /></>}</button>{expanded && open && <div className="ms-5 mt-1 space-y-1 border-s border-blue-100 ps-2">{items.map((item) => { const selected = page.url.split('?')[0] === item.href; return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={selected ? 'page' : undefined} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs ${selected ? 'bg-blue-50 font-semibold text-blue-600' : 'text-[var(--ac-text-muted)] hover:bg-slate-50'}`}><item.icon size={15} />{ar ? item.ar : item.en}</Link>; })}</div>}</div>;
}
