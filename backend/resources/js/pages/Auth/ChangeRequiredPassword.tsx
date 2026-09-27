import { ApiError, apiRequest } from '@/lib/http';
import { Head } from '@inertiajs/react';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';

type Props = {
    expiresAt: string | null;
};

export default function ChangeRequiredPassword({ expiresAt }: Props) {
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    async function submit(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await apiRequest('/api/security/change-required-password', {
                method: 'POST',
                body: JSON.stringify({
                    password,
                    password_confirmation: confirmation,
                }),
            });
            window.location.assign('/app');
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : 'تعذر تغيير كلمة المرور.');
        } finally {
            setBusy(false);
        }
    }

    async function sendRecovery() {
        setBusy(true);
        setError('');
        try {
            const response = await apiRequest<{ message: string }>('/api/security/send-recovery-link', { method: 'POST' });
            setMessage(response.message || 'تم إرسال رابط الاسترداد إلى بريدك الإلكتروني.');
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : 'تعذر إرسال رابط الاسترداد.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <main dir="rtl" className="grid min-h-screen place-items-center bg-[#071b2c] p-4 text-white">
            <Head title="إنشاء كلمة مرور جديدة | AccoNova" />
            <section className="w-full max-w-xl rounded-3xl border border-sky-800/70 bg-[#0a2740] p-6 shadow-2xl sm:p-8">
                <div className="flex items-start gap-4">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-sky-500/15 text-sky-300"><ShieldCheck /></span>
                    <div>
                        <h1 className="text-2xl font-black">أنشئ كلمة مرورك الجديدة</h1>
                        <p className="mt-2 text-sm leading-6 text-slate-300">تم تسجيل الدخول بكلمة مؤقتة. لحماية الحساب لن تستطيع متابعة استخدام AccoNova قبل إنشاء كلمة مرور دائمة خاصة بك.</p>
                    </div>
                </div>

                {expiresAt && <p className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">صلاحية كلمة المرور المؤقتة حتى: {new Date(expiresAt).toLocaleString()}</p>}
                {error && <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
                {message && <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">{message}</p>}

                <form className="mt-6 space-y-4" onSubmit={submit}>
                    <label className="block text-sm font-bold">كلمة المرور الجديدة
                        <input type="password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-sky-800 bg-[#061d30] px-4 py-3 outline-none focus:border-sky-400" autoComplete="new-password" />
                    </label>
                    <label className="block text-sm font-bold">تأكيد كلمة المرور
                        <input type="password" minLength={12} required value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-sky-800 bg-[#061d30] px-4 py-3 outline-none focus:border-sky-400" autoComplete="new-password" />
                    </label>
                    <p className="text-xs leading-6 text-slate-400">استخدم 12 حرفًا على الأقل مع أحرف كبيرة وصغيرة وأرقام ورمز.</p>
                    <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 font-black text-white hover:bg-sky-400 disabled:opacity-50"><KeyRound size={17} />حفظ ومتابعة</button>
                </form>

                <button type="button" disabled={busy} onClick={() => void sendRecovery()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-sky-700 px-4 py-3 text-sm font-bold text-sky-200 hover:bg-white/5 disabled:opacity-50"><Mail size={16} />أرسل رابط استرداد آمن إلى بريدي بدلًا من ذلك</button>
            </section>
        </main>
    );
}
