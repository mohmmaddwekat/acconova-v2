import { apiRequest, ApiError } from '@/lib/http';
import { getLocale, setLocale } from '@/lib/locale';
import {
    applyProfilePreferences,
    defaultProfilePreferences,
} from '@/lib/profilePreferences';
import type { AppPageProps } from '@/types/app';
import { Link, usePage } from '@inertiajs/react';
import { Activity, Bell, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, FileText, Filter, Folder, Globe2, Grid2X2, KeyRound, Laptop, Link2, LockKeyhole, Mail, Monitor, Moon, Palette, Pin, RotateCcw, Save, Search, Settings2, ShieldCheck, Star, Sun, UploadCloud, UserRound, UsersRound, X, type LucideIcon } from 'lucide-react';
import '../../../css/profile-center.css';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { fetchProfile } from './api';
import type { ProfileResponse } from './types';

export type ProfileTab = 'overview' | 'activity' | 'settings' | 'security' | 'files';
type Category = 'personal' | 'work' | 'policies' | 'certificates' | 'financial' | 'other';
type ProfileFile = { id: number; name: string; category: Category; extension: string; size: number; favorite: boolean; pinned: boolean; created_at: string; updated_at: string; download_url: string };
type Preferences = { locale: 'ar' | 'en'; timezone: string; date_format: 'numeric' | 'long'; hour_cycle: 'h12' | 'h23'; week_start: 'sunday' | 'monday' | 'saturday'; density: 'comfortable' | 'compact'; reduced_motion: boolean; page_size: number; theme: 'light' | 'dark' | 'system' };
type CenterData = { settings: Preferences | null; files: ProfileFile[] };
const panel = 'rounded-2xl border border-[var(--ac-line)] bg-white shadow-[0_3px_16px_rgba(25,65,85,.025)]';
const input = 'w-full rounded-lg border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3 py-2.5 text-xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
const button = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[var(--ac-line)] bg-white px-3 py-2 text-xs font-semibold hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-500 disabled:cursor-not-allowed disabled:opacity-50';
const primary = `${button} !border-teal-600 !bg-teal-600 !text-white hover:!bg-teal-700`;
const muted = 'text-[var(--ac-text-muted)]';
const categories: [Category, string, string][] = [['personal', 'المستندات الشخصية', 'Personal documents'], ['work', 'مستندات العمل', 'Work documents'], ['policies', 'السياسات واللوائح', 'Policies'], ['certificates', 'الشهادات والدورات', 'Certificates'], ['financial', 'الملفات المالية', 'Financial files'], ['other', 'أخرى', 'Other']];

function defaults(): Preferences {
    return defaultProfilePreferences();
}
function errorText(error: unknown): string {
    return error instanceof ApiError ? [error.message, ...Object.values(error.errors).flat()].join(' ') : error instanceof Error ? error.message : 'Request failed';
}
function sizeLabel(bytes: number): string {
    return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}
function dateValue(value: string): Date {
    return new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
}
function dateLabel(value: string, preferences: Preferences): string {
    return new Intl.DateTimeFormat(preferences.locale, { dateStyle: preferences.date_format === 'long' ? 'long' : 'short', timeZone: preferences.timezone }).format(dateValue(value));
}
function Card({ title, icon: Icon, children, action, className = '' }: { title: string; icon: LucideIcon; children: ReactNode; action?: ReactNode; className?: string }) {
    return <section className={`${panel} p-4 ${className}`}><header className="mb-4 flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-bold"><Icon size={19} className="shrink-0 text-teal-600" />{title}</h2>{action}</header>{children}</section>;
}
function Empty({ children }: { children: ReactNode }) {
    return <div className={`flex min-h-28 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--ac-line)] p-5 text-center text-xs leading-6 ${muted}`}><Folder size={25} className="text-teal-400" />{children}</div>;
}
function Stat({ title, value, icon: Icon, hint }: { title: string; value: string | number; icon: LucideIcon; hint?: string }) {
    return <div className={`${panel} flex items-center gap-3 p-4`}><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600"><Icon size={23} /></span><div className="min-w-0"><p className={`text-[11px] ${muted}`}>{title}</p><strong className="mt-1 block text-xl">{value}</strong>{hint && <p className={`mt-1 text-[10px] ${muted}`}>{hint}</p>}</div></div>;
}

export function activeProfileTab(url: string): ProfileTab {
    const value = new URLSearchParams(url.split('?')[1] ?? '').get('view');
    return value === 'activity' || value === 'settings' || value === 'security' || value === 'files' ? value : 'overview';
}
export function ProfileTabs({ ar, active }: { ar: boolean; active: ProfileTab }) {
    const tabs: [ProfileTab, string, string, LucideIcon][] = [['overview', 'نظرة عامة', 'Overview', UserRound], ['activity', 'النشاط', 'Activity', Activity], ['settings', 'الإعدادات', 'Settings', Settings2], ['security', 'الأمان', 'Security', ShieldCheck], ['files', 'الملفات والمستندات', 'Files & documents', FileText]];
    return <nav aria-label={ar ? 'أقسام الملف الشخصي' : 'Profile sections'} className={`${panel} mt-4 flex overflow-x-auto px-3`}>{tabs.map(([key, arabic, english, Icon]) => <Link key={key} preserveScroll href={key === 'overview' ? '/app/profile' : `/app/profile?view=${key}`} aria-current={key === active ? 'page' : undefined} className={`flex min-w-max flex-1 items-center justify-center gap-3 border-b-2 px-5 py-4 text-xs font-semibold transition-colors ${active === key ? 'border-teal-600 text-teal-600' : `border-transparent hover:bg-teal-50 ${muted}`}`}><Icon size={18} />{ar ? arabic : english}</Link>)}</nav>;
}

export function ProfileCenter({ tab, profile, ar }: { tab: Exclude<ProfileTab, 'overview'>; profile: ProfileResponse; ar: boolean }) {
    const [data, setData] = useState<CenterData | null>(null);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setError('');
        apiRequest<CenterData>('/api/profile/center', { signal: controller.signal }).then((response) => {
            setData(response);
            if (response.settings) {
                applyProfilePreferences({
                    ...defaults(),
                    ...response.settings,
                });
            }
        }).catch((failure) => { if (!controller.signal.aborted) { setError(errorText(failure)); } });
        return () => controller.abort();
    }, [profile.user.id, revision]);
    const preferences = { ...defaults(), ...data?.settings };
    return <div data-theme={preferences.theme} className={`profile-center mt-4 space-y-4 ${preferences.reduced_motion ? '[&_*]:!transition-none [&_*]:!animate-none' : ''}`}>
        {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}<button className={button} onClick={() => setRevision((value) => value + 1)}>{ar ? 'إعادة المحاولة' : 'Retry'}</button></div>}
        {!data && !error && <div role="status" className={`${panel} p-12 text-center text-sm ${muted}`}>{ar ? 'جارٍ تحميل بيانات الحساب…' : 'Loading account data…'}</div>}
        {data && tab === 'files' && <FilesPanel files={data.files} preferences={preferences} ar={ar} onFiles={(files) => setData((current) => current ? { ...current, files } : current)} />}
        {data && tab === 'settings' && <SettingsPanel preferences={preferences} ar={ar} onSaved={(settings) => setData((current) => current ? { ...current, settings } : current)} />}
        {tab === 'security' && <SecurityPanel profile={profile} ar={ar} preferences={preferences} />}
        {data && tab === 'activity' && <ActivityPanel files={data.files} profile={profile} ar={ar} preferences={preferences} />}
    </div>;
}

