<?php

namespace App\Http\Controllers\AI;

use App\Http\Controllers\Controller;
use App\Models\AiImportDraft;
use App\Services\AI\Tools\SmartImportConfirmTool;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class SmartImportProgressController extends Controller
{
    /**
     * Report how many rows of a draft's commit have been processed.
     */
    public function __invoke(Request $request, int $draft): JsonResponse
    {
        WorkspaceFeaturePermissions::authorize($request->user(), 'ai.assistant.use');

        $draft = AiImportDraft::query()->findOrFail($draft);

        abort_unless($draft->user_id === $request->user()->id, 404);

        $progress = Cache::store('file')->get(
            SmartImportConfirmTool::progressKey((int) $draft->organization_id, (int) $draft->id),
        );

        return response()->json([
            'data' => [
                'status' => $draft->status,
                'processed' => $progress['processed'] ?? 0,
                'total' => $progress['total'] ?? count((array) $draft->extracted_rows),
            ],
        ]);
    }
}
