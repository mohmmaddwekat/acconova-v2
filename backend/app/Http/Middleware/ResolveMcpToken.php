<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\Mcp\McpTokenService;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class ResolveMcpToken
{
    public function __construct(
        private readonly McpTokenService $tokens,
        private readonly OrganizationAccess $organizations,
        private readonly TenantContext $context,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $token = $this->tokens->resolveRequest($request);
        $user = User::query()->find($token->user_id);

        if (! $user) {
            throw new HttpException(401, 'The MCP token owner no longer exists.');
        }

        try {
            $this->organizations->resolve(
                $user,
                (int) $token->organization_id,
                $this->context,
            );
        } catch (\Throwable) {
            throw new HttpException(403, 'The MCP token owner no longer has access to this workspace.');
        }

        $request->setUserResolver(static fn () => $user);
        $request->attributes->set('mcp_token', $token);

        try {
            return $next($request);
        } finally {
            $this->context->clear();
        }
    }
}
