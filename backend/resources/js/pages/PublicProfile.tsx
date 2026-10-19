import '../../css/profile-page.css';

import { fetchPublicProfile } from '@/features/profile/api';
import { roleLabel } from '@/features/profile/roles';
import type { PublicProfile } from '@/features/profile/types';
import { createConversation } from '@/features/team-space/api';
import { AppShell } from '@/layouts/AppShell';
import { ApiError } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head, router, usePage } from '@inertiajs/react';
import { Building2, CalendarDays, Lock, Mail, MessageCircle, Phone, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Read-only profile of a workspace colleague. E-mail and phone only appear
 * when their owner chose to show them.
 */
export default function PublicProfilePage() {
    const ar = useLocale() === 'ar';
    const userId = Number(usePage<{ userId: number }>().props.userId);
    const [profile, setProfile] = useState<PublicProfile | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const controller = { cancelled: false };

        setProfile(null);
        setError('');

        fetchPublicProfile(userId)
            .then((data) => { if (! controller.cancelled) { setProfile(data); } })
            .catch((failure) => {
                if (controller.cancelled) { return; }

                setError(failure instanceof ApiError && failure.status === 404
                    ? (ar ? 'هذا الشخص غير موجود في مساحة العمل الحالية.' : 'This person is not in the current workspace.')
                    : (ar ? 'تعذر تحميل الملف الشخصي.' : 'Unable to load the profile.'));
            });

        return () => { controller.cancelled = true; };
    }, [userId, ar]);

    async function message(): Promise<void> {
        if (! profile || busy) { return; }

        setBusy(true);

        try {
            const result = await createConversation({ kind: 'direct', members: [profile.id] });

            router.visit(`/app/team-space?conversation=${result.id}`);
        } catch {
            setError(ar ? 'تعذر فتح المحادثة.' : 'Unable to open the conversation.');
            setBusy(false);
        }
    }

    const formatDate = (value: string | null): string => {
        if (! value) { return '—'; }

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? value
            : new Intl.DateTimeFormat(ar ? 'ar' : 'en', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
    };

    return (
        <AppShell>
            <Head title={profile?.name ?? (ar ? 'الملف الشخصي' : 'Profile')} />

            <main className="pf">
                {error && <p role="alert" className="w" style={{ color: 'var(--ac-danger)' }}>{error}</p>}

                {! profile && ! error && <p role="status" className="empty">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}

                {profile && (
                    <>
                        <section className="idbar">
                            <span className="av" style={{ width: 72, height: 72, fontSize: 26 }}>
                                {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : profile.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('')}
                            </span>

                            <div>
                                <h1>{profile.name}</h1>

                                <p>{[profile.job_title, profile.organization].filter(Boolean).join(' · ')}</p>
                            </div>

                            {profile.is_online && <span className="badge ok"><i className="dot" />{ar ? 'متصل الآن' : 'Online now'}</span>}

                            <span className="sp" />

                            <button type="button" className="btn" disabled={busy} onClick={() => void message()}>
                                <MessageCircle size={16} />

                                {ar ? 'إرسال رسالة' : 'Send message'}
                            </button>
                        </section>

                        <div className="lower">
                            <section className="w">
                                <div className="w-h"><h3>{ar ? 'نبذة' : 'About'}</h3></div>

                                <p className="bio" style={{ marginBottom: 0 }}>{profile.bio || (ar ? 'لم يضف نبذة شخصية بعد.' : 'No bio yet.')}</p>

                                <div className="w-h" style={{ marginTop: 24 }}><h3>{ar ? 'معلومات التواصل' : 'Contact'}</h3></div>

                                <div>
                                    <div className="r">
                                        <span className="ri"><Mail size={18} /></span>

                                        <div>
                                            <small>{ar ? 'البريد الإلكتروني' : 'Email'}</small>

                                            {profile.email
                                                ? <b><bdi dir="ltr">{profile.email}</bdi></b>
                                                : <span className="lock"><Lock size={14} />{ar ? 'مخفي من صاحب الحساب' : 'Hidden by the account owner'}</span>}
                                        </div>
                                    </div>

                                    {(profile.phone || profile.phone_hidden) && (
                                        <div className="r">
                                            <span className="ri"><Phone size={18} /></span>

                                            <div>
                                                <small>{ar ? 'رقم الهاتف' : 'Phone'}</small>

                                                {profile.phone
                                                    ? <b><bdi dir="ltr">{profile.phone}</bdi></b>
                                                    : <span className="lock"><Lock size={14} />{ar ? 'مخفي من صاحب الحساب' : 'Hidden by the account owner'}</span>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="w">
                                <div className="w-h"><h3>{ar ? 'مساحة العمل' : 'Workspace'}</h3></div>

                                <div>
                                    <div className="r"><span className="ri"><Building2 size={18} /></span><div><small>{ar ? 'الشركة' : 'Company'}</small><b>{profile.organization ?? '—'}</b></div></div>

                                    <div className="r"><span className="ri"><UserRound size={18} /></span><div><small>{ar ? 'الدور' : 'Role'}</small><b>{roleLabel(profile.role, ar)}</b></div></div>

                                    <div className="r"><span className="ri"><CalendarDays size={18} /></span><div><small>{ar ? 'عضو منذ' : 'Member since'}</small><b>{formatDate(profile.member_since)}</b></div></div>
                                </div>
                            </section>
                        </div>
                    </>
                )}
            </main>
        </AppShell>
    );
}
