<?php

namespace App\Http\Controllers\Mcp;

use App\Http\Controllers\Controller;
use App\Services\Mcp\McpCapabilityCatalog;
use App\Services\Mcp\McpExecutor;
use App\Services\Mcp\McpTokenService;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

final class McpProtocolController extends Controller
{
    public function __invoke(
        Request $request,
        McpExecutor $executor,
        McpTokenService $tokens,
        TenantContext $context,
    ): JsonResponse {
        $payload = $request->validate([
            'jsonrpc' => ['required', 'in:2.0'],
            'id' => ['nullable'],
            'method' => ['required', 'string', 'max:120'],
            'params' => ['nullable', 'array'],
        ]);

        $id = $payload['id'] ?? null;
        $params = $payload['params'] ?? [];

        try {
            $visibleToolNames = $this->visibleToolNames($request, $tokens, $context);

            $result = match ($payload['method']) {
                'initialize' => $this->initialize(),
                'ping' => (object) [],
                'tools/list' => $this->tools($request, $tokens, $context),
                'tools/call' => $this->callTool($params, $request, $executor),
                'resources/list' => $this->resources($visibleToolNames),
                'resources/read' => $this->readResource($params, $request, $executor, $tokens, $context, $visibleToolNames),
                'prompts/list' => $this->prompts($visibleToolNames),
                'prompts/get' => $this->getPrompt($params, $visibleToolNames),
                default => throw new \RuntimeException('METHOD_NOT_FOUND'),
            };

            return response()->json(['jsonrpc' => '2.0', 'id' => $id, 'result' => $result]);
        } catch (HttpExceptionInterface $exception) {
            $rpcCode = match ($exception->getStatusCode()) {
                401 => -32001,
                403 => -32003,
                404 => -32004,
                422 => -32602,
                429 => -32029,
                default => -32603,
            };

            return $this->error($id, $rpcCode, $exception->getMessage() ?: 'MCP request failed.');
        } catch (\RuntimeException $exception) {
            if ($exception->getMessage() === 'METHOD_NOT_FOUND') {
                return $this->error($id, -32601, 'Method not found.');
            }

            return $this->error($id, -32603, 'Internal MCP error.');
        } catch (\Throwable $exception) {
            return $this->error($id, -32603, $exception->getMessage() ?: 'MCP request failed.');
        }
    }

    private function initialize(): array
    {
        return [
            'protocolVersion' => '2025-06-18',
            'capabilities' => [
                'tools' => ['listChanged' => true],
                'resources' => ['subscribe' => false, 'listChanged' => true],
                'prompts' => ['listChanged' => true],
            ],
            'serverInfo' => ['name' => 'AccoNova MCP', 'version' => '1.0.0'],
            'instructions' => 'Use AccoNova tools only within the authenticated workspace and the scopes granted to this MCP token.',
        ];
    }

    private function tools(Request $request, McpTokenService $tokens, TenantContext $context): array
    {
        $token = $request->attributes->get('mcp_token');
        $enabledCapabilities = $this->enabledCapabilities($context);

        $builtIn = collect(McpCapabilityCatalog::tools())
            ->filter(fn (array $tool): bool => $this->canDiscoverBuiltInTool(
                $tool,
                $request,
                $tokens,
                $token,
                $enabledCapabilities,
            ))
            ->map(fn (array $tool) => [
                'name' => $tool['tool'],
                'title' => $tool['title_en'],
                'description' => $tool['description'],
                'inputSchema' => $tool['inputSchema'],
                'annotations' => [
                    'readOnlyHint' => $tool['mode'] === 'read',
                    'destructiveHint' => false,
                    'idempotentHint' => $tool['mode'] === 'read',
                    'openWorldHint' => false,
                ],
            ]);

        $custom = DB::table('mcp_custom_tools')
            ->where('organization_id', $context->id())
            ->where('enabled', true)
            ->get()
            ->filter(function ($tool) use ($tokens, $token): bool {
                $scope = 'custom.'.$tool->slug;

                if ($token && ! $tokens->canUse($token, $scope)) {
                    return false;
                }

                return ($token->mode ?? 'read') !== 'read'
                    || strtoupper((string) $tool->http_method) === 'GET';
            })
            ->map(fn ($tool) => [
                'name' => 'custom.'.$tool->slug,
                'title' => $tool->name,
                'description' => $tool->description ?: 'Custom AccoNova MCP tool',
                'inputSchema' => $tool->input_schema ? (json_decode($tool->input_schema, true) ?: ['type' => 'object']) : ['type' => 'object'],
                'annotations' => [
                    'readOnlyHint' => strtoupper((string) $tool->http_method) === 'GET',
                    'destructiveHint' => false,
                    'idempotentHint' => strtoupper((string) $tool->http_method) === 'GET',
                    'openWorldHint' => true,
                ],
            ]);

        return ['tools' => $builtIn->concat($custom)->values()->all()];
    }

