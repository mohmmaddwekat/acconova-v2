<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Mcp\McpCapabilityCatalog;
use App\Services\Mcp\McpExecutor;
use App\Services\Mcp\McpTokenService;
use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

final class McpManagementController extends Controller
{
    public function page(Request $request): Response
    {
        WorkspaceFeaturePermissions::authorize($request->user(), 'ai.business_data.use');

        return Inertia::render('Mcp/Index', [
            'mcpEndpoint' => url('/mcp'),
        ]);
    }

    public function dashboard(Request $request, TenantContext $context): JsonResponse
    {
        WorkspaceFeaturePermissions::authorize($request->user(), 'ai.business_data.use');
        $orgId = $context->id();
        $settings = DB::table('mcp_workspace_settings')->where('organization_id', $orgId)->first();
        $from30 = now()->subDays(30);

        $callsByTool = DB::table('mcp_audit_logs')
            ->where('organization_id', $orgId)->where('created_at', '>=', $from30)
            ->selectRaw('capability, COUNT(*) as calls, SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as errors', ['error'])
            ->groupBy('capability')->orderByDesc('calls')->limit(20)->get();

        return response()->json([
            'endpoint' => url('/mcp'),
            'capabilities' => McpCapabilityCatalog::all(),
            'settings' => $settings ? $this->decodeRow($settings, ['enabled_capabilities', 'metadata']) : $this->defaultSettings(),
            'tokens' => DB::table('mcp_access_tokens')->where('organization_id', $orgId)->latest()->get()->map(fn ($row) => $this->publicToken($row))->all(),
            'approvals' => DB::table('mcp_approvals')->where('organization_id', $orgId)->latest()->limit(100)->get()->map(fn ($row) => $this->decodeRow($row, ['input']))->all(),
            'connections' => DB::table('mcp_connections')->where('organization_id', $orgId)->latest()->get()->map(fn ($row) => $this->decodeRow($row, ['scopes', 'metadata'], ['secret_encrypted']))->all(),
            'custom_tools' => DB::table('mcp_custom_tools')->where('organization_id', $orgId)->latest()->get()->map(fn ($row) => $this->decodeRow($row, ['input_schema'], ['headers_encrypted']))->all(),
            'workflows' => DB::table('mcp_workflows')->where('organization_id', $orgId)->latest()->get()->map(fn ($row) => $this->decodeRow($row, ['trigger_config', 'steps']))->all(),
            'usage' => [
                'calls_30d' => DB::table('mcp_audit_logs')->where('organization_id', $orgId)->where('created_at', '>=', $from30)->count(),
                'errors_30d' => DB::table('mcp_audit_logs')->where('organization_id', $orgId)->where('created_at', '>=', $from30)->where('status', 'error')->count(),
                'cost_units_30d' => (int) DB::table('mcp_audit_logs')->where('organization_id', $orgId)->where('created_at', '>=', $from30)->sum('cost_units'),
                'by_tool' => $callsByTool,
            ],
            'recent_logs' => DB::table('mcp_audit_logs')->where('organization_id', $orgId)->latest('created_at')->limit(100)->get()->map(fn ($row) => $this->decodeRow($row, ['input', 'output_summary']))->all(),
            'can_admin' => $this->canAdmin($request->user()),
        ]);
    }

