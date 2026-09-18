import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BellOff, Bell, Search, X, ChevronDown, Pin, Pencil, Image, Palette, Smile, Type, Users, File, Link2, ShieldCheck, Flag, LogOut, MessageCircle, CheckCheck, Archive } from 'lucide-react';
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
const rowClass = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-[13px] transition hover:bg-[var(--ac-surface-soft)] disabled:opacity-40';
const inputClass = 'mt-2 w-full rounded-xl border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 text-sm outline-none focus:border-[var(--ac-accent)]';
const buttonClass = 'rounded-xl bg-[var(--ac-accent-strong)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40';
const emojiChoices = ['👍', '❤️', '😂', '🎉', '😮', '😢'];
export const chatThemes: Record<string, { background: string; bubble: string; other: string; text: string; surface: string; soft: string; line: string; muted: string; accent: string; accentText: string }> = {
    green: { background: '#f5fbf8', bubble: '#dcf5eb', other: '#edf5f0', text: '#172b25', surface: '#fcfffd', soft: '#eaf6ef', line: '#d4e8dc', muted: '#597568', accent: '#176b4d', accentText: '#176b4d' },
    blue: { background: '#f0f6ff', bubble: '#cfe2ff', other: '#e6effc', text: '#172c4e', surface: '#f8fbff', soft: '#e4efff', line: '#cbdcf3', muted: '#536f94', accent: '#245eae', accentText: '#245eae' },
    purple: { background: '#f8f1ff', bubble: '#e9d5ff', other: '#f0e5fa', text: '#36214f', surface: '#fdf9ff', soft: '#f0e3fb', line: '#e2ccef', muted: '#79608f', accent: '#7940a3', accentText: '#7940a3' },
    rose: { background: '#fff1f5', bubble: '#ffdce6', other: '#fce7ed', text: '#4d2630', surface: '#fff9fb', soft: '#fde5ed', line: '#efccd8', muted: '#926170', accent: '#ad3e64', accentText: '#ad3e64' },
    dark: { background: '#191c1b', bubble: '#285849', other: '#343a37', text: '#f1f6f3', surface: '#242a27', soft: '#313b35', line: '#44534b', muted: '#b2c5ba', accent: '#287458', accentText: '#94e0bd' },
};

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
    return <details open={open || undefined} className="group/section border-b border-[var(--ac-line)] py-1">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">{title}<ChevronDown size={15} className="transition group-open/section:rotate-180" /></summary>
        <div className="pb-3">{children}</div>
    </details>;
}