    private function callTool(array $params, Request $request, McpExecutor $executor): array
    {
        $name = trim((string) ($params['name'] ?? ''));
        if ($name === '') {
            throw new HttpException(422, 'Tool name is required.');
        }

        $result = $executor->execute(
            $name,
            is_array($params['arguments'] ?? null) ? $params['arguments'] : [],
            $request->user(),
            $request->attributes->get('mcp_token'),
        );

        return [
            'content' => [[
                'type' => 'text',
                'text' => json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT),
            ]],
            'structuredContent' => $result,
            'isError' => false,
        ];
    }

    /** @param list<string> $visibleToolNames */
    private function resources(array $visibleToolNames): array
    {
        $resources = [
            [
                'uri' => 'acconova://capabilities',
                'name' => 'MCP capabilities',
                'description' => 'Capabilities available to this MCP token.',
                'mimeType' => 'application/json',
            ],
            [
                'uri' => 'acconova://usage',
                'name' => 'MCP token usage',
                'description' => 'Recent MCP usage for the current token only.',
                'mimeType' => 'application/json',
            ],
        ];

        if (in_array('business.ceo_snapshot', $visibleToolNames, true)) {
            array_unshift($resources, [
                'uri' => 'acconova://workspace/summary',
                'name' => 'Workspace summary',
                'description' => 'Current AccoNova workspace executive summary.',
                'mimeType' => 'application/json',
            ]);
        }

        return ['resources' => $resources];
    }

    /** @param list<string> $visibleToolNames */
    private function readResource(
        array $params,
        Request $request,
        McpExecutor $executor,
        McpTokenService $tokens,
        TenantContext $context,
        array $visibleToolNames,
    ): array {
        $uri = (string) ($params['uri'] ?? '');
        $token = $request->attributes->get('mcp_token');

        $data = match ($uri) {
            'acconova://workspace/summary' => $this->readWorkspaceSummary($visibleToolNames, $request, $executor),
            'acconova://capabilities' => [
                'tools' => $this->tools($request, $tokens, $context)['tools'],
            ],
            'acconova://usage' => [
                'calls_30d' => DB::table('mcp_audit_logs')
                    ->where('organization_id', $context->id())
                    ->where('mcp_access_token_id', $token->id)
                    ->where('created_at', '>=', now()->subDays(30))
                    ->count(),
                'errors_30d' => DB::table('mcp_audit_logs')
                    ->where('organization_id', $context->id())
                    ->where('mcp_access_token_id', $token->id)
                    ->where('created_at', '>=', now()->subDays(30))
                    ->where('status', 'error')
                    ->count(),
                'cost_units_30d' => (int) DB::table('mcp_audit_logs')
                    ->where('organization_id', $context->id())
                    ->where('mcp_access_token_id', $token->id)
                    ->where('created_at', '>=', now()->subDays(30))
                    ->sum('cost_units'),
            ],
            default => throw new HttpException(404, 'Unknown resource URI.'),
        };

        return ['contents' => [[
            'uri' => $uri,
            'mimeType' => 'application/json',
            'text' => json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT),
        ]]];
    }

    /** @param list<string> $visibleToolNames */
    private function readWorkspaceSummary(array $visibleToolNames, Request $request, McpExecutor $executor): array
    {
        if (! in_array('business.ceo_snapshot', $visibleToolNames, true)) {
            throw new HttpException(403, 'This MCP token cannot read the workspace summary.');
        }

        return $executor->execute(
            'business.ceo_snapshot',
            [],
            $request->user(),
            $request->attributes->get('mcp_token'),
        );
    }

    /** @param list<string> $visibleToolNames */
    private function prompts(array $visibleToolNames): array
    {
        $definitions = [
            'morning-brief' => [
                'tool' => 'business.morning_brief',
                'description' => 'Summarize what needs attention in the business today.',
            ],
            'ceo-snapshot' => [
                'tool' => 'business.ceo_snapshot',
                'description' => 'Create an executive snapshot of the current business.',
            ],
            'collections-review' => [
                'tool' => 'collections.queue',
                'description' => 'Review overdue receivables and recommend collection priorities.',
            ],
        ];

        return ['prompts' => collect($definitions)
            ->filter(fn (array $prompt): bool => in_array($prompt['tool'], $visibleToolNames, true))
            ->map(fn (array $prompt, string $name): array => [
                'name' => $name,
                'description' => $prompt['description'],
            ])
            ->values()
            ->all()];
    }

    /** @param list<string> $visibleToolNames */
    private function getPrompt(array $params, array $visibleToolNames): array
    {
        $name = (string) ($params['name'] ?? '');
        $definition = match ($name) {
            'morning-brief' => [
                'tool' => 'business.morning_brief',
                'text' => 'Use business.morning_brief and summarize only the items that need action today. Prioritize cash, overdue customers, stock risks, approvals, and due tasks.',
            ],
            'ceo-snapshot' => [
                'tool' => 'business.ceo_snapshot',
                'text' => 'Use business.ceo_snapshot and explain the company position concisely, highlighting material risks, changes, and the next three management actions.',
            ],
            'collections-review' => [
                'tool' => 'collections.queue',
                'text' => 'Use collections.queue, rank overdue customers by balance and age, then recommend the next collection action for each high-priority account.',
            ],
            default => throw new HttpException(404, 'Unknown prompt.'),
        };

        if (! in_array($definition['tool'], $visibleToolNames, true)) {
            throw new HttpException(403, 'This MCP token cannot use the requested prompt.');
        }

        return ['description' => $name, 'messages' => [[
            'role' => 'user',
            'content' => ['type' => 'text', 'text' => $definition['text']],
        ]]];
    }

    /** @return list<string> */
    private function visibleToolNames(Request $request, McpTokenService $tokens, TenantContext $context): array
    {
        $token = $request->attributes->get('mcp_token');
        $enabledCapabilities = $this->enabledCapabilities($context);

        $builtIn = collect(McpCapabilityCatalog::tools())
            ->filter(fn (array $tool): bool => $this->canDiscoverBuiltInTool(
                $tool,
                $request,
                $tokens,
                $token,
                $enabledCapabilities,
            ))
            ->pluck('tool')
            ->filter()
            ->values();

        $custom = DB::table('mcp_custom_tools')
            ->where('organization_id', $context->id())
            ->where('enabled', true)
            ->get()
            ->filter(function ($tool) use ($tokens, $token): bool {
                $scope = 'custom.'.$tool->slug;

                if ($token && ! $tokens->canUse($token, $scope)) {
                    return false;
                }

                return ($token->mode ?? 'read') !== 'read'
                    || strtoupper((string) $tool->http_method) === 'GET';
            })
            ->map(fn ($tool): string => 'custom.'.$tool->slug);

        return $builtIn->concat($custom)->values()->all();
    }

    /** @param list<string>|null $enabledCapabilities */
    private function canDiscoverBuiltInTool(
        array $tool,
        Request $request,
        McpTokenService $tokens,
        ?object $token,
        ?array $enabledCapabilities,
    ): bool {
        $user = $request->user();
        if (! $user || ! WorkspaceFeaturePermissions::allows($user, 'ai.business_data.use')) {
            return false;
        }

        $permission = $tool['permission'] ?? null;
        if (
            $permission
            && in_array($permission, WorkspaceFeaturePermissions::keys(), true)
            && ! WorkspaceFeaturePermissions::allows($user, $permission)
        ) {
            return false;
        }

        if (
            $token
            && ! $tokens->canUse($token, (string) $tool['tool'])
            && ! $tokens->canUse($token, (string) $tool['id'])
        ) {
            return false;
        }

        if (($token->mode ?? 'read') === 'read' && ($tool['mode'] ?? 'read') === 'write') {
            return false;
        }

        if (
            $enabledCapabilities !== null
            && ! in_array('*', $enabledCapabilities, true)
            && ! in_array((string) $tool['tool'], $enabledCapabilities, true)
        ) {
            return false;
        }

        return true;
    }

    /** @return list<string>|null */
    private function enabledCapabilities(TenantContext $context): ?array
    {
        $settings = DB::table('mcp_workspace_settings')
            ->where('organization_id', $context->id())
            ->first();

        if (! $settings || ! $settings->enabled_capabilities) {
            return null;
        }

        return array_values(array_filter(
            json_decode((string) $settings->enabled_capabilities, true) ?: [],
            'is_string',
        ));
    }

    private function error(mixed $id, int $code, string $message): JsonResponse
    {
        return response()->json([
            'jsonrpc' => '2.0',
            'id' => $id,
            'error' => ['code' => $code, 'message' => $message],
        ]);
    }
}
