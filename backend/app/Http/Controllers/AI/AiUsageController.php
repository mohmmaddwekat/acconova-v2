<?php

namespace App\Http\Controllers\AI;

use App\Http\Controllers\Controller;
use App\Services\AI\AiUsageService;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AiUsageController extends Controller
{
    /**
     * Assistant usage for the current month: the signed-in user's own usage
     * always, workspace totals only for assistant administrators.
     */
    public function __invoke(Request $request, AiUsageService $usage): JsonResponse
    {
        WorkspaceFeaturePermissions::authorize($request->user(), 'ai.assistant.use');

        $conversation = $request->validate(['conversation' => ['sometimes', 'integer', 'min:1']])['conversation'] ?? null;

        return response()->json(['data' => $usage->forUser(
            $request->user(),
            app(TenantContext::class)->organization(),
            $conversation,
        )]);
    }
}
