<?php

namespace App\Services\AI\Tools;

use App\Enums\WriteActionSeverity;
use App\Models\AiConversation;
use App\Models\AiImportDraft;
use App\Models\User;
use App\Services\AI\Contracts\AiWriteTool;
use App\Services\AI\Import\ImportClassifier;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Re-classifies a previously proposed `AiImportDraft` using a user-supplied
 * correction instruction (e.g. "actually these are products"), overwriting
 * the draft's target entity and field mapping with the new classification.
 * Only drafts still in `draft` status may be revised — once committed or
 * cancelled, a draft is no longer editable.
 */
final class SmartImportReviseTool implements AiWriteTool
{
    public function __construct(
        private readonly ImportClassifier $classifier,
    ) {}

    public function name(): string
    {
        return 'smart_import_revise';
    }

    public function description(): string
    {
        return 'Re-classify a previously proposed smart-import draft using a correction '.
            "instruction, updating the draft's proposed target entity and field mapping. ".
            'The result must be shown to the user as a preview before any smart_import_confirm '.
            'call can follow.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'draft_id' => [
                    'type' => 'integer',
                    'description' => 'The id of the AiImportDraft to revise.',
                ],
                'instruction' => [
                    'type' => 'string',
                    'description' => 'The user-supplied correction instruction describing what the uploaded data actually represents.',
                ],
            ],
            'required' => ['draft_id', 'instruction'],
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
        // finalized): cheap enough to fail before the slow classify()
        // call below, but it does not decide what gets saved — this
        // unlocked draft can go stale (e.g. a concurrent
        // `smart_import_confirm` committing it) while classify() is in
        // flight, so the final save re-checks status against a locked
        // reload instead of this one.
        $draft = AiImportDraft::query()
            ->where('user_id', $user->id)
            ->where('ai_conversation_id', $conversation->id)
            ->findOrFail($draftId);

        $this->guardDraftIsRevisable($draft);

        // Deliberately outside any lock: this is a slow network/AI call,
        // and holding a row lock across it would serialize unrelated
        // work and risk long-held locks on failure/timeout.
        $classification = $this->classifier->classify(
            $user,
            $draft,
            (string) $arguments['instruction'],
        );

        return DB::transaction(function () use ($user, $draftId, $conversation, $classification): array {
            /*
             * Re-checked against a locked reload, never the unlocked
             * `$draft` above: a concurrent `smart_import_confirm` could
             * have committed this draft while `classify()` was in
             * flight, and saving the new classification onto a
             * finalized draft would silently corrupt the audit record
             * of what was actually committed, with no error raised
             * anywhere.
             */
            $lockedDraft = AiImportDraft::query()
                ->where('user_id', $user->id)
                ->where('ai_conversation_id', $conversation->id)
                ->lockForUpdate()
                ->findOrFail($draftId);

            $this->guardDraftIsRevisable($lockedDraft);

            $lockedDraft->target_entity = $classification['target_entity'];
            $lockedDraft->field_mapping = $classification['field_mapping'];
            $lockedDraft->ai_notes = $classification['notes'];
            $lockedDraft->save();

            $rows = (array) $lockedDraft->extracted_rows;

            return [
                'draft_id' => $lockedDraft->id,
                'target_entity' => $lockedDraft->target_entity,
                'sample_rows' => array_slice($rows, 0, 5),
                'row_count' => count($rows),
                'notes' => $lockedDraft->ai_notes,
            ];
        });
    }

    /**
     * Only a draft still in "draft" status may be revised. Shared by the
     * initial (unlocked) check and the re-check made under
     * `lockForUpdate` immediately before saving the new classification.
     */
    private function guardDraftIsRevisable(AiImportDraft $draft): void
    {
        if ($draft->status !== AiImportDraft::STATUS_DRAFT) {
            throw new RuntimeException('Only drafts still in "draft" status can be revised.');
        }
    }
}
