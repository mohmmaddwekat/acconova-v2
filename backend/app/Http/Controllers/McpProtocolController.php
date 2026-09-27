<?php

namespace App\Http\Controllers;

use App\Services\Mcp\McpCapabilityCatalog;
use App\Services\Mcp\McpExecutor;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

final class McpProtocolController extends Controller
{
    public function __invoke(Request $request, McpExecutor $executor, TenantContext $context): JsonResponse
    {
        $payload = $request->validate([
            'jsonrpc' => ['required', 'in:2.0'],
            'id' => ['nullable'],
            'method' => ['required', 'string', 'max:120'],
            'params' => ['nullable', 'array'],
        ]);

        $id = $payload['id'] ?? null;
        $params = $payload['params'] ?? [];

        try {
            $result = match ($payload['method']) {
                'initialize' => $this->initialize(),
                'ping' => (object) [],
                'tools/list' => $this->tools(),
                'tools/call' => $this->callTool($params, $request, $executor),
                'resources/list' => $this->resources(),
                'resources/read' => $this->readResource($params, $request, $executor, $context),
                'prompts/list' => $this->prompts(),
                'prompts/get' => $this->getPrompt($params),
                default => throw new \RuntimeException('METHOD_NOT_FOUND'),
            };

            return response()->json(['jsonrpc' => '2.0', 'id' => $id, 'result' => $result]);
        } catch (\RuntimeException $exception) {
            if ($exception->getMessage() === 'METHOD_NOT_FOUND') {
                return $this->error($id, -32601, 'Method not found.');
            }
            return $this->error($id, -32603, 'Internal MCP error.');
        } catch (\Throwable $exception) {
            $code = $exception instanceof HttpExceptionInterface ? $exception->getStatusCode() : 500;
            $rpcCode = match ($code) {
                401 => -32001,
                403 => -32003,
                404 => -32004,
                422 => -32602,
                429 => -32029,
                default => -32603,
            };
            return $this->error($id, $rpcCode, $exception->getMessage() ?: 'MCP request failed.');
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

    private function tools(): array
    {
        $builtIn = collect(McpCapabilityCatalog::tools())->map(fn (array $tool) => [
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
            ->where('organization_id', app(TenantContext::class)->id())
            ->where('enabled', true)
            ->get()
            ->map(fn ($tool) => [
                'name' => 'custom.'.$tool->slug,
                'title' => $tool->name,
                'description' => $tool->description ?: 'Custom AccoNova MCP tool',
                'inputSchema' => $tool->input_schema ? (json_decode($tool->input_schema, true) ?: ['type' => 'object']) : ['type' => 'object'],
                'annotations' => ['readOnlyHint' => strtoupper($tool->http_method) === 'GET', 'destructiveHint' => false, 'idempotentHint' => strtoupper($tool->http_method) === 'GET', 'openWorldHint' => true],
            ]);

        return ['tools' => $builtIn->concat($custom)->values()->all()];
    }

    private function callTool(array $params, Request $request, McpExecutor $executor): array
    {
        $name = trim((string) ($params['name'] ?? ''));
        if ($name === '') {
            throw new \InvalidArgumentException('Tool name is required.');
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

    private function resources(): array
    {
        return ['resources' => [
            ['uri' => 'acconova://workspace/summary', 'name' => 'Workspace summary', 'description' => 'Current AccoNova workspace executive summary.', 'mimeType' => 'application/json'],
            ['uri' => 'acconova://capabilities', 'name' => 'MCP capabilities', 'description' => 'Available built-in and platform MCP capabilities.', 'mimeType' => 'application/json'],
            ['uri' => 'acconova://usage', 'name' => 'MCP usage', 'description' => 'Recent MCP usage for the current workspace.', 'mimeType' => 'application/json'],
        ]];
    }

    private function readResource(array $params, Request $request, McpExecutor $executor, TenantContext $context): array
    {
        $uri = (string) ($params['uri'] ?? '');
        $data = match ($uri) {
            'acconova://workspace/summary' => $executor->execute('business.ceo_snapshot', [], $request->user(), $request->attributes->get('mcp_token')),
            'acconova://capabilities' => ['capabilities' => McpCapabilityCatalog::all()],
            'acconova://usage' => [
                'calls_30d' => DB::table('mcp_audit_logs')->where('organization_id', $context->id())->where('created_at', '>=', now()->subDays(30))->count(),
                'errors_30d' => DB::table('mcp_audit_logs')->where('organization_id', $context->id())->where('created_at', '>=', now()->subDays(30))->where('status', 'error')->count(),
            ],
            default => throw new \InvalidArgumentException('Unknown resource URI.'),
        };

        return ['contents' => [[
            'uri' => $uri,
            'mimeType' => 'application/json',
            'text' => json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT),
        ]]];
    }

    private function prompts(): array
    {
        return ['prompts' => [
            ['name' => 'morning-brief', 'description' => 'Summarize what needs attention in the business today.'],
            ['name' => 'ceo-snapshot', 'description' => 'Create an executive snapshot of the current business.'],
            ['name' => 'collections-review', 'description' => 'Review overdue receivables and recommend collection priorities.'],
        ]];
    }

    private function getPrompt(array $params): array
    {
        $name = (string) ($params['name'] ?? '');
        $text = match ($name) {
            'morning-brief' => 'Use business.morning_brief and summarize only the items that need action today. Prioritize cash, overdue customers, stock risks, approvals, and due tasks.',
            'ceo-snapshot' => 'Use business.ceo_snapshot and explain the company position concisely, highlighting material risks, changes, and the next three management actions.',
            'collections-review' => 'Use collections.queue, rank overdue customers by balance and age, then recommend the next collection action for each high-priority account.',
            default => throw new \InvalidArgumentException('Unknown prompt.'),
        };

        return ['description' => $name, 'messages' => [[
            'role' => 'user',
            'content' => ['type' => 'text', 'text' => $text],
        ]]];
    }

    private function error(mixed $id, int $code, string $message): JsonResponse
    {
        return response()->json(['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $code, 'message' => $message]]);
    }
}
