<?php

namespace App\Http\Controllers\AI;

use App\Http\Controllers\Controller;
use App\Models\AiImportDraft;
use App\Services\AI\Tools\SmartImportConfirmTool;
use App\Services\AI\Tools\SmartImportRollbackTool;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use RuntimeException;

class SmartImportDraftController extends Controller
{
    /**
     * List a conversation's import drafts with their live commit progress.
     */
    public function index(Request $request, int $conversation): JsonResponse
    {
        WorkspaceFeaturePermissions::authorize($request->user(), 'ai.assistant.use');

        $drafts = AiImportDraft::query()
            ->where('user_id', $request->user()->id)
            ->where('ai_conversation_id', $conversation)
            ->latest('id')
            ->limit(10)
            ->get()
            ->map(function (AiImportDraft $draft): array {
                $progress = Cache::store('file')->get(
                    SmartImportConfirmTool::progressKey((int) $draft->organization_id, (int) $draft->id),
                );
                $summary = (array) $draft->commit_summary;

                return [
                    'id' => $draft->id,
                    'file_name' => $draft->source_file_name,
                    'target_entity' => $draft->target_entity,
                    'status' => $draft->status,
                    'rows' => count((array) $draft->extracted_rows),
                    'processed' => $progress['processed'] ?? 0,
                    'summary' => array_intersect_key($summary, array_flip(['created', 'updated', 'skipped', 'total'])),
                    'rollback' => $summary['rollback'] ?? null,
                ];
            });

        return response()->json(['data' => $drafts->values()]);
    }

    /**
     * Undo a committed draft through the same guarded tool the assistant uses.
     */
    public function rollback(Request $request, int $draft, SmartImportRollbackTool $tool): JsonResponse
    {
        WorkspaceFeaturePermissions::authorize($request->user(), 'ai.business_data.write');

        $record = AiImportDraft::query()
            ->where('user_id', $request->user()->id)
            ->with('conversation')
            ->findOrFail($draft);

        try {
            $result = $tool->rollbackApproved($request->user(), $record->id, $record->conversation);
        } catch (RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        unset($result['audit']);

        return response()->json(['data' => $result]);
    }
}
