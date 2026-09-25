import { useLocale } from '@/lib/i18n';
import { setLocale } from '@/lib/locale';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    Search,
    ShieldCheck,
    Sparkles,
} from 'lucide-react';
import { useMemo, useState } from 'react';

type Permission = {
    key: string;
    label_ar: string;
    label_en: string;
    builtin: string[];
    depends: string[];
};

type Group = {
    key: string;
    title_ar: string;
    title_en: string;
    description_ar: string;
    description_en: string;
    permissions: Permission[];
};

export default function PlatformFeatures({
    groups,
    permissionCount,
}: {
    groups: Group[];
    permissionCount: number;
}) {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = (arabic: string, english: string) => ar ? arabic : english;
    const Back = ar ? ArrowRight : ArrowLeft;
    const [query, setQuery] = useState('');

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return groups;

        return groups
            .map(group => ({
                ...group,
                permissions: group.permissions.filter(permission => [
                    permission.key,
                    permission.label_ar,
                    permission.label_en,
                    group.key,
                    group.title_ar,
                    group.title_en,
                ].some(value => value.toLowerCase().includes(q))),
            }))
            .filter(group => group.permissions.length > 0);
    }, [groups, query]);

    return (
        <>
            <Head title={`${text('كتالوج المزايا والصلاحيات', 'Feature & permission catalog')} | AccoNova Admin`} />
            <main dir={ar ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-6 lg:p-8">
                <div className="mx-auto max-w-7xl">
                    <header className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-bold text-sky-600">
                                <Back size={15} /> {text('العودة إلى لوحة الإدارة', 'Back to admin')}
                            </Link>
                            <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-sky-600">AccoNova Platform Admin</p>
                            <h1 className="mt-2 text-3xl font-black tracking-tight">{text('كل المزايا والصلاحيات', 'All features & permissions')}</h1>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                                {text(
                                    'مرجع مركزي لكل قدرات AccoNova القابلة للإسناد للأدوار داخل المؤسسات. هذه القائمة تقرأ مباشرة من كتالوج الصلاحيات الحقيقي في النظام.',
                                    'A central reference for every AccoNova capability assignable to workspace roles. This page reads directly from the real permission catalog.',
                                )}
                            </p>
                        </div>
                        <button type="button" onClick={() => setLocale(ar ? 'en' : 'ar')} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold shadow-sm dark:border-slate-700 dark:bg-slate-900">
                            {ar ? 'English' : 'العربية'}
                        </button>
                    </header>

                    <div className="mt-6 grid gap-4 sm:grid-cols-3">
                        <Stat label={text('مجموع الصلاحيات', 'Total permissions')} value={permissionCount.toLocaleString()} icon={<ShieldCheck size={18} />} />
                        <Stat label={text('مجموع مجموعات المزايا', 'Feature groups')} value={groups.length.toLocaleString()} icon={<Sparkles size={18} />} />
                        <Stat label={text('المصدر', 'Source')} value={text('كتالوج النظام', 'Live catalog')} icon={<CheckCircle2 size={18} />} />
                    </div>

                    <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                        <Search size={17} className="text-slate-400" />
                        <input
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder={text('ابحث باسم الميزة أو مفتاح الصلاحية...', 'Search feature name or permission key...')}
                            className="w-full bg-transparent text-sm outline-none"
                        />
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        {filtered.map(group => (
                            <details key={group.key} open={!query} className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                                <summary className="cursor-pointer list-none p-5">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <strong className="text-base">{ar ? group.title_ar : group.title_en}</strong>
                                                <code className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-500 dark:bg-slate-800">{group.key}</code>
                                            </div>
                                            <p className="mt-2 text-sm leading-6 text-slate-500">{ar ? group.description_ar : group.description_en}</p>
                                        </div>
                                        <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-black text-sky-700 dark:bg-sky-950 dark:text-sky-300">{group.permissions.length}</span>
                                    </div>
                                </summary>
                                <div className="border-t border-slate-100 p-4 dark:border-slate-800">
                                    <div className="space-y-2">
                                        {group.permissions.map(permission => (
                                            <div key={permission.key} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                                                <strong className="block text-sm">{ar ? permission.label_ar : permission.label_en}</strong>
                                                <code className="mt-1 block text-[11px] text-sky-600">{permission.key}</code>
                                                {(permission.builtin.length > 0 || permission.depends.length > 0) && (
                                                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                                                        {permission.builtin.length > 0 && <span>{text('أدوار افتراضية:', 'Built-in roles:')} {permission.builtin.join(', ')}</span>}
                                                        {permission.depends.length > 0 && <span>{text('يعتمد على:', 'Depends on:')} {permission.depends.join(', ')}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </details>
                        ))}
                    </div>
                </div>
            </main>
        </>
    );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">{icon}</span>
                <span className="text-xs font-bold text-slate-500">{label}</span>
            </div>
            <strong className="mt-4 block text-2xl font-black">{value}</strong>
        </section>
    );
}
