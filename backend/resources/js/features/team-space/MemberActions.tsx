import { createConversation } from './api';
import { apiRequest } from '@/lib/http';
import { MessageCircle, UserRound, VolumeX, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

const actionClass = 'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-start text-sm hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-40';
type Restriction = { expires_at: string | null } | null;
type MemberProfile = { id: number; name: string; job_title: string | null; bio: string | null; avatar_url: string | null; can_mute_group: boolean; group_mute: Restriction; direct_block: Restriction };

export function MessagingDialog({ title, onClose, children, position }: { title: string; onClose: () => void; children: ReactNode; position?: { top: number; left: number } }) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
    return <dialog ref={ref} style={position ? { top: position.top, left: position.left, right: 'auto', bottom: 'auto', margin: 0, width: Math.min(320, window.innerWidth - 24) } : undefined} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { onClose(); } }} className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-[var(--ac-line)] bg-white p-5 text-[var(--ac-text)] shadow-2xl backdrop:bg-black/35">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--ac-line)] pb-4"><h2 id={titleId} className="font-semibold">{title}</h2><button type="button" aria-label="Close / إغلاق" onClick={onClose} className="rounded-full p-2 hover:bg-gray-100"><X size={18} /></button></div>
        {children}
    </dialog>;
}

export function MemberActions({ conversationId, memberId, userId, name, ar, children, onDirect, onChanged }: {
    conversationId: number; memberId: number; userId: number; name: string; ar: boolean; children: ReactNode;
    onDirect: (id: number) => void; onChanged: () => void;
}) {
    const [mode, setMode] = useState<'menu' | 'profile' | 'group' | 'direct' | null>(null);
    const [profile, setProfile] = useState<MemberProfile | null>(null);
    const [duration, setDuration] = useState('60');
    const [until, setUntil] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [position, setPosition] = useState({ top: 16, left: 16 });
    const open = mode !== null;
    useEffect(() => {
        if (!open) { return; }
        const controller = new AbortController();
        setProfile(null); setError('');
        apiRequest<MemberProfile>(`/api/team-space/${conversationId}/people/${memberId}`, { signal: controller.signal })
            .then(setProfile).catch(() => { if (!controller.signal.aborted) { setError(ar ? 'تعذر تحميل بيانات العضو.' : 'Unable to load member.'); } });
        return () => controller.abort();
    }, [open, conversationId, memberId, ar]);

    async function direct(): Promise<void> {
        setBusy(true); setError('');
        try { const result = await createConversation({ kind: 'direct', members: [memberId] }); setMode(null); onDirect(result.id); }
        catch { setError(ar ? 'تعذر فتح المحادثة.' : 'Unable to open conversation.'); }
        finally { setBusy(false); }
    }
    async function save(enabled: boolean): Promise<void> {
        if (mode !== 'group' && mode !== 'direct') { return; }
        let expires: string | null = null;
        if (enabled && duration !== 'forever') {
            const date = duration === 'custom' ? new Date(until) : new Date(Date.now() + Number(duration) * 60000);
            if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) { setError(ar ? 'اختر تاريخًا ووقتًا في المستقبل.' : 'Choose a future date and time.'); return; }
            expires = date.toISOString();
        }
        setBusy(true); setError('');
        try {
            await apiRequest(`/api/team-space/${conversationId}/people/${memberId}/restriction`, { method: 'PUT', body: JSON.stringify({ scope: mode, enabled, expires_at: expires }) });
            onChanged(); setMode(null);
        } catch { setError(ar ? 'تعذر حفظ التغيير. تحقق من الصلاحية والمدة وحاول مجددًا.' : 'Unable to save. Check permission and duration and retry.'); }
        finally { setBusy(false); }
    }
    const active = mode === 'group' ? profile?.group_mute : profile?.direct_block;
    return <>
        <button type="button" aria-label={`${ar ? 'خيارات العضو' : 'Member actions'}: ${name}`} aria-haspopup="dialog" onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setPosition({ top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 340)), left: Math.max(12, Math.min(rect.left, window.innerWidth - 332)) });
            setMode('menu');
        }} className="relative mt-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-100 hover:ring-emerald-400">{children}</button>
        {mode && <MessagingDialog title={name} position={mode === 'menu' ? position : undefined} onClose={() => { if (!busy) { setMode(null); } }}>
            {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {!profile && !error && <p role="status">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
            {profile && mode === 'menu' && <div>
                {memberId !== userId && <button type="button" disabled={busy} onClick={() => void direct()} className={actionClass}><MessageCircle size={18} />{ar ? 'مراسلة' : 'Message'}</button>}
                <button type="button" onClick={() => setMode('profile')} className={actionClass}><UserRound size={18} />{ar ? 'عرض الملف الشخصي' : 'View profile'}</button>
                {profile.can_mute_group && <button type="button" onClick={() => setMode('group')} className={actionClass}><VolumeX size={18} />{ar ? 'كتم الكتابة داخل المجموعة' : 'Mute in this group'}</button>}
                {memberId !== userId && <button type="button" onClick={() => setMode('direct')} className={actionClass}><VolumeX size={18} />{ar ? 'منع مراسلتي على الخاص' : 'Block private messages to me'}</button>}
            </div>}
            {profile && mode === 'profile' && <div className="space-y-3 text-center">
                {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.name} className="mx-auto size-24 rounded-full object-cover" /> : <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-emerald-50 text-3xl">{name.slice(0, 1)}</div>}
                <h3 className="text-lg font-semibold">{profile.name}</h3><p className="text-sm text-[var(--ac-text-muted)]">{profile.job_title}</p><p className="whitespace-pre-wrap text-sm">{profile.bio || (ar ? 'لم يضف نبذة شخصية بعد.' : 'No bio yet.')}</p>
            </div>}
            {profile && (mode === 'group' || mode === 'direct') && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(true); }}>
                <p className="text-sm leading-6">{mode === 'group' ? (ar ? 'لن يتمكن هذا العضو من الكتابة في هذه المجموعة، وسيظهر له اسمك ومدة الكتم.' : 'This member cannot write in this group. They will see who muted them and for how long.') : (ar ? 'لن يتمكن هذا الشخص من إرسال رسائل خاصة لك. لا يؤثر ذلك على رسائله في المجموعات.' : 'This person cannot send you private messages. Group messages are unaffected.')}</p>
                {active && <p className="rounded-xl bg-amber-50 p-3 text-sm">{ar ? 'المنع الحالي: ' : 'Currently blocked: '}{active.expires_at ? new Date(active.expires_at).toLocaleString(ar ? 'ar' : 'en') : (ar ? 'حتى إلغائه' : 'until removed')}</p>}
                <label className="block text-sm">{ar ? 'المدة' : 'Duration'}<select value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-2 w-full rounded-xl border p-3">
                    <option value="60">{ar ? 'ساعة' : 'One hour'}</option><option value="1440">{ar ? 'يوم' : 'One day'}</option><option value="10080">{ar ? 'أسبوع' : 'One week'}</option><option value="custom">{ar ? 'تاريخ ووقت محدد' : 'Custom date and time'}</option><option value="forever">{ar ? 'دائمًا حتى ألغي المنع' : 'Until I remove it'}</option>
                </select></label>
                {duration === 'custom' && <label className="block text-sm">{ar ? 'حتى (بتوقيت جهازك)' : 'Until (your local time)'}<input type="datetime-local" required value={until} onChange={(event) => setUntil(event.target.value)} className="mt-2 w-full rounded-xl border p-3" /></label>}
                <div className="flex gap-2"><button disabled={busy} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-40">{ar ? 'حفظ' : 'Save'}</button>{active && <button type="button" disabled={busy} onClick={() => void save(false)} className="rounded-xl border px-4 py-2 text-sm">{ar ? 'إلغاء المنع' : 'Remove restriction'}</button>}</div>
            </form>}
        </MessagingDialog>}
    </>;
}
