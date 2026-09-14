<?php

namespace App\Http\Controllers;

use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActiveOrganizationController extends Controller
{
    public function update(Request $request, OrganizationAccess $access, TenantContext $context): JsonResponse
    {
        $data = $request->validate(['organization_id' => ['required', 'integer', 'min:1']]);

        try {
            $access->resolve($request->user(), (int) $data['organization_id'], $context);
            $request->session()->put(OrganizationAccess::SESSION_KEY, $context->id());

            return response()->json(['data' => $context->organization(), 'role' => $context->role()->value]);
        } finally {
            $context->clear();
        }
    }
}
