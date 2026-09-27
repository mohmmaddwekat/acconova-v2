import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head } from '@inertiajs/react';
import {
    Activity,
    Bot,
    Check,
    Clipboard,
    Code2,
    KeyRound,
    LoaderCircle,
    Network,
    Play,
    Plus,
    RefreshCw,
    Save,
    ShieldCheck,
    Trash2,
    Workflow,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

type Capability = {
    id: string;
    tool: string | null;
    kind: 'tool' | 'platform';
    title_ar: string;
    title_en: string;
    description: string;
    category: string;
    mode: 'read' | 'write' | 'control';
    approval_required: boolean;
};

type TokenRow = {
    id: number;
    name: string;
    kind: 'agent' | 'partner';
    token_prefix: string;
    mode: 'read' | 'write' | 'approve';
    scopes: string[];
    daily_call_limit: number | null;
    monthly_call_limit: number | null;
    expires_at: string | null;
    last_used_at: string | null;
    revoked_at: string | null;
    created_at: string;
};

type ApprovalRow = {
    id: number;
    capability: string;
    status: string;
    input: Record<string, unknown> | null;
    created_at: string;
};

type ConnectionRow = {
    id: number;
    name: string;
    provider: string;
    endpoint_url: string;
    scopes: string[] | null;
    status: string;
};

type CustomToolRow = {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    endpoint_url: string;
    http_method: string;
    approval_required: boolean;
    enabled: boolean;
};

type WorkflowRow = {
    id: number;
    name: string;
    trigger_type: string;
    trigger_config: Record<string, unknown> | null;
    steps: Array<{ tool: string; arguments?: Record<string, unknown> }>;
    enabled: boolean;
    last_run_at: string | null;
};

type Settings = {
    enabled: boolean;
    allow_partner_tokens: boolean;
    require_approval_for_financial_writes: boolean;
    daily_call_limit: number | null;
    monthly_call_limit: number | null;
    enabled_capabilities: string[] | null;
};

type DashboardResponse = {
    endpoint: string;
    capabilities: Capability[];
    settings: Settings;
    tokens: TokenRow[];
    approvals: ApprovalRow[];
    connections: ConnectionRow[];
    custom_tools: CustomToolRow[];
    workflows: WorkflowRow[];
    usage: {
        calls_30d: number;
        errors_30d: number;
        cost_units_30d: number;
        by_tool: Array<{ capability: string; calls: number; errors: number }>;
    };
    recent_logs: Array<{
        id: number;
        capability: string;
        status: string;
        duration_ms: number;
        created_at: string;
    }>;
    can_admin: boolean;
};

type Tab =
    | 'overview'
    | 'capabilities'
    | 'keys'
    | 'approvals'
    | 'connections'
    | 'builder'
    | 'workflows'
    | 'sandbox'
    | 'audit'
    | 'settings';

const tabs: Array<{ key: Tab; ar: string; en: string }> = [
    { key: 'overview', ar: 'نظرة عامة', en: 'Overview' },
    { key: 'capabilities', ar: '40 ميزة', en: '40 Capabilities' },
    { key: 'keys', ar: 'المفاتيح', en: 'Keys' },
    { key: 'approvals', ar: 'الموافقات', en: 'Approvals' },
    { key: 'connections', ar: 'الاتصالات', en: 'Connections' },
    { key: 'builder', ar: 'Tool Builder', en: 'Tool Builder' },
    { key: 'workflows', ar: 'Workflows', en: 'Workflows' },
    { key: 'sandbox', ar: 'Sandbox', en: 'Sandbox' },
    { key: 'audit', ar: 'الاستخدام والتدقيق', en: 'Usage & Audit' },
    { key: 'settings', ar: 'الإعدادات', en: 'Settings' },
];

const buttonClass =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--ac-line)] bg-transparent px-3 py-2 text-sm font-semibold text-[var(--ac-text)] transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-button-hover-bg)] disabled:cursor-not-allowed disabled:opacity-45';
const primaryButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500 bg-sky-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-45';
const inputClass =
    'w-full rounded-xl border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 py-2 text-sm text-[var(--ac-text)] outline-none transition placeholder:text-[var(--ac-text-muted)] focus:border-sky-500';
