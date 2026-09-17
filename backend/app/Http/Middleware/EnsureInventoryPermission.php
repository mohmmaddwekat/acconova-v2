<?php

namespace App\Http\Middleware;

use App\Support\ProductionRunAccess;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureInventoryPermission
{
    /**
     * Protect Production Run routes with workspace Inventory permissions.
     *
     * Supported abilities:
     * - view: read Production history and Draft previews.
     * - manage: create, edit, Post, delete, or reverse Production.
     */
    public function handle(
        Request $request,
        Closure $next,
        string $ability = 'view',
    ): Response {
        $allowed =
            $ability === 'manage'
            ? ProductionRunAccess::canManage(
                $request->user(),
            )
            : ProductionRunAccess::canView(
                $request->user(),
            );

        abort_unless(
            $allowed,
            403,
        );

        return $next(
            $request,
        );
    }
}
