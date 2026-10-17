import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BellOff, Bell, Search, Pin, Pencil, Image, Type, Users, File, ShieldCheck, Flag, LogOut, MessageCircle, Archive, UserPlus } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/http';
import { MemberActions, MessagingDialog } from './MemberActions';
import type { Conversation, ThreadResponse } from './types';

export type ConversationSettings = {
    theme: string; quick_reaction: string; can_customize: boolean; avatar_url: string | null;
    notifications_muted: boolean; notifications_muted_until: string | null; read_receipts: boolean;
    nicknames: Record<string, string | null>; pins: { id: number; body: string; name: string }[];
    reports: { id: number; reason: string; name: string; created_at: string }[];
};
type LibraryItem = { id: number; kind?: string; name?: string; url?: string; body?: string };
type Mode = 'name' | 'theme' | 'emoji' | 'nickname' | 'notifications' | 'pins' | 'media' | 'files' | 'links' | 'report' | 'reports' | 'leave' | 'members' | null;
const inputClass = 'mt-2 w-full rounded-xl border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 text-sm outline-none focus:border-[var(--ac-accent)]';
const buttonClass = 'rounded-xl bg-[var(--ac-accent-strong)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40';
const emojiChoices = ['👍', '❤️', '😂', '🎉', '😮', '😢'];
function avatarTone(seed: number | string): string {
    let sum = 0;

    for (const char of String(seed)) {
        sum += char.charCodeAt(0);
    }

    return ['', 'a2', 'a3', 'a4', 'a5'][sum % 5];
}
/**
 * `green` is the stored default for every conversation, so it carries the
 * AccoNova brand palette (same scale as design-system.css) instead of green.
 */
export const chatThemes: Record<string, { background: string; bubble: string; other: string; text: string; surface: string; soft: string; line: string; muted: string; accent: string; accentText: string; ownText?: string; accentSoft?: string }> = {
    green: { background: '#f8fbff', bubble: '#068CF0', other: '#E6F3FE', text: '#011C32', surface: '#ffffff', soft: '#f8fbff', line: '#CDE8FE', muted: '#045495', accent: '#068CF0', accentText: '#0570C7', ownText: '#ffffff', accentSoft: 'rgba(6, 140, 240, 0.12)' },
    blue: { background: '#f0f6ff', bubble: '#cfe2ff', other: '#e6effc', text: '#172c4e', surface: '#f8fbff', soft: '#e4efff', line: '#cbdcf3', muted: '#536f94', accent: '#245eae', accentText: '#245eae' },
    purple: { background: '#f8f1ff', bubble: '#e9d5ff', other: '#f0e5fa', text: '#36214f', surface: '#fdf9ff', soft: '#f0e3fb', line: '#e2ccef', muted: '#79608f', accent: '#7940a3', accentText: '#7940a3' },
    rose: { background: '#fff1f5', bubble: '#ffdce6', other: '#fce7ed', text: '#4d2630', surface: '#fff9fb', soft: '#fde5ed', line: '#efccd8', muted: '#926170', accent: '#ad3e64', accentText: '#ad3e64' },
    dark: { background: '#011423', bubble: '#38A3FA', other: '#033863', text: '#E6F3FE', surface: '#011C32', soft: '#033863', line: '#033863', muted: '#9CD1FC', accent: '#38A3FA', accentText: '#38A3FA', ownText: '#011423', accentSoft: 'rgba(56, 163, 250, 0.14)' },
};

