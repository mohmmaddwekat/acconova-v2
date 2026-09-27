<?php

namespace App\Http\Controllers\Mcp;

use App\Http\Controllers\Controller;
use App\Services\Mcp\McpTokenService;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

final class McpOAuthConnectionController extends Controller
{
    public function index(TenantContext $context): JsonResponse
    {
        $connections = DB::table('mcp_oauth_connections as connection')
            ->join('mcp_access_tokens as token', 'token.id', '=', 'connection.mcp_access_token_id')
            ->where('connection.organization_id', $context->id())
            ->orderByDesc('connection.created_at')
            ->get([
                'connection.id',
                'connection.public_id',
                'connection.name',
                'connection.provider',
                'connection.status',
                'connection.last_used_at',
                'connection.revoked_at',
                'connection.created_at',
                'token.mode',
                'token.scopes',
                'token.expires_at',
            ])
            ->map(fn ($row): array => [
                'id' => (int) $row->id,
                'public_id' => $row->public_id,
                'name' => $row->name,
                'provider' => $row->provider,
                'status' => $row->status,
                'mode' => $row->mode,
                'scopes' => json_decode((string) $row->scopes, true) ?: [],
                'endpoint_url' => url('/mcp/oauth/'.$row->public_id),
                'last_used_at' => $row->last_used_at,
                'expires_at' => $row->expires_at,
                'revoked_at' => $row->revoked_at,
                'created_at' => $row->created_at,
            ])
            ->all();

        return response()->json([
            'oauth_enabled' => true,
            'authorization_server' => url('/'),
            'connections' => $connections,
        ]);
    }

    public function store(Request $request, TenantContext $context, McpTokenService $tokens): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'provider' => ['required', Rule::in(['chatgpt', 'claude', 'cursor', 'custom'])],
            'mode' => ['required', Rule::in(['read', 'write', 'approve'])],
            'scopes' => ['required', 'array', 'min:1', 'max:100'],
            'scopes.*' => ['string', 'max:120'],
            'expires_at' => ['nullable', 'date', 'after:now'],
        ]);

        $publicId = (string) Str::uuid();
        $created = $tokens->create($context->id(), $request->user()->id, [
            'name' => 'OAuth: '.$data['name'],
            'kind' => 'agent',
            'mode' => $data['mode'],
            'scopes' => array_values(array_unique($data['scopes'])),
            'expires_at' => $data['expires_at'] ?? null,
            'metadata' => [
                'authentication' => 'oauth',
                'provider' => $data['provider'],
                'public_id' => $publicId,
            ],
        ]);

        $id = DB::table('mcp_oauth_connections')->insertGetId([
            'public_id' => $publicId,
            'organization_id' => $context->id(),
            'user_id' => $request->user()->id,
            'mcp_access_token_id' => $created['record']->id,
            'name' => $data['name'],
            'provider' => $data['provider'],
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'id' => $id,
            'endpoint_url' => url('/mcp/oauth/'.$publicId),
            'warning' => 'OAuth clients still require explicit authorization by this AccoNova user.',
        ], 201);
    }

    public function destroy(int $connection, TenantContext $context, McpTokenService $tokens): JsonResponse
    {
        $row = DB::table('mcp_oauth_connections')
            ->where('organization_id', $context->id())
            ->where('id', $connection)
            ->first();

        abort_unless($row, 404);

        DB::transaction(function () use ($row, $tokens, $context): void {
            DB::table('mcp_oauth_connections')
                ->where('id', $row->id)
                ->update([
                    'status' => 'revoked',
                    'revoked_at' => now(),
                    'updated_at' => now(),
                ]);

            $tokens->revoke($context->id(), (int) $row->mcp_access_token_id);
        });

        return response()->json(['ok' => true]);
    }
}
