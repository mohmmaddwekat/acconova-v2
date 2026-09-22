<?php

namespace App\Http\Controllers;

use App\Services\BillingOverviewService;
use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BillingOverviewController extends Controller
{
    public function show(
        Request $request,
        BillingOverviewService $overview,
    ): JsonResponse {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'workspace.settings.view',
        );

        $organization = app(TenantContext::class)->organization();

        return response()->json([
            'data' => $overview->forOrganization($organization),
        ]);
    }
}