export function ConversationDetails({ conversation, thread, settings, ar, userId, memberEditor, onClose, onSearch, onDirect, onMessage, onChanged, onLeave, onArchive, deviceNotifications }: {
    conversation: Conversation; thread: ThreadResponse; settings: ConversationSettings | null; ar: boolean; userId: number; memberEditor: ReactNode;
    deviceNotifications?: { enabled: boolean; hint: string; enable: () => void };
    onClose: () => void; onSearch: () => void; onDirect: (id: number) => void; onChanged: () => void; onLeave: () => void; onArchive: () => void;
    onMessage: (personId: number) => void;
}) {
    const [mode, setMode] = useState<Mode>(null);
    const [value, setValue] = useState('');
    const [personId, setPersonId] = useState(userId);
    const [duration, setDuration] = useState('60');
    const [until, setUntil] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [page, setPage] = useState(1);
    const [libKind, setLibKind] = useState<'media' | 'files' | 'links'>('media');
    const [library, setLibrary] = useState<{ data: LibraryItem[]; last_page: number } | null>(null);
    const upload = useRef<HTMLInputElement>(null);
    const group = conversation.kind === 'group';
    const admin = group && thread.can_manage;
    const other = thread.members.find((person) => person.id !== userId);
    const labels: Record<Exclude<Mode, null>, string> = ar ? {
        name: 'تغيير اسم الدردشة', theme: 'تغيير السمة', emoji: 'تغيير الرمز التعبيري', nickname: 'تعديل الألقاب', notifications: 'إشعارات الدردشة', pins: 'الرسائل المثبتة', media: 'الوسائط', files: 'الملفات', links: 'الروابط', report: 'إبلاغ أدمن المجموعة', reports: 'بلاغات الأعضاء', leave: 'مغادرة المجموعة', members: 'إدارة الأعضاء',
    } : { name: 'Change chat name', theme: 'Change theme', emoji: 'Change quick emoji', nickname: 'Edit nicknames', notifications: 'Chat notifications', pins: 'Pinned messages', media: 'Media', files: 'Files', links: 'Links', report: 'Report to group admin', reports: 'Member reports', leave: 'Leave group', members: 'Manage members' };
    function open(next: Exclude<Mode, null>): void { setError(''); setSuccess(''); setMode(next); setValue(next === 'name' ? conversation.display_name : next === 'nickname' ? settings?.nicknames[personId] ?? '' : ''); setPage(1); }
    async function save(action: string, data: Record<string, unknown> = {}, file?: globalThis.File): Promise<void> {
        setBusy(true); setError(''); setSuccess('');
        try {
            const body = file ? new FormData() : JSON.stringify({ action, ...data });
            if (body instanceof FormData) { body.append('action', action); body.append('avatar', file!); }
            await apiRequest(`/api/team-space/${conversation.id}/settings`, { method: 'POST', body });
            setMode(null);
            if (action === 'leave') { onLeave(); } else { onChanged(); setSuccess(ar ? 'تم الحفظ.' : 'Saved.'); }
        } catch (failure) { setError(failure instanceof ApiError ? [failure.message, ...Object.values(failure.errors).flat()].join(' ') : (ar ? 'تعذر حفظ التغيير.' : 'Unable to save.')); }
        finally { setBusy(false); }
    }
    useEffect(() => {
        const controller = new AbortController(); setLibrary(null);
        apiRequest<{ data: LibraryItem[]; last_page: number }>(`/api/team-space/${conversation.id}/library?kind=${libKind}&page=${page}`, { signal: controller.signal }).then(setLibrary)
            .catch(() => { if (!controller.signal.aborted) { setError(ar ? 'تعذر تحميل العناصر.' : 'Unable to load items.'); } });
        return () => controller.abort();
    }, [libKind, page, conversation.id, ar]);
    function mute(): void {
        if (settings?.notifications_muted) { void save('notifications', { muted: false }); return; }
        open('notifications');
    }
    function saveMute(): void {
        let expires: string | null = null;
        if (duration !== 'forever') {
            const date = duration === 'custom' ? new Date(until) : new Date(Date.now() + Number(duration) * 60000);
            if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) { setError(ar ? 'اختر موعدًا في المستقبل.' : 'Choose a future time.'); return; }
            expires = date.toISOString();
        }
        void save('notifications', { muted: true, until: expires });
    }
    const memberProps = { conversationId: conversation.id, userId, ar, onDirect, onChanged };
    const members = thread.members;
    const themeChoices: [string, string, string][] = [
        ['green', 'var(--ac-accent)', ar ? 'افتراضي' : 'Default'],
        ['blue', '#4C7BE8', ar ? 'أزرق' : 'Blue'],
        ['purple', '#8B5CF6', ar ? 'بنفسجي' : 'Purple'],
        ['rose', '#E0527A', ar ? 'وردي' : 'Rose'],
    ];

    return <div className="h-full">
        <div className="drh"><b>{ar ? 'التفاصيل' : 'Details'}</b><button type="button" className="ghost" onClick={onClose}>{ar ? 'إغلاق' : 'Close'}</button></div>
        <div className="dh">
            {settings?.avatar_url
                ? <span className="av big"><img src={settings.avatar_url} alt={conversation.display_name} /></span>
                : <span className={`av big ${avatarTone(conversation.id)}`}>{group ? <Users size={30} /> : conversation.display_name.slice(0, 1)}</span>}
            <h2>{conversation.display_name}</h2>
            <p>{group ? <>{conversation.description || (ar ? 'بدون وصف' : 'No description')}<br />{members.length} {ar ? 'أعضاء' : 'members'}</> : conversation.is_online ? (ar ? 'نشط الآن' : 'Active now') : (ar ? 'محادثة خاصة' : 'Private chat')}</p>
        </div>
        {!mode && error && <p role="alert" className="mx-5 mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
        {success && <p role="status" className="mx-5 mb-3 rounded-xl bg-[var(--ac-accent-soft)] p-3 text-xs text-[var(--ac-accent)]">{success}</p>}
        <div className="qa">
            <button type="button" onClick={onSearch}><span><Search size={19} /></span>{ar ? 'بحث' : 'Search'}</button>
            <button type="button" disabled={!settings || busy} onClick={mute}><span>{settings?.notifications_muted ? <Bell size={19} /> : <BellOff size={19} />}</span>{settings?.notifications_muted ? (ar ? 'إلغاء الكتم' : 'Unmute') : (ar ? 'كتم' : 'Mute')}</button>
            {admin && <button type="button" onClick={() => open('members')}><span><UserPlus size={19} /></span>{ar ? 'إضافة' : 'Add'}</button>}
            {admin && <button type="button" onClick={() => open('name')}><span><Pencil size={19} /></span>{ar ? 'تعديل' : 'Edit'}</button>}
            {!group && other && <MemberActions {...memberProps} memberId={other.id} name={other.name} initialMode="profile" triggerClassName=""><span><Users size={19} /></span>{ar ? 'الملف' : 'Profile'}</MemberActions>}
        </div>
        {group && <details className="sec" open>
            <summary>{ar ? 'الأعضاء' : 'Members'}</summary>
            <div className="in">
                {thread.can_manage && <button type="button" className="rowbtn" onClick={() => open('members')}><UserPlus />{ar ? 'إضافة أو إدارة الأعضاء' : 'Add or manage members'}</button>}
                {members.map((person) => <div key={person.id} className="mrow">
                    <MemberActions {...memberProps} memberId={person.id} name={person.name} triggerClassName={`av ${avatarTone(person.id)}`}>{person.name.slice(0, 1)}</MemberActions>
                    <div><b>{settings?.nicknames[person.id] || person.name}</b><small>{person.id === userId ? (ar ? 'هذا أنت' : 'You') : person.is_online ? (ar ? 'متصل الآن' : 'Online') : ''}</small></div>
                    {(person.is_admin || person.id === conversation.created_by) && <em>{ar ? 'مشرف' : 'Admin'}</em>}
                    {person.id !== userId && <button type="button" className="ghost" onClick={() => onMessage(person.id)} aria-label={`${ar ? 'مراسلة' : 'Message'} ${person.name}`}><MessageCircle size={15} /></button>}
                </div>)}
            </div>
        </details>}
        <details className="sec">
            <summary>{ar ? 'الوسائط والملفات والروابط' : 'Media, files and links'}</summary>
            <div className="in">
                <div className="tabs">
                    {(['media', 'files', 'links'] as const).map((kind) => <button key={kind} type="button" aria-pressed={libKind === kind} onClick={() => { setLibKind(kind); setPage(1); }}>{labels[kind]}</button>)}
                </div>
                {!library && !error && <p role="status" className="lbl">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
                {library && library.data.length === 0 && <p className="lbl">{ar ? 'لا توجد عناصر مشتركة هنا بعد.' : 'No shared items yet.'}</p>}
                {library && library.data.length > 0 && (libKind === 'media'
                    ? <div className="media">{library.data.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer">{item.kind === 'image' ? <img src={item.url} alt={item.name ?? ''} /> : <span className="flex size-full items-center justify-center"><File size={20} /></span>}</a>)}</div>
                    : libKind === 'files'
                        ? <div className="flist">{library.data.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer"><File size={16} />{item.name}</a>)}</div>
                        : <div className="flist">{library.data.flatMap((item) => (item.body?.match(/https?:\/\/[^\s<>]+/g) ?? []).map((url, index) => <a key={`${item.id}-${index}`} href={url} target="_blank" rel="noreferrer">{url}</a>))}</div>)}
                {library && library.last_page > 1 && <div className="mt-3 flex items-center justify-between text-sm">
                    <button type="button" className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{ar ? 'السابق' : 'Previous'}</button>
                    <span className="lbl">{page} / {library.last_page}</span>
                    <button type="button" className="ghost" disabled={page >= library.last_page} onClick={() => setPage(page + 1)}>{ar ? 'التالي' : 'Next'}</button>
                </div>}
            </div>
        </details>
        <details className="sec" open>
            <summary>{ar ? 'تخصيص المحادثة' : 'Customize chat'}</summary>
            <div className="in">
                <p className="lbl">{ar ? 'لون المحادثة' : 'Chat color'}</p>
                <div className="sw">{themeChoices.map(([key, color, name]) => <button key={key} type="button" title={name} aria-label={name} aria-pressed={(settings?.theme ?? 'green') === key} disabled={busy} style={{ background: color }} onClick={() => void save('theme', { value: key })} />)}</div>
                <p className="lbl">{ar ? 'رمز التفاعل السريع' : 'Quick reaction'}</p>
                <div className="em">{emojiChoices.map((emoji) => <button key={emoji} type="button" aria-pressed={settings?.quick_reaction === emoji} disabled={busy} onClick={() => void save('emoji', { value: emoji })}>{emoji}</button>)}</div>
                {admin && <button type="button" className="rowbtn" disabled={busy} onClick={() => upload.current?.click()}><Image />{ar ? 'تغيير الصورة' : 'Change photo'}</button>}
                <input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) { void save('avatar', {}, file); } event.target.value = ''; }} />
                <button type="button" className="rowbtn" onClick={() => open('nickname')}><Type />{labels.nickname}</button>
            </div>
        </details>
        <details className="sec" open={new URLSearchParams(window.location.search).has('reports') || undefined}>
            <summary>{ar ? 'الخصوصية والدعم' : 'Privacy and support'}</summary>
            <div className="in">
                <button type="button" role="switch" aria-checked={Boolean(settings?.notifications_muted)} className="swt" disabled={!settings || busy} onClick={mute}>{ar ? 'كتم الإشعارات' : 'Mute notifications'}<i /></button>
                {deviceNotifications && <>
                    <button type="button" role="switch" aria-checked={deviceNotifications.enabled} className="swt" disabled={deviceNotifications.enabled} onClick={deviceNotifications.enable}>{ar ? 'إشعارات الجهاز' : 'Device notifications'}<i /></button>
                    {deviceNotifications.hint && <p role="status" className="lbl">{deviceNotifications.hint}</p>}
                </>}
                <button type="button" role="switch" aria-checked={settings?.read_receipts ?? true} className="swt" disabled={!settings || busy} onClick={() => void save('receipts', { enabled: !settings?.read_receipts })}>{ar ? 'مؤشرات قراءة الرسائل' : 'Read receipts'}<i /></button>
                <button type="button" className="rowbtn" onClick={() => open('pins')}><Pin />{labels.pins}<span className="ms-auto text-xs">{settings?.pins.length ?? 0}</span></button>
                {!group && other && <MemberActions {...memberProps} memberId={other.id} name={other.name} initialMode="direct" triggerClassName="rowbtn"><ShieldCheck />{ar ? 'منع الرسائل الخاصة' : 'Block private messages'}</MemberActions>}
                {group && !admin && <button type="button" className="rowbtn" onClick={() => open('report')}><Flag />{labels.report}</button>}
                {admin && <button type="button" className="rowbtn" onClick={() => open('reports')}><Flag />{labels.reports}<span className="ms-auto text-xs">{settings?.reports.length ?? 0}</span></button>}
                <button type="button" className="rowbtn" onClick={onArchive}><Archive />{ar ? 'أرشفة المحادثة' : 'Archive conversation'}</button>
                {group && <button type="button" className="rowbtn danger" onClick={() => open('leave')}><LogOut />{labels.leave}</button>}
            </div>
        </details>
        {mode && <MessagingDialog title={labels[mode]} onClose={() => { if (!busy) { setMode(null); } }}>
            {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {mode === 'members' && memberEditor}
            {(mode === 'name' || mode === 'report' || mode === 'nickname') && <form onSubmit={(event) => { event.preventDefault(); void save(mode, mode === 'name' ? { name: value } : mode === 'report' ? { reason: value } : { user_id: personId, nickname: value || null }); }} className="space-y-4">
                {mode === 'nickname' && <label className="block text-sm">{ar ? 'العضو' : 'Member'}<select value={personId} onChange={(event) => { setPersonId(Number(event.target.value)); setValue(settings?.nicknames[event.target.value] ?? ''); }} className={inputClass}>{thread.members.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
                <label className="block text-sm">{mode === 'report' ? (ar ? 'سبب البلاغ (سيظهر لأدمن المجموعة)' : 'Reason (visible to the group admin)') : mode === 'nickname' ? (ar ? 'اللقب — اتركه فارغًا لإزالته' : 'Nickname — leave empty to remove') : (ar ? 'اسم الدردشة' : 'Chat name')}<textarea required={mode !== 'nickname'} minLength={mode === 'report' ? 5 : undefined} maxLength={mode === 'report' ? 2000 : mode === 'name' ? 120 : 80} rows={mode === 'report' ? 4 : 2} value={value} onChange={(event) => setValue(event.target.value)} className={inputClass} /></label><button disabled={busy} className={buttonClass}>{ar ? 'حفظ' : 'Save'}</button>
            </form>}
            {mode === 'theme' && <div className="grid grid-cols-4 gap-2">{Object.entries(chatThemes).filter(([key]) => key !== 'dark').map(([key, theme], index) => <button key={key} type="button" aria-pressed={settings?.theme === key} disabled={busy} onClick={() => void save('theme', { value: key })} className="flex flex-col items-center gap-2 text-xs"><span style={{ background: theme.bubble }} className={`size-11 rounded-full border-2 ${settings?.theme === key ? 'border-[var(--ac-accent)]' : 'border-[var(--ac-surface)] shadow'}`} />{(ar ? ['افتراضي', 'أزرق', 'بنفسجي', 'وردي', 'داكن'] : ['Default', 'Blue', 'Purple', 'Rose', 'Dark'])[index]}</button>)}</div>}
            {mode === 'emoji' && <div className="grid grid-cols-3 gap-3">{emojiChoices.map((emoji) => <button type="button" key={emoji} disabled={busy} onClick={() => void save('emoji', { value: emoji })} aria-pressed={settings?.quick_reaction === emoji} className="rounded-xl bg-[var(--ac-surface-soft)] p-4 text-3xl hover:bg-[var(--ac-accent-soft)]">{emoji}</button>)}</div>}
            {mode === 'notifications' && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); saveMute(); }}><p className="text-sm">{ar ? 'يوقف التنبيهات لهذه المحادثة فقط؛ تبقى الرسائل متاحة.' : 'Silences alerts for this chat only. Messages remain available.'}</p><label className="block text-sm">{ar ? 'المدة' : 'Duration'}<select className={inputClass} value={duration} onChange={(event) => setDuration(event.target.value)}><option value="60">{ar ? 'ساعة' : 'One hour'}</option><option value="480">{ar ? '8 ساعات' : '8 hours'}</option><option value="1440">{ar ? 'يوم' : 'One day'}</option><option value="custom">{ar ? 'موعد محدد' : 'Custom time'}</option><option value="forever">{ar ? 'حتى ألغي الكتم' : 'Until I unmute'}</option></select></label>{duration === 'custom' && <input type="datetime-local" aria-label={ar ? 'حتى' : 'Until'} value={until} required onChange={(event) => setUntil(event.target.value)} className={inputClass} />}<button disabled={busy} className={buttonClass}>{ar ? 'كتم الإشعارات' : 'Mute notifications'}</button></form>}
            {mode === 'leave' && <div className="space-y-4"><p className="text-sm leading-6">{ar ? 'لن تتمكن من فتح المجموعة أو إرسال الرسائل بعد مغادرتها، إلا إذا تمت إضافتك مجددًا.' : 'You cannot open or message this group after leaving unless added again.'}</p>{admin && <p className="rounded-xl bg-amber-50 p-3 text-sm">{ar ? 'ستنتقل إدارة المجموعة تلقائيًا إلى أحد الأعضاء المتبقين.' : 'Administration transfers to a remaining member.'}</p>}<button type="button" disabled={busy} onClick={() => void save('leave')} className="rounded-xl bg-red-600 px-4 py-2 text-white">{labels.leave}</button></div>}
            {mode === 'pins' && <div className="space-y-3">{settings?.pins.length ? settings.pins.map((pin) => <div key={pin.id} className="rounded-xl bg-[var(--ac-surface-soft)] p-3"><strong className="text-xs">{pin.name}</strong><p className="my-2 whitespace-pre-wrap break-words text-sm">{pin.body || (ar ? 'رسالة تحتوي على مرفق' : 'Message with attachment')}</p><button type="button" disabled={busy} onClick={() => void save('pin', { message_id: pin.id, pinned: false })} className="text-xs text-red-600">{ar ? 'إلغاء التثبيت' : 'Unpin'}</button></div>) : <p className="text-sm">{ar ? 'لا توجد رسائل مثبتة. ثبّت رسالة من قائمة خياراتها.' : 'No pinned messages. Pin a message from its menu.'}</p>}</div>}
            {mode === 'reports' && <div className="space-y-3">{settings?.reports.length ? settings.reports.map((report) => <div key={report.id} className="rounded-xl bg-[var(--ac-surface-soft)] p-3"><strong className="text-sm">{report.name}</strong><p className="mt-2 whitespace-pre-wrap break-words text-sm">{report.reason}</p><time className="mt-2 block text-xs text-[var(--ac-text-muted)]">{new Date(report.created_at).toLocaleString(ar ? 'ar' : 'en')}</time></div>) : <p className="text-sm">{ar ? 'لا توجد بلاغات.' : 'No reports.'}</p>}</div>}
        </MessagingDialog>}
    </div>;
}
