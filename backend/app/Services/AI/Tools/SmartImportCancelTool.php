<?php

namespace App\Services\AI\Tools;

use App\Enums\WriteActionSeverity;
use App\Models\AiConversation;
use App\Models\AiImportDraft;
use App\Models\User;
use App\Services\AI\Contracts\AiWriteTool;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Cancels a previously proposed `AiImportDraft` so it can no longer be
 * revised or confirmed. Only drafts still in `draft` status may be
 * cancelled — a committed or already-cancelled draft is final.
 */
final class SmartImportCancelTool implements AiWriteTool
{
    public function name(): string
    {
        return 'smart_import_cancel';
    }

    public function description(): string
    {
        return 'Cancel a previously proposed smart-import draft so it can no longer be '.
            'revised or confirmed. Only call this when the user has explicitly said they '.
            'want to discard the import. Cancelled drafts cannot be restored.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'draft_id' => [
                    'type' => 'integer',
                    'description' => 'The id of the AiImportDraft to cancel.',
                ],
            ],
            'required' => ['draft_id'],
            'additionalProperties' => false,
        ];
    }

    public function allowed(User $user): bool
    {
        return WorkspaceFeaturePermissions::allows(
            $user,
            'ai.business_data.write',
        );
    }

    public function severity(): WriteActionSeverity
    {
        return WriteActionSeverity::Standard;
    }

    public function execute(User $user, array $arguments, AiConversation $conversation): array
    {
        $draftId = (int) $arguments['draft_id'];

        // Fast-path rejection only (draft missing, wrong owner, already
        // finalized). It does not decide what gets saved: this unlocked
        // draft can go stale (e.g. a concurrent `smart_import_confirm`
        // committing it) before the lock is acquired, so the status
        // change re-checks against a locked reload instead of this one.
        $draft = AiImportDraft::query()
            ->where('user_id', $user->id)
            ->where('ai_conversation_id', $conversation->id)
            ->findOrFail($draftId);

        $this->guardDraftIsCancelable($draft);

        return DB::transaction(function () use ($user, $draftId, $conversation): array {
            /*
             * Re-checked against a locked reload, never the unlocked
             * `$draft` above: a concurrent `smart_import_confirm` could
             * have committed this draft between the fast-path check and
             * this lock. Cancelling it then would overwrite the committed
             * status and misreport what was actually imported.
             */
            $lockedDraft = AiImportDraft::query()
                ->where('user_id', $user->id)
                ->where('ai_conversation_id', $conversation->id)
                ->lockForUpdate()
                ->findOrFail($draftId);

            $this->guardDraftIsCancelable($lockedDraft);

            $before = ['status' => $lockedDraft->status];

            $lockedDraft->status = AiImportDraft::STATUS_CANCELLED;
            $lockedDraft->save();

            return [
                'draft_id' => $lockedDraft->id,
                'status' => $lockedDraft->status,
                'audit' => [
                    'before' => $before,
                    'after' => ['status' => $lockedDraft->status],
                ],
            ];
        });
    }

    /**
     * Only a draft still in "draft" status may be cancelled. Shared by the
     * initial (unlocked) check and the re-check made under
     * `lockForUpdate` immediately before saving the new status.
     */
    private function guardDraftIsCancelable(AiImportDraft $draft): void
    {
        if ($draft->status !== AiImportDraft::STATUS_DRAFT) {
            throw new RuntimeException('Only drafts still in "draft" status can be cancelled.');
        }
    }
}