    public function updateSettings(Request $request, TenantContext $context): JsonResponse
    {
        $this->authorizeAdmin($request->user());
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'allow_partner_tokens' => ['required', 'boolean'],
            'require_approval_for_financial_writes' => ['required', 'boolean'],
            'daily_call_limit' => ['nullable', 'integer', 'min:1', 'max:10000000'],
            'monthly_call_limit' => ['nullable', 'integer', 'min:1', 'max:100000000'],
            'enabled_capabilities' => ['nullable', 'array', 'max:200'],
            'enabled_capabilities.*' => ['string', 'max:120'],
        ]);

        DB::table('mcp_workspace_settings')->updateOrInsert(
            ['organization_id' => $context->id()],
            [
                'enabled' => $data['enabled'],
                'allow_partner_tokens' => $data['allow_partner_tokens'],
                'require_approval_for_financial_writes' => $data['require_approval_for_financial_writes'],
                'daily_call_limit' => $data['daily_call_limit'] ?? null,
                'monthly_call_limit' => $data['monthly_call_limit'] ?? null,
                'enabled_capabilities' => isset($data['enabled_capabilities']) ? json_encode(array_values(array_unique($data['enabled_capabilities']))) : null,
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );

        return response()->json(['ok' => true]);
    }

    public function createToken(Request $request, TenantContext $context, McpTokenService $tokens): JsonResponse
    {
        $this->authorizeAdmin($request->user());
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'kind' => ['required', Rule::in(['agent', 'partner'])],
            'mode' => ['required', Rule::in(['read', 'write', 'approve'])],
            'scopes' => ['required', 'array', 'min:1', 'max:100'],
            'scopes.*' => ['string', 'max:120'],
            'daily_call_limit' => ['nullable', 'integer', 'min:1', 'max:10000000'],
            'monthly_call_limit' => ['nullable', 'integer', 'min:1', 'max:100000000'],
            'expires_at' => ['nullable', 'date', 'after:now'],
        ]);

        if ($data['kind'] === 'partner') {
            $settings = DB::table('mcp_workspace_settings')->where('organization_id', $context->id())->first();
            if (! $settings || ! (bool) $settings->allow_partner_tokens) {
                throw ValidationException::withMessages(['kind' => ['Enable partner MCP access before creating partner keys.']]);
            }
        }

        $created = $tokens->create($context->id(), $request->user()->id, $data);

        return response()->json([
            'token' => $created['token'],
            'record' => $this->publicToken($created['record']),
            'warning' => 'This token is shown once. Store it securely.',
        ], 201);
    }

    public function revokeToken(Request $request, int $token, TenantContext $context, McpTokenService $tokens): JsonResponse
    {
        $this->authorizeAdmin($request->user());
        abort_unless($tokens->revoke($context->id(), $token), 404);

        return response()->json(['ok' => true]);
    }

    public function approve(Request $request, int $approval, TenantContext $context, McpExecutor $executor): JsonResponse
    {
        $this->authorizeAdmin($request->user());
        $row = DB::table('mcp_approvals')->where('organization_id', $context->id())->where('id', $approval)->where('status', 'pending')->first();
        abort_unless($row, 404);
        if ($row->expires_at && now()->isAfter($row->expires_at)) {
            DB::table('mcp_approvals')->where('id', $row->id)->update(['status' => 'expired', 'updated_at' => now()]);
            throw ValidationException::withMessages(['approval' => ['This approval has expired.']]);
        }

        $token = null;
        if ($row->mcp_access_token_id) {
            $token = DB::table('mcp_access_tokens')->where('organization_id', $context->id())->where('id', $row->mcp_access_token_id)->whereNull('revoked_at')->first();
            if (! $token || ($token->expires_at && now()->isAfter($token->expires_at))) {
                throw ValidationException::withMessages(['approval' => ['The originating MCP key is no longer active.']]);
            }
        }

        $input = json_decode((string) $row->input, true) ?: [];
        $result = $executor->execute($row->capability, $input, $request->user(), $token, false, true);
        DB::table('mcp_approvals')->where('id', $row->id)->update([
            'status' => 'approved', 'reviewed_by' => $request->user()->id, 'review_note' => $request->input('note'), 'reviewed_at' => now(), 'updated_at' => now(),
        ]);

        return response()->json(['ok' => true, 'result' => $result]);
    }

    public function reject(Request $request, int $approval, TenantContext $context): JsonResponse
    {
        $this->authorizeAdmin($request->user());
        $data = $request->validate(['note' => ['nullable', 'string', 'max:1000']]);
        $updated = DB::table('mcp_approvals')->where('organization_id', $context->id())->where('id', $approval)->where('status', 'pending')->update([
            'status' => 'rejected', 'reviewed_by' => $request->user()->id, 'review_note' => $data['note'] ?? null, 'reviewed_at' => now(), 'updated_at' => now(),
        ]);
        abort_unless($updated, 404);

        return response()->json(['ok' => true]);
    }

    public function saveConnection(Request $request, TenantContext $context, ?int $connection = null): JsonResponse
    {
        $this->authorizeAdmin($request->user());
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'provider' => ['required', 'string', 'max:80'],
            'endpoint_url' => ['required', 'url:https', 'max:2000'],
            'secret' => ['nullable', 'string', 'max:8000'],
            'scopes' => ['nullable', 'array', 'max:100'],
            'status' => ['required', Rule::in(['active', 'disabled'])],
        ]);
        $this->rejectLocalUrl($data['endpoint_url']);

        $existing = $connection ? DB::table('mcp_connections')->where('organization_id', $context->id())->where('id', $connection)->first() : null;
        if ($connection) {
            abort_unless($existing, 404);
        }
        $payload = [
            'organization_id' => $context->id(), 'user_id' => $request->user()->id, 'name' => $data['name'], 'provider' => $data['provider'],
            'endpoint_url' => $data['endpoint_url'], 'scopes' => json_encode($data['scopes'] ?? []), 'status' => $data['status'], 'updated_at' => now(),
        ];
        if (array_key_exists('secret', $data) && $data['secret'] !== null && $data['secret'] !== '') {
            $payload['secret_encrypted'] = Crypt::encryptString($data['secret']);
        }
        if ($existing) {
            DB::table('mcp_connections')->where('id', $existing->id)->update($payload);
            $id = $existing->id;
        } else {
            $id = DB::table('mcp_connections')->insertGetId([...$payload, 'created_at' => now()]);
        }

        return response()->json(['ok' => true, 'id' => $id], $existing ? 200 : 201);
    }

    public function deleteConnection(Request $request, int $connection, TenantContext $context): JsonResponse
    {
        $this->authorizeAdmin($request->user());
        abort_unless(DB::table('mcp_connections')->where('organization_id', $context->id())->where('id', $connection)->delete(), 404);

        return response()->json(['ok' => true]);
    }

    public function saveCustomTool(Request $request, TenantContext $context, ?int $tool = null): JsonResponse
    {
        $this->authorizeAdmin($request->user());
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'slug' => ['required', 'regex:/^[a-z][a-z0-9_.-]{1,98}$/'],
            'description' => ['nullable', 'string', 'max:1000'],
            'endpoint_url' => ['required', 'url:https', 'max:2000'],
            'http_method' => ['required', Rule::in(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])],
            'input_schema' => ['nullable', 'array'],
            'headers' => ['nullable', 'array', 'max:30'],
            'headers.*' => ['string', 'max:4000'],
            'approval_required' => ['required', 'boolean'],
            'enabled' => ['required', 'boolean'],
        ]);
        $this->rejectLocalUrl($data['endpoint_url']);

        $existing = $tool ? DB::table('mcp_custom_tools')->where('organization_id', $context->id())->where('id', $tool)->first() : null;
        if ($tool) {
            abort_unless($existing, 404);
        }
        $duplicate = DB::table('mcp_custom_tools')->where('organization_id', $context->id())->where('slug', $data['slug'])->when($existing, fn ($q) => $q->where('id', '!=', $existing->id))->exists();
        if ($duplicate) {
            throw ValidationException::withMessages(['slug' => ['This MCP tool slug already exists.']]);
        }

        $payload = [
            'organization_id' => $context->id(), 'user_id' => $request->user()->id, 'name' => $data['name'], 'slug' => $data['slug'],
            'description' => $data['description'] ?? null, 'endpoint_url' => $data['endpoint_url'], 'http_method' => $data['http_method'],
            'input_schema' => json_encode($data['input_schema'] ?? ['type' => 'object', 'properties' => (object) []]),
            'headers_encrypted' => ! empty($data['headers']) ? Crypt::encryptString(json_encode($data['headers'])) : ($existing->headers_encrypted ?? null),
            'approval_required' => $data['approval_required'], 'enabled' => $data['enabled'], 'updated_at' => now(),
        ];
        if ($existing) {
            DB::table('mcp_custom_tools')->where('id', $existing->id)->update($payload);
            $id = $existing->id;
        } else {
            $id = DB::table('mcp_custom_tools')->insertGetId([...$payload, 'created_at' => now()]);
        }

        return response()->json(['ok' => true, 'id' => $id, 'tool_name' => 'custom.'.$data['slug']], $existing ? 200 : 201);
    }

    public function deleteCustomTool(Request $request, int $tool, TenantContext $context): JsonResponse
    {
        $this->authorizeAdmin($request->user());
        abort_unless(DB::table('mcp_custom_tools')->where('organization_id', $context->id())->where('id', $tool)->delete(), 404);

        return response()->json(['ok' => true]);
    }

    public function saveWorkflow(Request $request, TenantContext $context, ?int $workflow = null): JsonResponse
    {
        $this->authorizeAdmin($request->user());
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'trigger_type' => ['required', Rule::in(['manual', 'schedule', 'webhook', 'event'])],
            'trigger_config' => ['nullable', 'array'],
            'steps' => ['required', 'array', 'min:1', 'max:30'],
            'steps.*.tool' => ['required', 'string', 'max:120'],
            'steps.*.arguments' => ['nullable', 'array'],
            'enabled' => ['required', 'boolean'],
        ]);
        $existing = $workflow ? DB::table('mcp_workflows')->where('organization_id', $context->id())->where('id', $workflow)->first() : null;
        if ($workflow) {
            abort_unless($existing, 404);
        }
        $payload = [
            'organization_id' => $context->id(), 'user_id' => $request->user()->id, 'name' => $data['name'], 'trigger_type' => $data['trigger_type'],
            'trigger_config' => json_encode($data['trigger_config'] ?? []), 'steps' => json_encode($data['steps']), 'enabled' => $data['enabled'], 'updated_at' => now(),
        ];
        if ($existing) {
            DB::table('mcp_workflows')->where('id', $existing->id)->update($payload);
            $id = $existing->id;
        } else {
            $id = DB::table('mcp_workflows')->insertGetId([...$payload, 'created_at' => now()]);
        }

        return response()->json(['ok' => true, 'id' => $id], $existing ? 200 : 201);
    }

    public function deleteWorkflow(Request $request, int $workflow, TenantContext $context): JsonResponse
    {
        $this->authorizeAdmin($request->user());
        abort_unless(DB::table('mcp_workflows')->where('organization_id', $context->id())->where('id', $workflow)->delete(), 404);

        return response()->json(['ok' => true]);
    }

    public function runWorkflow(Request $request, int $workflow, TenantContext $context, McpExecutor $executor): JsonResponse
    {
        WorkspaceFeaturePermissions::authorize($request->user(), 'ai.business_data.use');
        $row = DB::table('mcp_workflows')->where('organization_id', $context->id())->where('id', $workflow)->where('enabled', true)->first();
        abort_unless($row, 404);
        $steps = json_decode((string) $row->steps, true) ?: [];
        $results = [];
        foreach ($steps as $index => $step) {
            $results[] = [
                'step' => $index + 1,
                'tool' => $step['tool'],
                'result' => $executor->execute($step['tool'], is_array($step['arguments'] ?? null) ? $step['arguments'] : [], $request->user()),
            ];
            if (($results[array_key_last($results)]['result']['status'] ?? null) === 'approval_required') {
                break;
            }
        }
        DB::table('mcp_workflows')->where('id', $row->id)->update(['last_run_at' => now(), 'updated_at' => now()]);

        return response()->json(['ok' => true, 'results' => $results]);
    }

    public function sandbox(Request $request, McpExecutor $executor): JsonResponse
    {
        WorkspaceFeaturePermissions::authorize($request->user(), 'ai.business_data.use');
        $data = $request->validate(['tool' => ['required', 'string', 'max:120'], 'arguments' => ['nullable', 'array']]);

        return response()->json($executor->execute($data['tool'], $data['arguments'] ?? [], $request->user(), null, true));
    }

    private function authorizeAdmin(User $user): void
    {
        WorkspaceFeaturePermissions::authorize($user, 'ai.admin.configure');
    }

    private function canAdmin(User $user): bool
    {
        try {
            WorkspaceFeaturePermissions::authorize($user, 'ai.admin.configure');

            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    private function publicToken(object $row): array
    {
        return [
            'id' => $row->id, 'name' => $row->name, 'kind' => $row->kind, 'token_prefix' => $row->token_prefix,
            'mode' => $row->mode, 'scopes' => json_decode((string) ($row->scopes ?? '[]'), true) ?: [],
            'daily_call_limit' => $row->daily_call_limit, 'monthly_call_limit' => $row->monthly_call_limit,
            'expires_at' => $row->expires_at, 'last_used_at' => $row->last_used_at, 'revoked_at' => $row->revoked_at, 'created_at' => $row->created_at,
        ];
    }

    private function defaultSettings(): array
    {
        return [
            'enabled' => true, 'allow_partner_tokens' => false, 'require_approval_for_financial_writes' => true,
            'daily_call_limit' => null, 'monthly_call_limit' => null, 'enabled_capabilities' => null,
        ];
    }

    private function decodeRow(object $row, array $jsonFields, array $hidden = []): array
    {
        $data = (array) $row;
        foreach ($hidden as $field) {
            unset($data[$field]);
        }
        foreach ($jsonFields as $field) {
            $data[$field] = isset($data[$field]) && $data[$field] !== null ? (json_decode((string) $data[$field], true) ?: []) : null;
        }

        return $data;
    }

    private function rejectLocalUrl(string $url): void
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        if ($host === '' || $host === 'localhost' || str_ends_with($host, '.local') || filter_var($host, FILTER_VALIDATE_IP)) {
            throw ValidationException::withMessages(['endpoint_url' => ['Use a public HTTPS hostname. Localhost and IP-literal endpoints are blocked.']]);
        }
    }
}