function FilesPanel({ files, ar, preferences, onFiles }: { files: ProfileFile[]; ar: boolean; preferences: Preferences; onFiles: (files: ProfileFile[]) => void }) {
    const [category, setCategory] = useState<Category | 'all' | 'favorite'>('all');
    const [uploadCategory, setUploadCategory] = useState<Category>('personal');
    const [query, setQuery] = useState('');
    const [extension, setExtension] = useState('all');
    const [sort, setSort] = useState('recent');
    const [page, setPage] = useState(1);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [dragging, setDragging] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const actionLock = useRef(false);
    const text = (arabic: string, english: string) => ar ? arabic : english;
    const filtered = files.filter((file) => (category === 'all' || (category === 'favorite' ? file.favorite : file.category === category)) && (extension === 'all' || file.extension === extension) && file.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? b.size - a.size : b.id - a.id);
    const pages = Math.max(1, Math.ceil(filtered.length / preferences.page_size));
    const currentPage = Math.min(page, pages);
    const displayed = filtered.slice((currentPage - 1) * preferences.page_size, currentPage * preferences.page_size);
    async function upload(file?: File) {
        if (!file || actionLock.current) { return; }
        if (file.size > 50 * 1024 * 1024) { setError(text('الحد الأقصى لحجم الملف 50 MB.', 'Maximum file size is 50 MB.')); return; }
        actionLock.current = true; setBusy(true); setError(''); setMessage('');
        const body = new FormData(); body.append('file', file); body.append('category', uploadCategory);
        try { const saved = await apiRequest<ProfileFile>('/api/profile/files', { method: 'POST', body }); onFiles([saved, ...files]); setMessage(text('تم رفع الملف بنجاح.', 'File uploaded.')); }
        catch (failure) { setError(errorText(failure)); }
        finally { actionLock.current = false; setBusy(false); if (fileInput.current) { fileInput.current.value = ''; } }
    }
    async function toggle(file: ProfileFile, key: 'favorite' | 'pinned') {
        if (actionLock.current) { return; }
        actionLock.current = true; setBusy(true); setError('');
        try { const saved = await apiRequest<ProfileFile>(`/api/profile/files/${file.id}`, { method: 'PATCH', body: JSON.stringify({ [key]: !file[key] }) }); onFiles(files.map((item) => item.id === saved.id ? saved : item)); }
        catch (failure) { setError(errorText(failure)); }
        finally { actionLock.current = false; setBusy(false); }
    }
    const fileList = (items: ProfileFile[]) => items.length ? <div className="space-y-2">{items.slice(0, 3).map((file) => <a key={file.id} href={file.download_url} className="flex items-center gap-3 rounded-lg border border-[var(--ac-line)] p-3 hover:bg-teal-50"><FileBadge extension={file.extension} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{file.name}</p><p className={`mt-1 text-[10px] ${muted}`}>{dateLabel(file.created_at, preferences)}</p></div><Download size={14} className={muted} /></a>)}</div> : <Empty>{text('لا توجد ملفات بعد', 'No files yet')}</Empty>;
    return <>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}{message && <p role="status" className="rounded-xl bg-teal-50 p-3 text-xs text-teal-700">{message}</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Stat title={text('جميع الملفات', 'All files')} value={files.length} icon={FileText} /><Stat title={text('المستندات الشخصية', 'Personal documents')} value={files.filter((f) => f.category === 'personal').length} icon={UserRound} /><Stat title={text('مستندات العمل', 'Work documents')} value={files.filter((f) => f.category === 'work').length} icon={Folder} /><Stat title={text('المفضلة', 'Favorites')} value={files.filter((f) => f.favorite).length} icon={Star} /><Stat title={text('التخزين المستخدم', 'Storage used')} value={sizeLabel(files.reduce((total, f) => total + f.size, 0))} icon={UploadCloud} /></div>
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_250px]">
            <div className="min-w-0 space-y-4">
                <div className="grid gap-3 md:grid-cols-3"><div className={`${panel} p-2`}><div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files[0]); }} className={`flex h-full min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-4 text-center ${dragging ? 'border-teal-500 bg-teal-50' : 'border-teal-200'}`}><UploadCloud size={38} className="text-teal-600" /><h2 className="text-sm font-bold">{text('رفع ملف جديد', 'Upload a new file')}</h2><p className={`text-[11px] leading-5 ${muted}`}>{text('اسحب ملفًا هنا أو اختره من جهازك', 'Drop a file here or select one from your device')}</p><select aria-label={text('تصنيف الملف المرفوع', 'Upload category')} className={input} value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value as Category)}>{categories.map(([key, arabic, english]) => <option key={key} value={key}>{ar ? arabic : english}</option>)}</select><button className={`${primary} w-full`} disabled={busy} onClick={() => fileInput.current?.click()}>{busy ? text('جارٍ الحفظ…', 'Saving…') : text('اختيار الملف', 'Select file')}</button><input ref={fileInput} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.zip,.txt,.csv" onChange={(event) => void upload(event.target.files?.[0])} /><p className={`text-[10px] ${muted}`}>{text('الحد الأقصى لحجم الملف: 50 MB', 'Maximum file size: 50 MB')}</p></div></div><Card title={text('الملفات الأخيرة', 'Recent files')} icon={Clock3}>{fileList(files)}</Card><Card title={text('الملفات المثبتة', 'Pinned files')} icon={Pin}>{fileList(files.filter((f) => f.pinned))}</Card></div>
                <div className={`${panel} flex flex-wrap items-center gap-2 p-3`}><span className="me-2 text-xs font-bold">{text('أنواع الملفات', 'File types')}</span>{['all', ...Array.from(new Set(files.map((file) => file.extension))).sort()].map((type) => <button key={type} aria-pressed={extension === type} onClick={() => { setExtension(type); setPage(1); }} className={`${button} ${extension === type ? '!border-teal-500 !bg-teal-50 text-teal-700' : ''}`}>{type === 'all' ? text('الكل', 'All') : type.toUpperCase()}<span className={muted}>{type === 'all' ? files.length : files.filter((f) => f.extension === type).length}</span></button>)}</div>
                <Card title={text('جميع الملفات والمستندات', 'All files & documents')} icon={FileText}>
                    <div className="mb-4 flex flex-wrap gap-2"><label className="relative min-w-40 flex-1"><Search size={16} className={`absolute start-3 top-3 ${muted}`} /><input aria-label={text('البحث في الملفات', 'Search files')} placeholder={text('البحث في الملفات…', 'Search files…')} className={`${input} ps-9`} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label><select aria-label={text('ترتيب الملفات', 'Sort files')} className={`${input} !w-auto`} value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">{text('الأحدث أولًا', 'Newest first')}</option><option value="name">{text('اسم الملف', 'File name')}</option><option value="size">{text('حجم الملف', 'File size')}</option></select></div>
                    {displayed.length ? <div className="overflow-x-auto"><table className="w-full min-w-[630px] text-start text-xs"><thead className={`bg-[var(--ac-surface-soft)] text-[10px] ${muted}`}><tr>{[text('اسم الملف', 'File name'), text('التصنيف', 'Category'), text('تاريخ التعديل', 'Modified'), text('الحجم', 'Size'), text('الوصول', 'Access'), text('الإجراءات', 'Actions')].map((label) => <th key={label} className="p-3 text-start font-medium">{label}</th>)}</tr></thead><tbody>{displayed.map((file) => <tr key={file.id} className="border-b border-[var(--ac-line)] last:border-0 hover:bg-teal-50/40"><td className={preferences.density === 'compact' ? 'p-2' : 'p-3'}><a href={file.download_url} className="flex max-w-64 items-center gap-2"><FileBadge extension={file.extension} /><span className="truncate">{file.name}</span></a></td><td className="p-2"><span className="rounded-full bg-teal-50 px-2 py-1 text-[10px] text-teal-700">{categories.find(([key]) => key === file.category)?.[ar ? 1 : 2]}</span></td><td className={`p-2 text-[10px] ${muted}`}>{dateLabel(file.updated_at, preferences)}</td><td className="p-2"><bdi>{sizeLabel(file.size)}</bdi></td><td className="p-2"><span className={`flex items-center gap-1 text-[10px] ${muted}`}><LockKeyhole size={12} />{text('خاص', 'Private')}</span></td><td className="p-2"><div className="flex gap-1"><button className="rounded p-2 hover:bg-teal-50 disabled:opacity-40" disabled={busy} aria-label={text('المفضلة', 'Favorite')} aria-pressed={file.favorite} onClick={() => void toggle(file, 'favorite')}><Star size={15} className={file.favorite ? 'fill-amber-400 text-amber-500' : muted} /></button><button className="rounded p-2 hover:bg-teal-50 disabled:opacity-40" disabled={busy} aria-label={text('تثبيت الملف', 'Pin file')} aria-pressed={file.pinned} onClick={() => void toggle(file, 'pinned')}><Pin size={15} className={file.pinned ? 'fill-teal-100 text-teal-600' : muted} /></button><a className="rounded p-2 hover:bg-teal-50" href={file.download_url} aria-label={text('تنزيل الملف', 'Download file')}><Download size={15} /></a></div></td></tr>)}</tbody></table></div> : <Empty>{files.length ? text('لا توجد ملفات تطابق البحث.', 'No matching files.') : text('ابدأ برفع أول مستند. ملفاتك خاصة بحسابك.', 'Upload your first document. Your files are private to your account.')}</Empty>}
                    <div className={`mt-4 flex items-center justify-between text-[11px] ${muted}`}><span>{filtered.length} {text('ملف', 'files')}</span><div className="flex items-center gap-3"><button className={button} disabled={currentPage === 1} aria-label={text('السابق', 'Previous')} onClick={() => setPage(currentPage - 1)}><ChevronRight size={14} /></button><span>{currentPage} / {pages}</span><button className={button} disabled={currentPage === pages} aria-label={text('التالي', 'Next')} onClick={() => setPage(currentPage + 1)}><ChevronLeft size={14} /></button></div></div>
                </Card>
            </div>
            <aside className="space-y-4"><Card title={text('الفئات الرئيسية', 'Categories')} icon={Folder}><div className="space-y-1">{([['all', 'جميع الملفات', 'All files'], ['favorite', 'المفضلة', 'Favorites'], ...categories] as const).map(([key, arabic, english]) => <button key={key} onClick={() => { setCategory(key); setPage(1); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-xs ${category === key ? 'bg-teal-50 font-semibold text-teal-700' : `${muted} hover:bg-slate-50`}`}><span>{ar ? arabic : english}</span><span>{files.filter((file) => key === 'all' || (key === 'favorite' ? file.favorite : file.category === key)).length}</span></button>)}</div></Card><Card title={text('أذونات الوصول', 'Access permissions')} icon={ShieldCheck}><span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs text-teal-700"><LockKeyhole size={13} />{text('أنت المالك', 'You are the owner')}</span><p className={`mt-3 text-xs leading-6 ${muted}`}>{text('المستندات محفوظة بشكل خاص، ولا يمكن لأي حساب آخر عرضها أو تنزيلها.', 'Documents are private. Other accounts cannot view or download them.')}</p></Card></aside>
        </div>
    </>;
}

function FileBadge({ extension }: { extension: string }) {
    const color = ['pdf'].includes(extension) ? 'bg-red-50 text-red-500' : ['xls', 'xlsx', 'csv'].includes(extension) ? 'bg-emerald-50 text-emerald-600' : ['jpg', 'jpeg', 'png', 'webp'].includes(extension) ? 'bg-violet-50 text-violet-500' : 'bg-blue-50 text-blue-500';
    return <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${color}`}><FileText size={20} /></span>;
}

function SettingsPanel({
    preferences,
    ar,
    onSaved,
}: {
    preferences: Preferences;
    ar: boolean;
    onSaved: (settings: Preferences) => void;
}) {
    const [
        draft,
        setDraft,
    ] =
        useState(
            preferences,
        );

    const [
        busy,
        setBusy,
    ] =
        useState(
            false,
        );

    const [
        message,
        setMessage,
    ] =
        useState(
            '',
        );

    const [
        error,
        setError,
    ] =
        useState(
            '',
        );

    const [
        connectionNotice,
        setConnectionNotice,
    ] =
        useState(
            '',
        );

    const text =
        (
            arabic: string,
            english: string,
        ): string =>
            ar
                ? arabic
                : english;

    function field<
        K extends keyof Preferences,
    >(
        key: K,
        value: Preferences[K],
    ): void {
        setDraft(
            (
                current,
            ) => {
                const next = {
                    ...current,
                    [key]: value,
                };

                if (
                    [
                        'locale',
                        'theme',
                        'density',
                        'reduced_motion',
                    ].includes(
                        key,
                    )
                ) {
                    applyProfilePreferences(
                        next,
                    );
                }

                return next;
            },
        );

        setMessage(
            '',
        );

        setError(
            '',
        );
    }

    function jump(
        id: string,
    ): void {
        document
            .getElementById(
                `profile-${id}`,
            )
            ?.scrollIntoView({
                behavior:
                    draft.reduced_motion
                        ? 'auto'
                        : 'smooth',

                block:
                    'start',
            });
    }

    async function save(
        event: FormEvent,
    ): Promise<void> {
        event.preventDefault();

        if (busy) {
            return;
        }

        setBusy(
            true,
        );

        setError(
            '',
        );

        setMessage(
            '',
        );

        try {
            const response =
                await apiRequest<{
                    settings: Preferences;
                }>(
                    '/api/profile/preferences',
                    {
                        method:
                            'PUT',

                        body:
                            JSON.stringify(
                                draft,
                            ),
                    },
                );

            onSaved(
                response.settings,
            );

            applyProfilePreferences(
                response.settings,
            );

            setMessage(
                response.settings.locale ===
                    'ar'
                    ? 'تم حفظ التغييرات وتطبيقها على الموقع.'
                    : 'Preferences saved and applied across the app.',
            );
        } catch (
            failure
        ) {
            setError(
                errorText(
                    failure,
                ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    const sections:
        [
            string,
            string,
            string,
            LucideIcon,
        ][] = [
        [
            'region',
            'اللغة والمنطقة',
            'Language & region',
            Globe2,
        ],
        [
            'time',
            'التاريخ والوقت',
            'Date & time',
            CalendarDays,
        ],
        [
            'appearance',
            'المظهر',
            'Appearance',
            Palette,
        ],
        [
            'layout',
            'تخطيط العرض',
            'Layout',
            Grid2X2,
        ],
        [
            'defaults',
            'الإعدادات الافتراضية',
            'Defaults',
            Settings2,
        ],
        [
            'accessibility',
            'إمكانية الوصول',
            'Accessibility',
            UserRound,
        ],
        [
            'connections',
            'الأدوات المتصلة',
            'Connected tools',
            Link2,
        ],
    ];

    const tools = [
        'Slack',
        'Microsoft Teams',
        'Google Drive',
    ];

    return (
        <form onSubmit={save}>
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div
                        id="profile-region"
                        className="scroll-mt-28"
                    >
                        <Card
                            title={text('اللغة والمنطقة', 'Language & region')}
                            icon={Globe2}
                        >
                            <div className="space-y-4">
                                <label className="block text-xs">
                                    {text('لغة واجهة النظام', 'Interface language')}

                                    <select
                                        className={`${input} mt-2`}
                                        value={draft.locale}
                                        onChange={(event) =>
                                            field(
                                                'locale',
                                                event.target.value as Preferences['locale'],
                                            )
                                        }
                                    >
                                        <option value="ar">العربية</option>
                                        <option value="en">English</option>
                                    </select>
                                </label>

                                <label className="block text-xs">
                                    {text('المنطقة الزمنية', 'Time zone')}

                                    <select
                                        className={`${input} mt-2`}
                                        value={draft.timezone}
                                        onChange={(event) =>
                                            field(
                                                'timezone',
                                                event.target.value,
                                            )
                                        }
                                    >
                                        {Array.from(
                                            new Set([
                                                draft.timezone,
                                                'Asia/Hebron',
                                                'Asia/Jerusalem',
                                                'Asia/Riyadh',
                                                'Asia/Dubai',
                                                'Africa/Cairo',
                                                'Europe/London',
                                                'America/New_York',
                                                'UTC',
                                            ]),
                                        ).map((zone) => (
                                            <option key={zone}>
                                                {zone}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <p className={`text-[11px] leading-6 ${muted}`}>
                                    {text(
                                        'تُستخدم هذه الإعدادات لعرض التواريخ والأوقات في النظام.',
                                        'These settings control dates and times across the system.',
                                    )}
                                </p>
                            </div>
                        </Card>
                    </div>

                    <div
                        id="profile-time"
                        className="scroll-mt-28"
                    >
                        <Card
                            title={text('التاريخ والوقت', 'Date & time')}
                            icon={CalendarDays}
                        >
                            <div className="space-y-3">
                                <label className="block text-xs">
                                    {text('تنسيق التاريخ', 'Date format')}

                                    <select
                                        className={`${input} mt-2`}
                                        value={draft.date_format}
                                        onChange={(event) =>
                                            field(
                                                'date_format',
                                                event.target.value as Preferences['date_format'],
                                            )
                                        }
                                    >
                                        <option value="numeric">
                                            {text('أرقام — يوم / شهر / سنة', 'Numeric date')}
                                        </option>
                                        <option value="long">
                                            {text('تاريخ كامل', 'Long date')}
                                        </option>
                                    </select>
                                </label>

                                <label className="block text-xs">
                                    {text('تنسيق الوقت', 'Time format')}

                                    <select
                                        className={`${input} mt-2`}
                                        value={draft.hour_cycle}
                                        onChange={(event) =>
                                            field(
                                                'hour_cycle',
                                                event.target.value as Preferences['hour_cycle'],
                                            )
                                        }
                                    >
                                        <option value="h12">
                                            {text('12 ساعة', '12 hours')}
                                        </option>
                                        <option value="h23">
                                            {text('24 ساعة', '24 hours')}
                                        </option>
                                    </select>
                                </label>

                                <label className="block text-xs">
                                    {text('بداية الأسبوع', 'Week starts on')}

                                    <select
                                        className={`${input} mt-2`}
                                        value={draft.week_start}
                                        onChange={(event) =>
                                            field(
                                                'week_start',
                                                event.target.value as Preferences['week_start'],
                                            )
                                        }
                                    >
                                        <option value="sunday">
                                            {text('الأحد', 'Sunday')}
                                        </option>
                                        <option value="monday">
                                            {text('الاثنين', 'Monday')}
                                        </option>
                                        <option value="saturday">
                                            {text('السبت', 'Saturday')}
                                        </option>
                                    </select>
                                </label>
                            </div>
                        </Card>
                    </div>

                    <Card
                        title={text('التفضيلات العامة', 'General preferences')}
                        icon={Settings2}
                    >
                        <div className="space-y-4">
                            <div className="flex gap-3 rounded-xl bg-teal-50 p-4">
                                <CheckCircle2
                                    size={20}
                                    className="shrink-0 text-teal-600"
                                />

                                <p className="text-xs leading-6 text-teal-800">
                                    {text(
                                        'تُحفظ تفضيلاتك في حسابك وتُطبّق على الموقع كاملًا عند تسجيل الدخول من أي جهاز.',
                                        'Your preferences are saved to your account and applied across the full app on every device.',
                                    )}
                                </p>
                            </div>

                            <Link
                                className={`${button} w-full`}
                                href="/app/settings"
                            >
                                <Bell size={15} />
                                {text('إدارة إشعارات الجهاز', 'Device notifications')}
                            </Link>

                            <Link
                                className={`${button} w-full`}
                                href="/app/profile?view=edit"
                            >
                                <UserRound size={15} />
                                {text('تعديل المعلومات الشخصية', 'Edit personal information')}
                            </Link>
                        </div>
                    </Card>

                    <div
                        id="profile-layout"
                        className="scroll-mt-28"
                    >
                        <Card
                            title={text('تخطيط العرض', 'Layout density')}
                            icon={Grid2X2}
                        >
                            <p className={`mb-4 text-xs ${muted}`}>
                                {text(
                                    'غيّر كثافة عرض الواجهة. التغيير يظهر مباشرة ويمكنك حفظه أدناه.',
                                    'Change interface density. The preview applies immediately and can be saved below.',
                                )}
                            </p>

                            <div className="grid grid-cols-2 gap-3">
                                {(['comfortable', 'compact'] as const).map(
                                    (
                                        density,
                                    ) => (
                                        <button
                                            key={density}
                                            type="button"
                                            aria-pressed={draft.density === density}
                                            onClick={() =>
                                                field(
                                                    'density',
                                                    density,
                                                )
                                            }
                                            className={`rounded-xl border p-4 transition ${draft.density === density ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-[var(--ac-line)] hover:bg-[var(--ac-surface-soft)]'}`}
                                        >
                                            <div className={`mx-auto mb-3 grid w-16 ${density === 'comfortable' ? 'gap-2' : 'gap-1'}`}>
                                                {[1, 2, 3].map(
                                                    (
                                                        line,
                                                    ) => (
                                                        <span
                                                            key={line}
                                                            className={`${density === 'comfortable' ? 'h-2' : 'h-1'} rounded bg-current opacity-25`}
                                                        />
                                                    ),
                                                )}
                                            </div>

                                            <span className="text-xs">
                                                {density === 'comfortable'
                                                    ? text('مريح', 'Comfortable')
                                                    : text('مضغوط', 'Compact')}
                                            </span>

                                            <span className={`mx-auto mt-3 block size-3 rounded-full border ${draft.density === density ? 'border-teal-600 bg-teal-600' : 'border-slate-300'}`} />
                                        </button>
                                    ),
                                )}
                            </div>
                        </Card>
                    </div>

                    <div
                        id="profile-defaults"
                        className="scroll-mt-28"
                    >
                        <Card
                            title={text('الإعدادات الافتراضية', 'Defaults')}
                            icon={Settings2}
                        >
                            <label className="block text-xs">
                                {text('عدد الملفات في الصفحة', 'Files per page')}

                                <select
                                    className={`${input} mt-2`}
                                    value={draft.page_size}
                                    onChange={(event) =>
                                        field(
                                            'page_size',
                                            Number(
                                                event.target.value,
                                            ),
                                        )
                                    }
                                >
                                    {[10, 25, 50].map(
                                        (
                                            count,
                                        ) => (
                                            <option
                                                key={count}
                                                value={count}
                                            >
                                                {count}
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>

                            <div className={`mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-6 ${muted}`}>
                                {text('معاينة التاريخ:', 'Date preview:')}

                                <p className="mt-1 font-semibold text-[var(--ac-text)]">
                                    {dateLabel(
                                        new Date().toISOString(),
                                        draft,
                                    )}
                                </p>
                            </div>
                        </Card>
                    </div>

                    <div
                        id="profile-accessibility"
                        className="scroll-mt-28"
                    >
                        <Card
                            title={text('إمكانية الوصول', 'Accessibility')}
                            icon={UserRound}
                        >
                            <label className="flex cursor-pointer items-center justify-between gap-4">
                                <span>
                                    <strong className="text-xs">
                                        {text('تقليل الحركة', 'Reduce motion')}
                                    </strong>

                                    <span className={`mt-2 block text-[11px] leading-5 ${muted}`}>
                                        {text(
                                            'يعطّل تأثيرات الحركة والانتقالات في الموقع كاملًا.',
                                            'Disables motion and transitions across the full app.',
                                        )}
                                    </span>
                                </span>

                                <input
                                    className="size-5 accent-teal-600"
                                    type="checkbox"
                                    checked={draft.reduced_motion}
                                    onChange={(event) =>
                                        field(
                                            'reduced_motion',
                                            event.target.checked,
                                        )
                                    }
                                />
                            </label>

                            <p className={`mt-6 text-xs leading-6 ${muted}`}>
                                {text(
                                    'يمكن التنقل بلوحة المفاتيح، والواجهة تتكيف مع حجم الشاشة.',
                                    'Keyboard navigation is supported and the layout adapts to screen size.',
                                )}
                            </p>
                        </Card>
                    </div>

                    <div
                        id="profile-appearance"
                        className="scroll-mt-28"
                    >
                        <Card
                            title={text('المظهر', 'Appearance')}
                            icon={Palette}
                        >
                            <p className={`mb-4 text-xs ${muted}`}>
                                {text(
                                    'اختر مظهر الموقع كاملًا. التغيير يظهر مباشرة.',
                                    'Choose the appearance for the full app. Changes preview immediately.',
                                )}
                            </p>

                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    ['light', 'فاتح', 'Light', Sun],
                                    ['dark', 'داكن', 'Dark', Moon],
                                    ['system', 'تلقائي', 'System', Monitor],
                                ] as const).map(
                                    ([
                                        value,
                                        arabic,
                                        english,
                                        Icon,
                                    ]) => (
                                        <button
                                            type="button"
                                            key={value}
                                            aria-pressed={draft.theme === value}
                                            onClick={() =>
                                                field(
                                                    'theme',
                                                    value,
                                                )
                                            }
                                            className={`flex flex-col items-center gap-3 rounded-xl border p-4 text-xs transition ${draft.theme === value ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-[var(--ac-line)] hover:bg-[var(--ac-surface-soft)]'}`}
                                        >
                                            <Icon size={24} />

                                            {ar
                                                ? arabic
                                                : english}

                                            <span className={`size-3 rounded-full border ${draft.theme === value ? 'border-teal-600 bg-teal-600' : 'border-slate-300'}`} />
                                        </button>
                                    ),
                                )}
                            </div>
                        </Card>
                    </div>

                    <div
                        id="profile-connections"
                        className="scroll-mt-28 md:col-span-2"
                    >
                        <Card
                            title={text('الأدوات المتصلة', 'Connected tools')}
                            icon={Link2}
                        >
                            <div className="grid gap-3 sm:grid-cols-3">
                                {tools.map(
                                    (
                                        service,
                                    ) => (
                                        <button
                                            type="button"
                                            key={service}
                                            onClick={() =>
                                                setConnectionNotice(
                                                    text(
                                                        `ربط ${service} يحتاج إعداد OAuth خاص بالخدمة (Client ID / Secret / Redirect URL). لم أفعّل اتصالًا وهميًا؛ بعد إضافة مفاتيح المزود يمكن تشغيل الربط الحقيقي.`,
                                                        `Connecting ${service} requires provider OAuth configuration (Client ID / Secret / Redirect URL). No fake connection is shown; real OAuth can be enabled after provider credentials are configured.`,
                                                    ),
                                                )
                                            }
                                            className="flex items-center gap-3 rounded-xl border border-[var(--ac-line)] p-4 text-start transition hover:border-teal-300 hover:bg-teal-50"
                                        >
                                            <Link2
                                                size={19}
                                                className="text-teal-500"
                                            />

                                            <div>
                                                <strong className="text-xs">
                                                    {service}
                                                </strong>

                                                <p className={`mt-1 text-[10px] ${muted}`}>
                                                    {text(
                                                        'إعداد الربط',
                                                        'Configure connection',
                                                    )}
                                                </p>
                                            </div>
                                        </button>
                                    ),
                                )}
                            </div>

                            {connectionNotice && (
                                <p
                                    role="status"
                                    className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-6 text-amber-800"
                                >
                                    {connectionNotice}
                                </p>
                            )}
                        </Card>
                    </div>
                </div>

                <aside className={`${panel} sticky top-24 p-4`}>
                    <h2 className="text-lg font-bold">
                        {text('الإعدادات', 'Settings')}
                    </h2>

                    <p className={`mb-5 mt-2 text-xs leading-6 ${muted}`}>
                        {text(
                            'إدارة تفضيلاتك الشخصية وحسابك',
                            'Manage your personal preferences',
                        )}
                    </p>

                    <nav className="space-y-1">
                        {sections.map(
                            ([
                                id,
                                arabic,
                                english,
                                Icon,
                            ]) => (
                                <button
                                    type="button"
                                    key={id}
                                    onClick={() =>
                                        jump(
                                            id,
                                        )
                                    }
                                    className={`flex w-full items-center gap-3 rounded-lg p-3 text-start text-xs transition hover:bg-teal-50 hover:text-teal-700 ${muted}`}
                                >
                                    <Icon size={17} />

                                    {ar
                                        ? arabic
                                        : english}
                                </button>
                            ),
                        )}
                    </nav>
                </aside>
            </div>

            <div className={`${panel} mt-4 flex flex-wrap items-center justify-between gap-3 p-4`}>
                <div
                    aria-live="polite"
                    className="text-xs"
                >
                    {error
                        ? (
                            <span
                                role="alert"
                                className="text-red-600"
                            >
                                {error}
                            </span>
                        )
                        : (
                            <span className="text-teal-700">
                                {message}
                            </span>
                        )}
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        className={button}
                        disabled={busy}
                        onClick={() => {
                            const next =
                                defaults();

                            setDraft(
                                next,
                            );

                            applyProfilePreferences(
                                next,
                            );

                            setMessage(
                                text(
                                    'تمت معاينة الإعدادات الافتراضية؛ اضغط حفظ لاعتمادها.',
                                    'Defaults are previewed. Save to persist them.',
                                ),
                            );
                        }}
                    >
                        <RotateCcw size={14} />

                        {text('إعادة تعيين الإعدادات', 'Reset settings')}
                    </button>

                    <button
                        className={primary}
                        disabled={busy}
                    >
                        <Save size={14} />

                        {busy
                            ? text('جارٍ الحفظ…', 'Saving…')
                            : text('حفظ التغييرات', 'Save changes')}
                    </button>
                </div>
            </div>
        </form>
    );
}

function SecurityPanel({ profile, ar, preferences }: { profile: ProfileResponse; ar: boolean; preferences: Preferences }) {
    const { workspace } = usePage<AppPageProps>().props;
    const [sessions, setSessions] = useState(profile.sessions);
    const [dialog, setDialog] = useState<'password' | 'sessions' | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const dialogRef = useRef<HTMLDialogElement>(null);
    const text = (arabic: string, english: string) => ar ? arabic : english;
    useEffect(() => {
        let cancelled = false;
        fetchProfile().then((response) => { if (!cancelled) { setSessions(response.sessions); } }).catch(() => { /* Keep the profile data already loaded by the page. */ });
        return () => { cancelled = true; };
    }, []);
    useEffect(() => { if (dialog) { dialogRef.current?.showModal(); } else { dialogRef.current?.close(); } }, [dialog]);
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); if (busy) { return; } setBusy(true); setError(''); setMessage('');
        const body = Object.fromEntries(new FormData(event.currentTarget));
        try {
            await apiRequest(`/api/profile/${dialog === 'password' ? 'password' : 'sessions'}`, { method: dialog === 'password' ? 'PATCH' : 'DELETE', body: JSON.stringify(body) });
            if (dialog === 'password') { window.location.assign('/app/profile?view=security'); return; }
            setDialog(null); setMessage(text('تم تحديث أمان الحساب وإنهاء الجلسات الأخرى.', 'Account security updated and other sessions revoked.'));
            try { setSessions((await fetchProfile()).sessions); } catch { setSessions((current) => current.filter((session) => session.current)); }
        } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
    }
    const open = (value: 'password' | 'sessions') => { setError(''); setDialog(value); };
    const sessionRows = sessions.map((session) => <div key={session.id} className="flex items-center gap-3 rounded-lg border border-[var(--ac-line)] p-3"><Laptop size={22} className="shrink-0 text-teal-600" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{deviceLabel(session.agent)}</p><p className={`mt-1 text-[10px] ${muted}`}><bdi>{session.ip ?? '—'}</bdi> · {new Intl.DateTimeFormat(ar ? 'ar' : 'en', { timeZone: preferences.timezone, dateStyle: 'short', timeStyle: 'short', hourCycle: preferences.hour_cycle }).format(new Date(session.last_activity * 1000))}</p></div>{session.current && <span className="rounded-full bg-teal-50 px-2 py-1 text-[9px] text-teal-700">{text('الحالية', 'Current')}</span>}</div>);
    return <>
        {message && <p role="status" className="rounded-xl bg-teal-50 p-4 text-xs text-teal-700">{message}</p>}
        <div className="grid items-start gap-4 lg:grid-cols-3"><Card title={text('حالة أمان الحساب', 'Account security')} icon={ShieldCheck}><div className="flex items-center gap-5"><div className="flex size-24 shrink-0 items-center justify-center rounded-full border-8 border-teal-100 text-teal-600"><ShieldCheck size={39} /></div><div className="space-y-3 text-xs"><p className="flex items-center gap-2"><CheckCircle2 size={16} className="text-teal-600" />{text('حساب محمي بكلمة مرور', 'Password protected')}</p><p className="flex items-center gap-2"><Mail size={16} className="text-teal-600" />{profile.user.email_verified_at ? text('البريد الإلكتروني موثّق', 'Email verified') : text('البريد يحتاج إلى توثيق', 'Email needs verification')}</p><p className={`text-[11px] ${muted}`}>{text('راجع أجهزتك بشكل دوري', 'Review your devices regularly')}</p></div></div></Card><Card title={text('المصادقة الثنائية', 'Two-factor authentication')} icon={ShieldCheck}><span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] text-amber-700">{text('غير متاحة حاليًا', 'Not available yet')}</span><p className={`my-4 text-xs leading-6 ${muted}`}>{text('لم تُضف خدمة المصادقة الثنائية إلى هذا النظام بعد.', 'Two-factor authentication has not been configured for this application.')}</p><button type="button" className={`${button} w-full`} disabled>{text('تفعيل المصادقة الثنائية', 'Enable two-factor authentication')}</button></Card><Card title={text('كلمة المرور', 'Password')} icon={LockKeyhole}><p className={`mb-5 text-xs leading-6 ${muted}`}>{text('اختر كلمة مرور قوية. تغييرها ينهي الجلسات الأخرى.', 'Choose a strong password. Changing it revokes other sessions.')}</p><button type="button" className={`${primary} w-full`} onClick={() => open('password')}><KeyRound size={15} />{text('تغيير كلمة المرور', 'Change password')}</button></Card>
        <Card title={text('الجلسات النشطة', 'Active sessions')} icon={UsersRound} className="lg:col-span-2" action={<button className={`${button} text-red-600`} onClick={() => open('sessions')} disabled={!sessions.some((session) => !session.current)}>{text('إنهاء الجلسات الأخرى', 'Revoke other sessions')}</button>}><div className="grid gap-2 md:grid-cols-2">{sessions.length ? sessionRows : <p className={`text-xs ${muted}`}>{text('لا تتوفر بيانات جلسات محفوظة لهذا الحساب.', 'No stored session data is available for this account.')}</p>}</div></Card><Card title={text('الصلاحيات والوصول', 'Permissions & access')} icon={UsersRound}><dl className="space-y-4 text-xs"><div className="flex justify-between gap-3"><dt className={muted}>{text('الدور الحالي', 'Current role')}</dt><dd className="rounded-full bg-teal-50 px-3 py-1 text-teal-700">{workspace.activeOrganization?.role ?? '—'}</dd></div><div className="flex justify-between gap-3"><dt className={muted}>{text('مساحة العمل', 'Workspace')}</dt><dd>{workspace.activeOrganization?.name ?? '—'}</dd></div><div className="flex justify-between"><dt className={muted}>{text('مساحات العمل المتاحة', 'Available workspaces')}</dt><dd>{workspace.organizations.length}</dd></div></dl></Card>
        <Card title={text('معلومات الحساب', 'Account information')} icon={Mail}><p className={`text-[11px] ${muted}`}>{text('البريد الإلكتروني', 'Email address')}</p><p className="my-3 break-all text-xs"><bdi>{profile.user.email}</bdi></p><Link className={`${button} w-full`} href="/app/profile?view=edit">{text('إدارة البريد ومعلومات التواصل', 'Manage contact information')}</Link></Card><Card title={text('الأجهزة المتصلة', 'Connected devices')} icon={Monitor}><div className="space-y-3">{Array.from(new Set(sessions.map((s) => deviceLabel(s.agent)))).map((device) => <p key={device} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 text-xs"><Monitor size={18} className="text-teal-600" />{device}</p>)}{!sessions.length && <p className={`text-xs ${muted}`}>{text('لا تتوفر بيانات أجهزة', 'No device data available')}</p>}</div></Card><Card title={text('رموز النسخ الاحتياطي', 'Recovery codes')} icon={KeyRound}><Empty>{text('تتوفر رموز الاسترداد عند إضافة المصادقة الثنائية.', 'Recovery codes will be available when two-factor authentication is added.')}</Empty></Card></div>
        <dialog ref={dialogRef} onCancel={(event) => { if (busy) { event.preventDefault(); } else { setDialog(null); } }} onClose={() => setDialog(null)} className="m-auto w-[min(460px,calc(100%-2rem))] rounded-2xl border border-[var(--ac-line)] bg-white p-6 text-[var(--ac-text)] shadow-xl backdrop:bg-slate-950/40"><form onSubmit={submit} key={dialog}><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-base font-bold">{dialog === 'password' ? text('تغيير كلمة المرور', 'Change password') : text('إنهاء الجلسات الأخرى', 'Revoke other sessions')}</h2><button type="button" aria-label={text('إغلاق', 'Close')} disabled={busy} onClick={() => setDialog(null)}><X size={18} /></button></div><label className="block text-xs">{text('كلمة المرور الحالية', 'Current password')}<input autoFocus autoComplete="current-password" required name="current_password" type="password" className={`${input} mb-4 mt-2`} /></label>{dialog === 'password' && <><p className={`mb-4 text-xs leading-6 ${muted}`}>{text('12 حرفًا على الأقل، مع أحرف كبيرة وصغيرة وأرقام.', 'At least 12 characters, including uppercase, lowercase and numbers.')}</p><label className="block text-xs">{text('كلمة المرور الجديدة', 'New password')}<input required autoComplete="new-password" minLength={12} name="password" type="password" className={`${input} mb-4 mt-2`} /></label><label className="block text-xs">{text('تأكيد كلمة المرور', 'Confirm password')}<input required autoComplete="new-password" minLength={12} name="password_confirmation" type="password" className={`${input} mb-4 mt-2`} /></label></>}{error && <p role="alert" className="mb-4 text-xs leading-6 text-red-600">{error}</p>}<button className={`${primary} w-full`} disabled={busy}>{busy ? text('جارٍ الحفظ…', 'Saving…') : text('تأكيد', 'Confirm')}</button></form></dialog>
    </>;
}

function deviceLabel(agent: string | null): string {
    if (!agent) { return '—'; }
    const browser = agent.includes('Edg/') ? 'Edge' : agent.includes('Chrome/') ? 'Chrome' : agent.includes('Firefox/') ? 'Firefox' : agent.includes('Safari/') ? 'Safari' : 'Browser';
    const device = agent.includes('iPhone') ? 'iPhone' : agent.includes('Android') ? 'Android' : agent.includes('Windows') ? 'Windows' : agent.includes('Macintosh') ? 'macOS' : 'Linux';
    return `${browser} · ${device}`;
}

function ActivityPanel({ files, profile, ar, preferences }: { files: ProfileFile[]; profile: ProfileResponse; ar: boolean; preferences: Preferences }) {
    const [period, setPeriod] = useState('week');
    const [kind, setKind] = useState('all');
    const text = (arabic: string, english: string) => ar ? arabic : english;
    const records = [
        ...files.map((file) => ({ id: `file-${file.id}`, type: 'files', title: text('رفع ملف', 'Uploaded a file'), detail: file.name, date: dateValue(file.created_at), href: file.download_url, icon: FileText })),
        ...profile.sessions.map((session) => ({ id: `session-${session.id}`, type: 'sessions', title: text('آخر نشاط للجلسة', 'Last session activity'), detail: deviceLabel(session.agent), date: new Date(session.last_activity * 1000), href: '/app/profile?view=security', icon: UserRound })),
        { id: 'joined', type: 'account', title: text('إنشاء الحساب', 'Account created'), detail: profile.user.name, date: dateValue(profile.user.created_at), href: '/app/profile', icon: CheckCircle2 },
    ].sort((a, b) => b.date.getTime() - a.date.getTime());
    const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: preferences.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    const now = new Date();
    const today = dayKey(now);
    const localDate = new Date(`${today}T12:00:00Z`);
    const periodStart = new Date(localDate);
    if (period === 'week') { const start = preferences.week_start === 'monday' ? 1 : preferences.week_start === 'saturday' ? 6 : 0; periodStart.setUTCDate(periodStart.getUTCDate() - (periodStart.getUTCDay() - start + 7) % 7); }
    if (period === 'month') { periodStart.setUTCDate(1); }
    const startKey = periodStart.toISOString().slice(0, 10);
    const filtered = records.filter((record) => (period === 'all' || (dayKey(record.date) >= startKey && dayKey(record.date) <= today)) && (kind === 'all' || kind === record.type));
    const groups = new Map<string, typeof records>();
    filtered.forEach((record) => { const key = dayKey(record.date); groups.set(key, [...(groups.get(key) ?? []), record]); });
    const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(localDate); date.setUTCDate(date.getUTCDate() - 6 + index); const key = date.toISOString().slice(0, 10); return { key, label: new Intl.DateTimeFormat(ar ? 'ar' : 'en', { weekday: 'short', timeZone: 'UTC' }).format(date), count: records.filter((record) => dayKey(record.date) === key).length }; });
    const max = Math.max(1, ...days.map((day) => day.count));
    const fileCount = filtered.filter((record) => record.type === 'files').length;
    const sessionCount = filtered.filter((record) => record.type === 'sessions').length;
    const filePercent = filtered.length ? Math.round(fileCount / filtered.length * 100) : 0;
    function exportActivity() {
        const rows = [[text('النشاط', 'Activity'), text('التفاصيل', 'Details'), text('الوقت', 'Time')], ...filtered.map((record) => [record.title, record.detail, record.date.toISOString()])];
        const csv = '\uFEFF' + rows.map((row) => row.map((value) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'profile-activity.csv'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat title={text('النشاط في الفترة المحددة', 'Activity in selected period')} value={filtered.length} icon={Activity} /><Stat title={text('الملفات المرفوعة', 'Uploaded files')} value={fileCount} icon={UploadCloud} /><Stat title={text('نشاط الجلسات', 'Session activity')} value={sessionCount} icon={Clock3} /><Stat title={text('الجلسات الحالية', 'Current sessions')} value={profile.sessions.length} icon={Monitor} /></div><div className="grid items-start gap-4 xl:grid-cols-[240px_minmax(0,1fr)_260px]"><aside className="space-y-4"><Card title={text('فلاتر سريعة', 'Quick filters')} icon={Filter}><div className="grid grid-cols-2 gap-2">{[['today', 'اليوم', 'Today'], ['week', 'هذا الأسبوع', 'This week'], ['month', 'هذا الشهر', 'This month'], ['all', 'كل الوقت', 'All time']].map(([key, arabic, english]) => <button key={key} aria-pressed={period === key} className={period === key ? primary : button} onClick={() => setPeriod(key)}>{ar ? arabic : english}</button>)}</div></Card><Card title={text('أحدث الأنشطة', 'Latest activity')} icon={Activity}><div className="space-y-5">{records.slice(0, 5).map((record) => <a key={record.id} href={record.href} className="flex items-start gap-2"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-teal-500" /><div className="min-w-0"><p className="truncate text-xs">{record.title}</p><p className={`mt-1 truncate text-[10px] ${muted}`}>{record.detail}</p></div></a>)}</div></Card><div className="rounded-xl border border-teal-100 bg-teal-50 p-4 text-xs leading-6 text-teal-800">{text('يعرض السجل عمليات رفع ملفاتك وآخر نشاط لكل جلسة محفوظة.', 'This feed includes file uploads and the latest activity of each stored session.')}</div></aside><Card title={text('سجل النشاط', 'Activity timeline')} icon={Activity} action={<button className={`${button} text-teal-700`} disabled={!filtered.length} onClick={exportActivity}><Download size={14} />{text('تصدير', 'Export')}</button>}><label className="mb-5 block"><span className={`mb-2 block text-[11px] ${muted}`}>{text('نوع النشاط', 'Activity type')}</span><select className={input} value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">{text('كل الأنواع', 'All types')}</option><option value="files">{text('الملفات', 'Files')}</option><option value="sessions">{text('الجلسات', 'Sessions')}</option><option value="account">{text('الحساب', 'Account')}</option></select></label>{groups.size ? Array.from(groups).map(([date, items]) => <div key={date} className="mb-5 last:mb-0"><h3 className={`mb-2 text-xs font-semibold ${muted}`}>{dateLabel(items[0].date.toISOString(), preferences)}</h3><div className="divide-y divide-[var(--ac-line)] rounded-xl border border-[var(--ac-line)]">{items.map((record) => <div key={record.id} className="flex items-center gap-3 p-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600"><record.icon size={17} /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{record.title}</p><p className={`mt-1 truncate text-[11px] ${muted}`}>{record.detail}</p></div><div className="shrink-0 text-end"><p className={`text-[10px] ${muted}`}>{new Intl.DateTimeFormat(ar ? 'ar' : 'en', { timeZone: preferences.timezone, hour: '2-digit', minute: '2-digit', hourCycle: preferences.hour_cycle }).format(record.date)}</p><a className="mt-1 inline-block text-[10px] text-teal-600 hover:underline" href={record.href}>{text('عرض التفاصيل', 'View details')}</a></div></div>)}</div></div>) : <Empty>{text('لا يوجد نشاط يطابق الفترة والفلاتر المحددة.', 'No activity matches this period and filter.')}</Empty>}</Card><aside className="space-y-4"><Card title={text('مخطط النشاط', 'Activity chart')} icon={Activity}><p className={`text-[10px] ${muted}`}>{text('آخر 7 أيام', 'Last 7 days')}</p><div className="mt-5 flex h-36 items-end justify-between gap-2">{days.map((day) => <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px]">{day.count}</span><div className="w-full max-w-7 rounded-t-md bg-gradient-to-t from-teal-500 to-teal-200" style={{ height: `${Math.max(3, day.count / max * 80)}px` }} /><span className={`text-[8px] ${muted}`}>{day.label}</span></div>)}</div></Card><Card title={text('توزيع النشاط حسب النوع', 'Activity by type')} icon={Grid2X2}><div className="mx-auto flex size-32 items-center justify-center rounded-full" style={{ background: `conic-gradient(#0d9488 ${filePercent}%, #dbeafe 0)` }}><div className="flex size-24 flex-col items-center justify-center rounded-full bg-white"><strong className="text-2xl">{filtered.length}</strong><span className={`text-[10px] ${muted}`}>{text('نشاط', 'events')}</span></div></div><div className="mt-5 space-y-3 text-xs"><p className="flex justify-between"><span>{text('الملفات', 'Files')}</span><strong className="text-teal-600">{fileCount}</strong></p><p className="flex justify-between"><span>{text('الجلسات', 'Sessions')}</span><strong>{sessionCount}</strong></p><p className="flex justify-between"><span>{text('الحساب', 'Account')}</span><strong>{filtered.filter((record) => record.type === 'account').length}</strong></p></div></Card></aside></div></>;
}
