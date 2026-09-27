<?php

namespace App\Http\Controllers\Mcp;

use App\Http\Controllers\Controller;

use App\Services\Mcp\McpCapabilityCatalog;
use App\Services\Mcp\McpTokenService;
use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class McpTokenController extends Controller
{
    public function store(
        Request $request,
        TenantContext $context,
        McpTokenService $tokens,
    ): JsonResponse {
        WorkspaceFeaturePermissions::authorize($request->user(), 'ai.admin.configure');

        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'kind' => ['required', Rule::in(['agent', 'partner'])],
            'mode' => ['required', Rule::in(['read', 'write', 'approve'])],
            'scopes' => ['required', 'array', 'min:1', 'max:100'],
            'scopes.*' => ['required', 'string', 'max:120'],
            'daily_call_limit' => ['nullable', 'integer', 'min:1', 'max:10000000'],
            'monthly_call_limit' => ['nullable', 'integer', 'min:1', 'max:100000000'],
            'expires_at' => ['nullable', 'date', 'after:now'],
        ]);

        if ($data['kind'] === 'partner') {
            $settings = DB::table('mcp_workspace_settings')
                ->where('organization_id', $context->id())
                ->first();

            if (! $settings || ! (bool) $settings->allow_partner_tokens) {
                throw ValidationException::withMessages([
                    'kind' => ['Enable partner MCP access before creating partner keys.'],
                ]);
            }
        }

        $scopes = $this->validatedScopes(
            $context->id(),
            (string) $data['mode'],
            array_values(array_unique($data['scopes'])),
        );

        $created = $tokens->create(
            $context->id(),
            $request->user()->id,
            [
                ...$data,
                'scopes' => $scopes,
            ],
        );

        return response()->json([
            'token' => $created['token'],
            'record' => $this->publicToken($created['record']),
            'warning' => 'This token is shown once. Store it securely.',
        ], 201);
    }

    public function destroy(
        Request $request,
        int $token,
        TenantContext $context,
        McpTokenService $tokens,
    ): JsonResponse {
        WorkspaceFeaturePermissions::authorize($request->user(), 'ai.admin.configure');

        abort_unless($tokens->revoke($context->id(), $token), 404);

        return response()->json(['ok' => true]);
    }

    /**
     * @param  list<string>  $requestedScopes
     * @return list<string>
     */
    private function validatedScopes(int $organizationId, string $mode, array $requestedScopes): array
    {
        if (in_array('*', $requestedScopes, true)) {
            return ['*'];
        }

        $builtIn = collect(McpCapabilityCatalog::tools());
        $validScopes = $builtIn
            ->flatMap(fn (array $tool): array => [
                (string) $tool['tool'],
                (string) $tool['id'],
            ])
            ->filter()
            ->values()
            ->all();

        $customScopes = DB::table('mcp_custom_tools')
            ->where('organization_id', $organizationId)
            ->pluck('slug')
            ->map(fn (string $slug): string => 'custom.'.$slug)
            ->all();

        $allowed = array_fill_keys([...$validScopes, ...$customScopes], true);
        $unknown = array_values(array_filter(
            $requestedScopes,
            fn (string $scope): bool => ! isset($allowed[$scope]),
        ));

        if ($unknown !== []) {
            throw ValidationException::withMessages([
                'scopes' => ['Unknown MCP scopes: '.implode(', ', $unknown)],
            ]);
        }

        if ($mode === 'read') {
            $writeScopes = $builtIn
                ->filter(fn (array $tool): bool => ($tool['mode'] ?? 'read') === 'write')
                ->flatMap(fn (array $tool): array => [
                    (string) $tool['tool'],
                    (string) $tool['id'],
                ])
                ->filter()
                ->all();

            $writeScopeSet = array_fill_keys($writeScopes, true);

            $customWriteScopes = DB::table('mcp_custom_tools')
                ->where('organization_id', $organizationId)
                ->where('http_method', '!=', 'GET')
                ->pluck('slug')
                ->map(fn (string $slug): string => 'custom.'.$slug)
                ->all();

            foreach ($customWriteScopes as $scope) {
                $writeScopeSet[$scope] = true;
            }

            $invalidForRead = array_values(array_filter(
                $requestedScopes,
                fn (string $scope): bool => isset($writeScopeSet[$scope]),
            ));

            if ($invalidForRead !== []) {
                throw ValidationException::withMessages([
                    'scopes' => [
                        'Read-only MCP keys cannot include write scopes: '.implode(', ', $invalidForRead),
                    ],
                ]);
            }
        }

        return $requestedScopes;
    }

    /** @return array<string, mixed> */
    private function publicToken(object $row): array
    {
        return [
            'id' => $row->id,
            'name' => $row->name,
            'kind' => $row->kind,
            'token_prefix' => $row->token_prefix,
            'mode' => $row->mode,
            'scopes' => json_decode((string) ($row->scopes ?? '[]'), true) ?: [],
            'daily_call_limit' => $row->daily_call_limit,
            'monthly_call_limit' => $row->monthly_call_limit,
            'expires_at' => $row->expires_at,
            'last_used_at' => $row->last_used_at,
            'revoked_at' => $row->revoked_at,
            'created_at' => $row->created_at,
        ];
    }
}
