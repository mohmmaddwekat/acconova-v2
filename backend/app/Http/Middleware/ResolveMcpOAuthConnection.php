<?php

namespace App\Http\Middleware;

use App\Services\Mcp\McpTokenService;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class ResolveMcpOAuthConnection
{
    public function __construct(
        private readonly McpTokenService $tokens,
        private readonly OrganizationAccess $organizations,
        private readonly TenantContext $context,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            throw new HttpException(401, 'OAuth authentication is required.');
        }

        $publicId = trim((string) $request->route('connection'));
        $connection = DB::table('mcp_oauth_connections')
            ->where('public_id', $publicId)
            ->where('status', 'active')
            ->whereNull('revoked_at')
            ->first();

        if (! $connection) {
            throw new HttpException(404, 'MCP OAuth connection not found or revoked.');
        }

        if ((int) $connection->user_id !== (int) $user->id) {
            throw new HttpException(403, 'This OAuth connection belongs to another AccoNova user.');
        }

        try {
            $this->organizations->resolve(
                $user,
                (int) $connection->organization_id,
                $this->context,
            );
        } catch (\Throwable) {
            throw new HttpException(403, 'You no longer have access to this MCP workspace.');
        }

        $token = $this->tokens->resolveStoredToken((int) $connection->mcp_access_token_id);

        if ((int) $token->organization_id !== (int) $connection->organization_id || (int) $token->user_id !== (int) $user->id) {
            throw new HttpException(403, 'The MCP OAuth connection is invalid.');
        }

        DB::table('mcp_oauth_connections')
            ->where('id', $connection->id)
            ->update(['last_used_at' => now(), 'updated_at' => now()]);

        $request->attributes->set('mcp_token', $token);
        $request->attributes->set('mcp_oauth_connection', $connection);

        try {
            return $next($request);
        } finally {
            $this->context->clear();
        }
    }
}
