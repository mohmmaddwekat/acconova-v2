<?php

namespace App\Http\Middleware;

use App\Services\WorkspaceFeaturePermissions;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureMcpAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        abort_unless($user, 401);

        WorkspaceFeaturePermissions::authorize($user, 'ai.admin.configure');

        return $next($request);
    }
}