const cardClass =
    'rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-sm';

function messageFor(error: unknown, ar: boolean): string {
    if (error instanceof ApiError) return error.message;
    return ar ? 'حدث خطأ غير متوقع.' : 'Something went wrong.';
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function McpHub() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const [tab, setTab] = useState<Tab>('overview');
    const [data, setData] = useState<DashboardResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [revealedToken, setRevealedToken] = useState('');

    const [tokenName, setTokenName] = useState('AccoNova Agent');
    const [tokenKind, setTokenKind] = useState<'agent' | 'partner'>('agent');
    const [tokenMode, setTokenMode] = useState<'read' | 'write' | 'approve'>('read');
    const [tokenExpiry, setTokenExpiry] = useState('');
    const [tokenScopes, setTokenScopes] = useState<string[]>(['*']);

    const [connectionName, setConnectionName] = useState('');
    const [connectionProvider, setConnectionProvider] = useState('custom');
    const [connectionUrl, setConnectionUrl] = useState('');
    const [connectionSecret, setConnectionSecret] = useState('');

    const [toolName, setToolName] = useState('');
    const [toolSlug, setToolSlug] = useState('');
    const [toolUrl, setToolUrl] = useState('');
    const [toolMethod, setToolMethod] = useState('POST');

    const [workflowName, setWorkflowName] = useState('');
    const [workflowTool, setWorkflowTool] = useState('business.morning_brief');
    const [sandboxTool, setSandboxTool] = useState('business.ceo_snapshot');
    const [sandboxArgs, setSandboxArgs] = useState('{}');
    const [sandboxResult, setSandboxResult] = useState('');

    const toolCapabilities = useMemo(
        () => data?.capabilities.filter(item => item.kind === 'tool' && item.tool) ?? [],
        [data],
    );

    async function load() {
        setLoading(true);
        setError('');
        try {
            setData(await apiRequest<DashboardResponse>('/api/mcp/dashboard'));
        } catch (failure) {
            setError(messageFor(failure, ar));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, []);

    async function runAction(action: () => Promise<void>) {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await action();
        } catch (failure) {
            setError(messageFor(failure, ar));
        } finally {
            setBusy(false);
        }
    }

    async function createToken(event: FormEvent) {
        event.preventDefault();
        await runAction(async () => {
            const response = await apiRequest<{ token: string }>('/api/mcp/tokens', {
                method: 'POST',
                body: JSON.stringify({
                    name: tokenName,
                    kind: tokenKind,
                    mode: tokenMode,
                    scopes: tokenScopes.length ? tokenScopes : ['*'],
                    expires_at: tokenExpiry || null,
                }),
            });
            setRevealedToken(response.token);
            setNotice(ar ? 'تم إنشاء المفتاح. انسخه الآن لأنه لن يظهر مرة ثانية.' : 'Key created. Copy it now; it will not be shown again.');
            await load();
        });
    }

    async function revokeToken(id: number) {
        await runAction(async () => {
            await apiRequest(`/api/mcp/tokens/${id}`, { method: 'DELETE' });
            await load();
        });
    }

    async function reviewApproval(id: number, decision: 'approve' | 'reject') {
        await runAction(async () => {
            await apiRequest(`/api/mcp/approvals/${id}/${decision}`, { method: 'POST' });
            await load();
        });
    }

    async function saveConnection(event: FormEvent) {
        event.preventDefault();
        await runAction(async () => {
            await apiRequest('/api/mcp/connections', {
                method: 'POST',
                body: JSON.stringify({
                    name: connectionName,
                    provider: connectionProvider,
                    endpoint_url: connectionUrl,
                    secret: connectionSecret || null,
                    scopes: [],
                    status: 'active',
                }),
            });
            setConnectionName('');
            setConnectionUrl('');
            setConnectionSecret('');
            await load();
        });
    }

    async function saveCustomTool(event: FormEvent) {
        event.preventDefault();
        await runAction(async () => {
            await apiRequest('/api/mcp/custom-tools', {
                method: 'POST',
                body: JSON.stringify({
                    name: toolName,
                    slug: toolSlug,
                    endpoint_url: toolUrl,
                    http_method: toolMethod,
                    input_schema: { type: 'object', properties: {} },
                    headers: {},
                    approval_required: toolMethod !== 'GET',
                    enabled: true,
                }),
            });
            setToolName('');
            setToolSlug('');
            setToolUrl('');
            await load();
        });
    }

    async function saveWorkflow(event: FormEvent) {
        event.preventDefault();
        await runAction(async () => {
            await apiRequest('/api/mcp/workflows', {
                method: 'POST',
                body: JSON.stringify({
                    name: workflowName,
                    trigger_type: 'manual',
                    trigger_config: {},
                    steps: [{ tool: workflowTool, arguments: {} }],
                    enabled: true,
                }),
            });
            setWorkflowName('');
            await load();
        });
    }

    async function runWorkflow(id: number) {
        await runAction(async () => {
            const response = await apiRequest<{ results: unknown[] }>(`/api/mcp/workflows/${id}/run`, { method: 'POST' });
            setNotice(`${ar ? 'تم تشغيل الـWorkflow' : 'Workflow executed'}: ${response.results.length}`);
            await load();
        });
    }

    async function runSandbox(event: FormEvent) {
        event.preventDefault();
        await runAction(async () => {
            let parsed: Record<string, unknown> = {};
            try {
                parsed = JSON.parse(sandboxArgs || '{}') as Record<string, unknown>;
            } catch {
                throw new Error(ar ? 'JSON غير صالح.' : 'Invalid JSON.');
            }
            const response = await apiRequest<unknown>('/api/mcp/sandbox', {
                method: 'POST',
                body: JSON.stringify({ tool: sandboxTool, arguments: parsed }),
            });
            setSandboxResult(JSON.stringify(response, null, 2));
        });
    }

    async function saveSettings() {
        if (!data) return;
        await runAction(async () => {
            await apiRequest('/api/mcp/settings', {
                method: 'PUT',
                body: JSON.stringify(data.settings),
            });
            setNotice(ar ? 'تم حفظ إعدادات MCP.' : 'MCP settings saved.');
            await load();
        });
    }

    function toggleScope(scope: string) {
        setTokenScopes(current => {
            if (scope === '*') return ['*'];
            const withoutAll = current.filter(item => item !== '*');
            return withoutAll.includes(scope)
                ? withoutAll.filter(item => item !== scope)
                : [...withoutAll, scope];
        });
    }

    return (
        <AppShell>
            <Head title={ar ? 'MCP Hub | AccoNova' : 'MCP Hub | AccoNova'} />
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 p-4 md:p-6">
                <section className="overflow-hidden rounded-3xl border border-[var(--ac-line)] bg-[var(--ac-surface)]">
                    <div className="flex flex-col gap-5 bg-[#162235] p-5 text-white md:flex-row md:items-center md:justify-between md:p-7">
                        <div className="flex items-start gap-4">
                            <div className="rounded-2xl border border-white/15 bg-white/10 p-3"><Network className="h-7 w-7" /></div>
                            <div>
                                <div className="mb-1 flex flex-wrap items-center gap-2">
                                    <h1 className="text-2xl font-bold">AccoNova MCP Hub</h1>
                                    <span className="rounded-full border border-emerald-400/35 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-200">40 capabilities</span>
                                </div>
                                <p className="max-w-3xl text-sm text-slate-300">
                                    {ar
                                        ? 'اربط وكلاء الذكاء الاصطناعي ببيانات AccoNova بأمان، مع Scopes وصلاحيات وموافقات وتدقيق كامل لكل استدعاء.'
                                        : 'Connect AI agents to AccoNova safely with scopes, permissions, approvals and a complete audit trail.'}
                                </p>
                            </div>
                        </div>
                        <button className={buttonClass + ' border-white/20 text-white hover:bg-white/10'} onClick={() => void load()} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            {ar ? 'تحديث' : 'Refresh'}
                        </button>
                    </div>

                    <div className="flex gap-2 overflow-x-auto border-t border-[var(--ac-line)] p-2">
                        {tabs.map(item => (
                            <button
                                key={item.key}
                                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition ${tab === item.key ? 'bg-sky-500 text-white' : 'text-[var(--ac-text-muted)] hover:bg-[var(--ac-button-hover-bg)] hover:text-[var(--ac-text)]'}`}
                                onClick={() => setTab(item.key)}
                            >
                                {ar ? item.ar : item.en}
                            </button>
                        ))}
                    </div>
                </section>

                {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
                {notice && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">{notice}</div>}

                {loading && !data ? (
                    <div className="flex min-h-[340px] items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-sky-500" /></div>
                ) : data ? (
                    <>
                        {tab === 'overview' && (
                            <div className="grid gap-4 lg:grid-cols-4">
                                <Stat icon={Bot} label={ar ? 'الأدوات الفعلية' : 'Executable tools'} value={toolCapabilities.length} />
                                <Stat icon={Activity} label={ar ? 'استدعاءات 30 يوم' : 'Calls / 30d'} value={data.usage.calls_30d} />
                                <Stat icon={ShieldCheck} label={ar ? 'موافقات معلقة' : 'Pending approvals'} value={data.approvals.filter(item => item.status === 'pending').length} />
                                <Stat icon={KeyRound} label={ar ? 'مفاتيح فعالة' : 'Active keys'} value={data.tokens.filter(item => !item.revoked_at).length} />

                                <section className={`${cardClass} lg:col-span-2`}>
                                    <h2 className="mb-3 text-base font-bold text-[var(--ac-text)]">{ar ? 'MCP Endpoint' : 'MCP Endpoint'}</h2>
                                    <div className="flex gap-2">
                                        <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-[var(--ac-bg)] px-3 py-2 text-xs text-[var(--ac-text)]">{data.endpoint}</code>
                                        <button className={buttonClass} onClick={() => void navigator.clipboard.writeText(data.endpoint)}><Clipboard className="h-4 w-4" /></button>
                                    </div>
                                    <p className="mt-3 text-xs text-[var(--ac-text-muted)]">
                                        {ar ? 'استخدم Bearer Token من قسم المفاتيح. كل مفتاح مربوط بـWorkspace واحد.' : 'Use a Bearer Token from Keys. Every key is locked to one workspace.'}
                                    </p>
                                </section>

                                <section className={`${cardClass} lg:col-span-2`}>
                                    <h2 className="mb-3 text-base font-bold text-[var(--ac-text)]">{ar ? 'حالة الحماية' : 'Protection status'}</h2>
                                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                                        <Status ok={data.settings.enabled} text={ar ? 'MCP مفعّل' : 'MCP enabled'} />
                                        <Status ok={data.settings.require_approval_for_financial_writes} text={ar ? 'موافقة للكتابة المالية' : 'Financial write approval'} />
                                        <Status ok text={ar ? 'Workspace isolation' : 'Workspace isolation'} />
                                        <Status ok text={ar ? 'Audit لكل استدعاء' : 'Audit every call'} />
                                    </div>
                                </section>
                            </div>
                        )}

                        {tab === 'capabilities' && (
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {data.capabilities.map((capability, index) => (
                                    <article key={capability.id} className={cardClass}>
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sm font-bold text-sky-500">{index + 1}</span>
                                                <div>
                                                    <h3 className="font-bold text-[var(--ac-text)]">{ar ? capability.title_ar : capability.title_en}</h3>
                                                    <p className="text-xs text-[var(--ac-text-muted)]">{capability.category}</p>
                                                </div>
                                            </div>
                                            <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${capability.mode === 'write' ? 'bg-amber-500/10 text-amber-500' : capability.mode === 'read' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-sky-500/10 text-sky-500'}`}>{capability.mode}</span>
                                        </div>
                                        <p className="text-sm leading-6 text-[var(--ac-text-muted)]">{capability.description}</p>
                                        {capability.tool && <code className="mt-3 block rounded-lg bg-[var(--ac-bg)] px-2 py-1 text-xs text-[var(--ac-text)]">{capability.tool}</code>}
                                    </article>
                                ))}
                            </div>
                        )}

                        {tab === 'keys' && (
                            <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
                                <form className={cardClass} onSubmit={createToken}>
                                    <h2 className="mb-4 flex items-center gap-2 font-bold text-[var(--ac-text)]"><KeyRound className="h-5 w-5 text-sky-500" />{ar ? 'إنشاء MCP Key' : 'Create MCP Key'}</h2>
                                    <div className="space-y-3">
                                        <input className={inputClass} value={tokenName} onChange={e => setTokenName(e.target.value)} placeholder={ar ? 'اسم المفتاح' : 'Key name'} required />
                                        <div className="grid grid-cols-2 gap-2">
                                            <select className={inputClass} value={tokenKind} onChange={e => setTokenKind(e.target.value as 'agent' | 'partner')}><option value="agent">Agent</option><option value="partner">Partner</option></select>
                                            <select className={inputClass} value={tokenMode} onChange={e => setTokenMode(e.target.value as 'read' | 'write' | 'approve')}><option value="read">Read</option><option value="write">Write</option><option value="approve">Approve</option></select>
                                        </div>
                                        <input className={inputClass} type="datetime-local" value={tokenExpiry} onChange={e => setTokenExpiry(e.target.value)} />
                                        <div>
                                            <p className="mb-2 text-xs font-semibold text-[var(--ac-text-muted)]">Scopes</p>
                                            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-[var(--ac-line)] p-2">
                                                <label className="flex items-center gap-2 p-1 text-sm text-[var(--ac-text)]"><input type="checkbox" checked={tokenScopes.includes('*')} onChange={() => toggleScope('*')} /> * ({ar ? 'كل الأدوات' : 'all tools'})</label>
                                                {toolCapabilities.map(capability => (
                                                    <label key={capability.id} className="flex items-center gap-2 p-1 text-xs text-[var(--ac-text-muted)]"><input type="checkbox" checked={tokenScopes.includes(capability.tool!)} onChange={() => toggleScope(capability.tool!)} />{capability.tool}</label>
                                                ))}
                                            </div>
                                        </div>
                                        <button className={primaryButtonClass} disabled={busy || !data.can_admin}><Plus className="h-4 w-4" />{ar ? 'إنشاء المفتاح' : 'Create key'}</button>
                                    </div>
                                    {!data.can_admin && <p className="mt-3 text-xs text-amber-500">{ar ? 'تحتاج صلاحية إدارة إعدادات AI.' : 'AI admin permission is required.'}</p>}
                                </form>

                                <section className={cardClass}>
                                    {revealedToken && (
                                        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                                            <div className="mb-2 flex items-center justify-between gap-2"><strong className="text-sm text-amber-500">{ar ? 'انسخ الآن — يظهر مرة واحدة' : 'Copy now — shown once'}</strong><button className={buttonClass} onClick={() => void navigator.clipboard.writeText(revealedToken)}><Clipboard className="h-4 w-4" /></button></div>
                                            <code className="break-all text-xs text-[var(--ac-text)]">{revealedToken}</code>
                                        </div>
                                    )}
                                    <div className="space-y-3">
                                        {data.tokens.map(token => (
                                            <div key={token.id} className="rounded-xl border border-[var(--ac-line)] p-3">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div><div className="font-semibold text-[var(--ac-text)]">{token.name}</div><code className="text-xs text-[var(--ac-text-muted)]">{token.token_prefix}••••••</code></div>
                                                    <div className="flex items-center gap-2"><span className="rounded-full bg-sky-500/10 px-2 py-1 text-xs text-sky-500">{token.mode}</span>{token.revoked_at ? <span className="text-xs text-red-400">revoked</span> : data.can_admin && <button className={buttonClass} onClick={() => void revokeToken(token.id)}><Trash2 className="h-4 w-4" /></button>}</div>
                                                </div>
                                                <div className="mt-2 grid gap-1 text-xs text-[var(--ac-text-muted)] sm:grid-cols-3"><span>{token.kind}</span><span>{ar ? 'آخر استخدام' : 'Last used'}: {formatDate(token.last_used_at)}</span><span>{ar ? 'ينتهي' : 'Expires'}: {formatDate(token.expires_at)}</span></div>
                                            </div>
                                        ))}
                                        {data.tokens.length === 0 && <Empty ar={ar} />}
                                    </div>
                                </section>
                            </div>
                        )}

                        {tab === 'approvals' && (
                            <section className={cardClass}>
                                <div className="space-y-3">
                                    {data.approvals.map(approval => (
                                        <div key={approval.id} className="rounded-xl border border-[var(--ac-line)] p-3">
                                            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                                                <div><div className="font-semibold text-[var(--ac-text)]">{approval.capability}</div><div className="text-xs text-[var(--ac-text-muted)]">#{approval.id} · {formatDate(approval.created_at)}</div></div>
                                                <div className="flex gap-2"><span className="rounded-full bg-sky-500/10 px-2 py-2 text-xs text-sky-500">{approval.status}</span>{approval.status === 'pending' && data.can_admin && <><button className={primaryButtonClass} onClick={() => void reviewApproval(approval.id, 'approve')}><Check className="h-4 w-4" />{ar ? 'موافقة' : 'Approve'}</button><button className={buttonClass} onClick={() => void reviewApproval(approval.id, 'reject')}><X className="h-4 w-4" />{ar ? 'رفض' : 'Reject'}</button></>}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {data.approvals.length === 0 && <Empty ar={ar} />}
                                </div>
                            </section>
                        )}

                        {tab === 'connections' && (
                            <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
                                <form className={cardClass} onSubmit={saveConnection}>
                                    <h2 className="mb-4 font-bold text-[var(--ac-text)]">{ar ? 'إضافة MCP Server خارجي' : 'Add external MCP server'}</h2>
                                    <div className="space-y-3"><input className={inputClass} value={connectionName} onChange={e => setConnectionName(e.target.value)} placeholder={ar ? 'الاسم' : 'Name'} required /><input className={inputClass} value={connectionProvider} onChange={e => setConnectionProvider(e.target.value)} placeholder="Provider" required /><input className={inputClass} type="url" value={connectionUrl} onChange={e => setConnectionUrl(e.target.value)} placeholder="https://..." required /><input className={inputClass} type="password" value={connectionSecret} onChange={e => setConnectionSecret(e.target.value)} placeholder={ar ? 'Secret اختياري' : 'Optional secret'} /><button className={primaryButtonClass} disabled={busy || !data.can_admin}><Plus className="h-4 w-4" />{ar ? 'إضافة الاتصال' : 'Add connection'}</button></div>
                                </form>
                                <section className={cardClass}><div className="space-y-3">{data.connections.map(connection => <div key={connection.id} className="rounded-xl border border-[var(--ac-line)] p-3"><div className="font-semibold text-[var(--ac-text)]">{connection.name}</div><div className="mt-1 text-xs text-[var(--ac-text-muted)]">{connection.provider} · {connection.status}</div><code className="mt-2 block overflow-x-auto text-xs text-[var(--ac-text-muted)]">{connection.endpoint_url}</code></div>)}{data.connections.length === 0 && <Empty ar={ar} />}</div></section>
                            </div>
                        )}

                        {tab === 'builder' && (
                            <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
                                <form className={cardClass} onSubmit={saveCustomTool}>
                                    <h2 className="mb-4 flex items-center gap-2 font-bold text-[var(--ac-text)]"><Code2 className="h-5 w-5 text-sky-500" />Custom MCP Builder</h2>
                                    <div className="space-y-3"><input className={inputClass} value={toolName} onChange={e => setToolName(e.target.value)} placeholder={ar ? 'اسم الأداة' : 'Tool name'} required /><input className={inputClass} value={toolSlug} onChange={e => setToolSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '-'))} placeholder="crm.lookup" required /><input className={inputClass} type="url" value={toolUrl} onChange={e => setToolUrl(e.target.value)} placeholder="https://api.example.com/tool" required /><select className={inputClass} value={toolMethod} onChange={e => setToolMethod(e.target.value)}><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select><button className={primaryButtonClass} disabled={busy || !data.can_admin}><Plus className="h-4 w-4" />{ar ? 'إنشاء Tool' : 'Create tool'}</button></div>
                                </form>
                                <section className={cardClass}><div className="space-y-3">{data.custom_tools.map(tool => <div key={tool.id} className="rounded-xl border border-[var(--ac-line)] p-3"><div className="flex items-center justify-between gap-3"><div><div className="font-semibold text-[var(--ac-text)]">{tool.name}</div><code className="text-xs text-sky-500">custom.{tool.slug}</code></div><span className="rounded-full bg-[var(--ac-bg)] px-2 py-1 text-xs text-[var(--ac-text-muted)]">{tool.http_method}</span></div><div className="mt-2 text-xs text-[var(--ac-text-muted)]">{tool.endpoint_url}</div></div>)}{data.custom_tools.length === 0 && <Empty ar={ar} />}</div></section>
                            </div>
                        )}

                        {tab === 'workflows' && (
                            <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
                                <form className={cardClass} onSubmit={saveWorkflow}>
                                    <h2 className="mb-4 flex items-center gap-2 font-bold text-[var(--ac-text)]"><Workflow className="h-5 w-5 text-sky-500" />{ar ? 'Workflow جديد' : 'New workflow'}</h2>
                                    <div className="space-y-3"><input className={inputClass} value={workflowName} onChange={e => setWorkflowName(e.target.value)} placeholder={ar ? 'اسم الـWorkflow' : 'Workflow name'} required /><select className={inputClass} value={workflowTool} onChange={e => setWorkflowTool(e.target.value)}>{toolCapabilities.map(capability => <option key={capability.id} value={capability.tool!}>{ar ? capability.title_ar : capability.title_en}</option>)}</select><button className={primaryButtonClass} disabled={busy || !data.can_admin}><Plus className="h-4 w-4" />{ar ? 'إنشاء' : 'Create'}</button></div>
                                </form>
                                <section className={cardClass}><div className="space-y-3">{data.workflows.map(workflow => <div key={workflow.id} className="flex flex-col justify-between gap-3 rounded-xl border border-[var(--ac-line)] p-3 md:flex-row md:items-center"><div><div className="font-semibold text-[var(--ac-text)]">{workflow.name}</div><div className="text-xs text-[var(--ac-text-muted)]">{workflow.steps.length} steps · {workflow.trigger_type} · {formatDate(workflow.last_run_at)}</div></div><button className={buttonClass} onClick={() => void runWorkflow(workflow.id)} disabled={busy}><Play className="h-4 w-4" />{ar ? 'تشغيل' : 'Run'}</button></div>)}{data.workflows.length === 0 && <Empty ar={ar} />}</div></section>
                            </div>
                        )}

                        {tab === 'sandbox' && (
                            <form className={cardClass} onSubmit={runSandbox}>
                                <div className="grid gap-4 lg:grid-cols-2">
                                    <div><h2 className="mb-3 font-bold text-[var(--ac-text)]">MCP Sandbox</h2><select className={inputClass} value={sandboxTool} onChange={e => setSandboxTool(e.target.value)}>{toolCapabilities.map(capability => <option key={capability.id} value={capability.tool!}>{capability.tool}</option>)}</select><textarea className={`${inputClass} mt-3 min-h-56 font-mono text-xs`} value={sandboxArgs} onChange={e => setSandboxArgs(e.target.value)} /><button className={`${primaryButtonClass} mt-3`} disabled={busy}><Play className="h-4 w-4" />{ar ? 'تجربة بأمان' : 'Safe test'}</button><p className="mt-2 text-xs text-[var(--ac-text-muted)]">{ar ? 'عمليات الكتابة لا تُنفذ داخل Sandbox؛ يظهر فقط ما كان سيتم تنفيذه.' : 'Write operations are never committed in Sandbox; it only shows what would run.'}</p></div>
                                    <pre className="min-h-80 overflow-auto rounded-2xl bg-[#0b1220] p-4 text-xs leading-6 text-slate-200">{sandboxResult || (ar ? 'النتيجة ستظهر هنا…' : 'Result will appear here…')}</pre>
                                </div>
                            </form>
                        )}

                        {tab === 'audit' && (
                            <div className="grid gap-4 xl:grid-cols-[1fr_1.5fr]">
                                <section className={cardClass}><h2 className="mb-3 font-bold text-[var(--ac-text)]">{ar ? 'أكثر الأدوات استخدامًا' : 'Top tools'}</h2><div className="space-y-2">{data.usage.by_tool.map(row => <div key={row.capability} className="flex items-center justify-between rounded-xl border border-[var(--ac-line)] p-3 text-sm"><code className="text-[var(--ac-text)]">{row.capability}</code><span className="text-[var(--ac-text-muted)]">{row.calls} calls · {row.errors} errors</span></div>)}</div></section>
                                <section className={cardClass}><h2 className="mb-3 font-bold text-[var(--ac-text)]">{ar ? 'آخر الاستدعاءات' : 'Recent calls'}</h2><div className="max-h-[560px] space-y-2 overflow-y-auto">{data.recent_logs.map(log => <div key={log.id} className="grid gap-2 rounded-xl border border-[var(--ac-line)] p-3 text-xs md:grid-cols-[1fr_auto_auto_auto]"><code className="text-[var(--ac-text)]">{log.capability}</code><span className={log.status === 'error' ? 'text-red-400' : 'text-emerald-500'}>{log.status}</span><span className="text-[var(--ac-text-muted)]">{log.duration_ms} ms</span><span className="text-[var(--ac-text-muted)]">{formatDate(log.created_at)}</span></div>)}</div></section>
                            </div>
                        )}

                        {tab === 'settings' && (
                            <section className={`${cardClass} max-w-3xl`}>
                                <h2 className="mb-4 font-bold text-[var(--ac-text)]">{ar ? 'إعدادات MCP للـWorkspace' : 'Workspace MCP settings'}</h2>
                                <div className="space-y-4">
                                    <SettingToggle label={ar ? 'تفعيل MCP' : 'Enable MCP'} checked={data.settings.enabled} onChange={value => setData({ ...data, settings: { ...data.settings, enabled: value } })} />
                                    <SettingToggle label={ar ? 'السماح بمفاتيح الشركاء' : 'Allow partner keys'} checked={data.settings.allow_partner_tokens} onChange={value => setData({ ...data, settings: { ...data.settings, allow_partner_tokens: value } })} />
                                    <SettingToggle label={ar ? 'الموافقة مطلوبة للكتابات المالية' : 'Require approval for financial writes'} checked={data.settings.require_approval_for_financial_writes} onChange={value => setData({ ...data, settings: { ...data.settings, require_approval_for_financial_writes: value } })} />
                                    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-[var(--ac-text-muted)]">{ar ? 'حد يومي' : 'Daily limit'}<input className={`${inputClass} mt-1`} type="number" min="1" value={data.settings.daily_call_limit ?? ''} onChange={e => setData({ ...data, settings: { ...data.settings, daily_call_limit: e.target.value ? Number(e.target.value) : null } })} /></label><label className="text-sm text-[var(--ac-text-muted)]">{ar ? 'حد شهري' : 'Monthly limit'}<input className={`${inputClass} mt-1`} type="number" min="1" value={data.settings.monthly_call_limit ?? ''} onChange={e => setData({ ...data, settings: { ...data.settings, monthly_call_limit: e.target.value ? Number(e.target.value) : null } })} /></label></div>
                                    <button className={primaryButtonClass} onClick={() => void saveSettings()} disabled={busy || !data.can_admin}><Save className="h-4 w-4" />{ar ? 'حفظ الإعدادات' : 'Save settings'}</button>
                                </div>
                            </section>
                        )}
                    </>
                ) : null}
            </div>
        </AppShell>
    );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Bot; label: string; value: number }) {
    return <div className={cardClass}><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500"><Icon className="h-5 w-5" /></div><div className="text-2xl font-bold text-[var(--ac-text)]">{value}</div><div className="text-xs text-[var(--ac-text-muted)]">{label}</div></div>;
}

function Status({ ok, text }: { ok: boolean; text: string }) {
    return <div className="flex items-center gap-2 rounded-xl border border-[var(--ac-line)] p-2 text-[var(--ac-text)]">{ok ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-red-400" />}{text}</div>;
}

function Empty({ ar }: { ar: boolean }) {
    return <div className="rounded-xl border border-dashed border-[var(--ac-line)] p-6 text-center text-sm text-[var(--ac-text-muted)]">{ar ? 'لا توجد بيانات بعد.' : 'No data yet.'}</div>;
}

function SettingToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
    return <label className="flex items-center justify-between gap-4 rounded-xl border border-[var(--ac-line)] p-3 text-sm font-semibold text-[var(--ac-text)]"><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-5 w-5" /></label>;
}