export function ConversationDetails({ conversation, thread, settings, ar, userId, memberEditor, onClose, onSearch, onDirect, onMessage, onChanged, onLeave, onArchive }: {
    conversation: Conversation; thread: ThreadResponse; settings: ConversationSettings | null; ar: boolean; userId: number; memberEditor: ReactNode;
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
        if (mode !== 'media' && mode !== 'files' && mode !== 'links') { return; }
        const controller = new AbortController(); setLibrary(null);
        apiRequest<{ data: LibraryItem[]; last_page: number }>(`/api/team-space/${conversation.id}/library?kind=${mode}&page=${page}`, { signal: controller.signal }).then(setLibrary)
            .catch(() => { if (!controller.signal.aborted) { setError(ar ? 'تعذر تحميل العناصر.' : 'Unable to load items.'); } });
        return () => controller.abort();
    }, [mode, page, conversation.id, ar]);
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
    return <div className="h-full overflow-y-auto overscroll-contain px-3 pb-5">
        <div className="relative px-2 pb-6 pt-6 text-center">
            <button type="button" onClick={onClose} aria-label={ar ? 'إغلاق التفاصيل' : 'Close details'} className="absolute end-0 top-3 rounded-full p-2 hover:bg-[var(--ac-surface-soft)]"><X size={18} /></button>
            {settings?.avatar_url ? <img src={settings.avatar_url} alt={conversation.display_name} className="mx-auto size-20 rounded-full object-cover" /> : <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-[var(--ac-accent-soft)] text-[var(--chat-accent-text,var(--ac-accent-strong))]">{group ? <Users size={32} /> : <span className="text-2xl">{conversation.display_name.slice(0, 2)}</span>}</div>}
            <h2 className="mt-3 break-words text-lg font-semibold">{conversation.display_name}</h2>
            <p className="mt-1 text-xs text-[var(--ac-text-muted)]">{group ? `${thread.members.length} ${ar ? 'أعضاء' : 'members'}` : conversation.is_online ? (ar ? 'نشط الآن' : 'Active now') : (ar ? 'محادثة خاصة' : 'Private chat')}</p>
            <div className="mt-5 flex justify-center gap-6">
                <button type="button" onClick={onSearch} className="flex flex-col items-center gap-2 text-xs"><span className="rounded-full bg-[var(--ac-surface-soft)] p-3"><Search size={19} /></span>{ar ? 'بحث' : 'Search'}</button>
                <button type="button" disabled={!settings || busy} onClick={mute} className="flex max-w-24 flex-col items-center gap-2 text-xs disabled:opacity-40"><span className="rounded-full bg-[var(--ac-surface-soft)] p-3">{settings?.notifications_muted ? <Bell size={19} /> : <BellOff size={19} />}</span>{settings?.notifications_muted ? (ar ? 'إلغاء كتم الإشعارات' : 'Unmute alerts') : (ar ? 'كتم الإشعارات' : 'Mute alerts')}</button>
            </div>
        </div>
        {!mode && error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
        {success && <p role="status" className="mb-3 rounded-xl bg-[var(--ac-accent-soft)] p-3 text-xs text-[var(--chat-accent-text,var(--ac-accent-strong))]">{success}</p>}
        <Section title={ar ? 'معلومات الدردشة' : 'Chat information'}>
            {conversation.description && <p className="px-3 pb-3 text-xs leading-6 text-[var(--ac-text-muted)]">{conversation.description}</p>}
            <button type="button" onClick={() => open('pins')} className={rowClass}><Pin size={17} />{labels.pins}<span className="ms-auto text-xs">{settings?.pins.length ?? 0}</span></button>
            {!group && other && <MemberActions {...memberProps} memberId={other.id} name={other.name} initialMode="profile" triggerClassName={rowClass}><Users size={17} />{ar ? 'عرض الملف الشخصي' : 'View profile'}</MemberActions>}
        </Section>
        <Section title={ar ? 'تخصيص الدردشة' : 'Customize chat'}>
            {admin && <><button type="button" onClick={() => open('name')} className={rowClass}><Pencil size={17} />{labels.name}</button><button type="button" disabled={busy} onClick={() => upload.current?.click()} className={rowClass}><Image size={17} />{ar ? 'تغيير الصورة' : 'Change photo'}</button></>}
            <input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) { void save('avatar', {}, file); } event.target.value = ''; }} />
            <button type="button" onClick={() => open('theme')} className={rowClass}><Palette size={17} />{labels.theme}</button>
            <button type="button" onClick={() => open('emoji')} className={rowClass}><Smile size={17} />{labels.emoji}<span className="ms-auto text-xl">{settings?.quick_reaction}</span></button>
            <button type="button" onClick={() => open('nickname')} className={rowClass}><Type size={17} />{labels.nickname}</button>
        </Section>
        <Section title={ar ? 'أعضاء الدردشة' : 'Chat members'} open>
            {thread.members.map((person) => <div key={person.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-[var(--ac-surface-soft)]">
                <MemberActions {...memberProps} memberId={person.id} name={person.name} triggerClassName="flex min-w-0 flex-1 items-center gap-2 rounded-xl py-1 text-start">
                    <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--ac-accent-soft)] text-xs font-bold text-[var(--chat-accent-text,var(--ac-accent-strong))]">{person.name.slice(0, 2)}{person.is_online && <span className="absolute bottom-0 end-0 size-2.5 rounded-full border-2 border-[var(--ac-surface)] bg-[var(--ac-accent-soft)]0" />}</span>
                    <span className="min-w-0"><span className="block truncate text-xs font-semibold">{settings?.nicknames[person.id] || person.name}</span><span className="block text-[10px] text-[var(--ac-text-muted)]">{person.id === userId ? (ar ? 'هذا أنت' : 'You') : (person.is_admin || person.id === conversation.created_by) && group ? (ar ? 'أدمن المجموعة' : 'Group admin') : (ar ? 'خيارات العضو' : 'Member actions')}</span></span>
                </MemberActions>
                {person.id !== userId && <button type="button" onClick={() => onMessage(person.id)} aria-label={`${ar ? 'مراسلة' : 'Message'} ${person.name}`} className="flex shrink-0 items-center gap-1 rounded-full px-2 py-2 text-[10px] font-semibold text-[var(--chat-accent-text,var(--ac-accent-strong))] hover:bg-[var(--ac-accent-soft)]"><MessageCircle size={15} />{ar ? 'مراسلة' : 'Message'}</button>}
            </div>)}
            {group && thread.can_manage && <button type="button" onClick={() => open('members')} className={rowClass}><Users size={17} />{ar ? 'إضافة أو إدارة الأعضاء' : 'Add or manage members'}</button>}
        </Section>
        <Section title={ar ? 'الوسائط والملفات والروابط' : 'Media, files and links'}>
            <button type="button" onClick={() => open('media')} className={rowClass}><Image size={17} />{labels.media}</button><button type="button" onClick={() => open('files')} className={rowClass}><File size={17} />{labels.files}</button><button type="button" onClick={() => open('links')} className={rowClass}><Link2 size={17} />{labels.links}</button>
        </Section>
        <Section title={ar ? 'الخصوصية والدعم' : 'Privacy and support'} open={new URLSearchParams(window.location.search).has('reports')}>
            <button type="button" disabled={!settings || busy} onClick={mute} className={rowClass}><BellOff size={17} /><span>{labels.notifications}<small className="mt-1 block text-[10px] text-[var(--ac-text-muted)]">{settings?.notifications_muted ? (ar ? 'مكتومة' : 'Muted') : (ar ? 'مفعّلة' : 'Enabled')}</small></span></button>
            <button type="button" role="switch" aria-checked={settings?.read_receipts ?? true} disabled={!settings || busy} onClick={() => void save('receipts', { enabled: !settings?.read_receipts })} className={rowClass}><CheckCheck size={17} /><span>{ar ? 'مؤشرات قراءة الرسائل' : 'Read receipts'}<small className="mt-1 block text-[10px] text-[var(--ac-text-muted)]">{settings?.read_receipts ? (ar ? 'تم التفعيل' : 'Enabled') : (ar ? 'معطلة' : 'Disabled')}</small></span></button>
            {!group && other && <MemberActions {...memberProps} memberId={other.id} name={other.name} initialMode="direct" triggerClassName={rowClass}><ShieldCheck size={17} />{ar ? 'منع الرسائل الخاصة' : 'Block private messages'}</MemberActions>}
            {group && !admin && <button type="button" onClick={() => open('report')} className={rowClass}><Flag size={17} />{labels.report}</button>}
            {admin && <button type="button" onClick={() => open('reports')} className={rowClass}><Flag size={17} />{labels.reports}<span className="ms-auto">{settings?.reports.length ?? 0}</span></button>}
            <button type="button" onClick={onArchive} className={rowClass}><Archive size={17} />{ar ? 'أرشفة المحادثة' : 'Archive conversation'}</button>
            {group && <button type="button" onClick={() => open('leave')} className={`${rowClass} text-red-600`}><LogOut size={17} />{labels.leave}</button>}
        </Section>
        {mode && <MessagingDialog title={labels[mode]} onClose={() => { if (!busy) { setMode(null); } }}>
            {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {mode === 'members' && memberEditor}
            {(mode === 'name' || mode === 'report' || mode === 'nickname') && <form onSubmit={(event) => { event.preventDefault(); void save(mode, mode === 'name' ? { name: value } : mode === 'report' ? { reason: value } : { user_id: personId, nickname: value || null }); }} className="space-y-4">
                {mode === 'nickname' && <label className="block text-sm">{ar ? 'العضو' : 'Member'}<select value={personId} onChange={(event) => { setPersonId(Number(event.target.value)); setValue(settings?.nicknames[event.target.value] ?? ''); }} className={inputClass}>{thread.members.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
                <label className="block text-sm">{mode === 'report' ? (ar ? 'سبب البلاغ (سيظهر لأدمن المجموعة)' : 'Reason (visible to the group admin)') : mode === 'nickname' ? (ar ? 'اللقب — اتركه فارغًا لإزالته' : 'Nickname — leave empty to remove') : (ar ? 'اسم الدردشة' : 'Chat name')}<textarea required={mode !== 'nickname'} minLength={mode === 'report' ? 5 : undefined} maxLength={mode === 'report' ? 2000 : mode === 'name' ? 120 : 80} rows={mode === 'report' ? 4 : 2} value={value} onChange={(event) => setValue(event.target.value)} className={inputClass} /></label><button disabled={busy} className={buttonClass}>{ar ? 'حفظ' : 'Save'}</button>
            </form>}
            {mode === 'theme' && <div className="grid grid-cols-5 gap-2">{Object.entries(chatThemes).map(([key, theme], index) => <button key={key} type="button" aria-pressed={settings?.theme === key} disabled={busy} onClick={() => void save('theme', { value: key })} className="flex flex-col items-center gap-2 text-xs"><span style={{ background: theme.bubble }} className={`size-11 rounded-full border-2 ${settings?.theme === key ? 'border-[var(--ac-accent)]' : 'border-[var(--ac-surface)] shadow'}`} />{(ar ? ['أخضر', 'أزرق', 'بنفسجي', 'وردي', 'داكن'] : ['Green', 'Blue', 'Purple', 'Rose', 'Dark'])[index]}</button>)}</div>}
            {mode === 'emoji' && <div className="grid grid-cols-3 gap-3">{emojiChoices.map((emoji) => <button type="button" key={emoji} disabled={busy} onClick={() => void save('emoji', { value: emoji })} aria-pressed={settings?.quick_reaction === emoji} className="rounded-xl bg-[var(--ac-surface-soft)] p-4 text-3xl hover:bg-[var(--ac-accent-soft)]">{emoji}</button>)}</div>}
            {mode === 'notifications' && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); saveMute(); }}><p className="text-sm">{ar ? 'يوقف التنبيهات لهذه المحادثة فقط؛ تبقى الرسائل متاحة.' : 'Silences alerts for this chat only. Messages remain available.'}</p><label className="block text-sm">{ar ? 'المدة' : 'Duration'}<select className={inputClass} value={duration} onChange={(event) => setDuration(event.target.value)}><option value="60">{ar ? 'ساعة' : 'One hour'}</option><option value="480">{ar ? '8 ساعات' : '8 hours'}</option><option value="1440">{ar ? 'يوم' : 'One day'}</option><option value="custom">{ar ? 'موعد محدد' : 'Custom time'}</option><option value="forever">{ar ? 'حتى ألغي الكتم' : 'Until I unmute'}</option></select></label>{duration === 'custom' && <input type="datetime-local" aria-label={ar ? 'حتى' : 'Until'} value={until} required onChange={(event) => setUntil(event.target.value)} className={inputClass} />}<button disabled={busy} className={buttonClass}>{ar ? 'كتم الإشعارات' : 'Mute notifications'}</button></form>}
            {mode === 'leave' && <div className="space-y-4"><p className="text-sm leading-6">{ar ? 'لن تتمكن من فتح المجموعة أو إرسال الرسائل بعد مغادرتها، إلا إذا تمت إضافتك مجددًا.' : 'You cannot open or message this group after leaving unless added again.'}</p>{admin && <p className="rounded-xl bg-amber-50 p-3 text-sm">{ar ? 'ستنتقل إدارة المجموعة تلقائيًا إلى أحد الأعضاء المتبقين.' : 'Administration transfers to a remaining member.'}</p>}<button type="button" disabled={busy} onClick={() => void save('leave')} className="rounded-xl bg-red-600 px-4 py-2 text-white">{labels.leave}</button></div>}
            {mode === 'pins' && <div className="space-y-3">{settings?.pins.length ? settings.pins.map((pin) => <div key={pin.id} className="rounded-xl bg-[var(--ac-surface-soft)] p-3"><strong className="text-xs">{pin.name}</strong><p className="my-2 whitespace-pre-wrap break-words text-sm">{pin.body || (ar ? 'رسالة تحتوي على مرفق' : 'Message with attachment')}</p><button type="button" disabled={busy} onClick={() => void save('pin', { message_id: pin.id, pinned: false })} className="text-xs text-red-600">{ar ? 'إلغاء التثبيت' : 'Unpin'}</button></div>) : <p className="text-sm">{ar ? 'لا توجد رسائل مثبتة. ثبّت رسالة من قائمة خياراتها.' : 'No pinned messages. Pin a message from its menu.'}</p>}</div>}
            {mode === 'reports' && <div className="space-y-3">{settings?.reports.length ? settings.reports.map((report) => <div key={report.id} className="rounded-xl bg-[var(--ac-surface-soft)] p-3"><strong className="text-sm">{report.name}</strong><p className="mt-2 whitespace-pre-wrap break-words text-sm">{report.reason}</p><time className="mt-2 block text-xs text-[var(--ac-text-muted)]">{new Date(report.created_at).toLocaleString(ar ? 'ar' : 'en')}</time></div>) : <p className="text-sm">{ar ? 'لا توجد بلاغات.' : 'No reports.'}</p>}</div>}
            {(mode === 'media' || mode === 'files' || mode === 'links') && <div>{!library && !error && <p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}{library && <><div className="space-y-3">{library.data.length === 0 && <p className="text-sm">{ar ? 'لا توجد عناصر مشتركة هنا بعد.' : 'No shared items yet.'}</p>}{library.data.map((item) => mode === 'links' ? <div key={item.id}>{(item.body?.match(/https?:\/\/[^\s<>]+/g) ?? []).map((url, index) => <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="mb-2 block break-all rounded-xl bg-[var(--ac-surface-soft)] p-3 text-sm text-[var(--chat-accent-text,var(--ac-accent-strong))]">{url}</a>)}</div> : <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl bg-[var(--ac-surface-soft)] p-3 text-sm">{mode === 'media' && item.kind === 'image' ? <img src={item.url} alt="" className="size-16 rounded-lg object-cover" /> : <File size={20} />}<span className="min-w-0 break-words">{item.name}</span></a>)}</div><div className="mt-4 flex justify-between"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="text-sm disabled:opacity-30">{ar ? 'السابق' : 'Previous'}</button><span className="text-xs">{page} / {library.last_page}</span><button type="button" disabled={page >= library.last_page} onClick={() => setPage(page + 1)} className="text-sm disabled:opacity-30">{ar ? 'التالي' : 'Next'}</button></div></>}</div>}
        </MessagingDialog>}
    </div>;
}
