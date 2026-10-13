<?php

namespace App\Services\AI\Tools;

use App\Models\AiImportDraft;
use App\Models\User;
use App\Services\AI\Contracts\AiWriteTool;
use App\Services\AI\Import\ImportClassifier;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Classifies an eagerly-created `AiImportDraft`'s extracted rows against the
 * catalog of importable entities and writes the proposed target entity and
 * field mapping back onto the draft for the user to confirm. Only drafts
 * still in `draft` status may be (re-)proposed; once committed or cancelled,
 * a draft is no longer editable.
 */
final class SmartImportProposeTool implements AiWriteTool
{
    public function __construct(
        private readonly ImportClassifier $classifier,
    ) {}

    public function name(): string
    {
        return 'smart_import_propose';
    }

    public function description(): string
    {
        return 'Classify a previously uploaded smart-import draft, proposing which business '.
            "entity its rows represent and how its columns map to that entity's fields. ".
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
                    'description' => 'The id of the AiImportDraft to classify.',
                ],
                'hint' => [
                    'type' => 'string',
                    'description' => 'Optional user-supplied hint about what the uploaded data represents.',
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

    public function execute(User $user, array $arguments): array
    {
        $draftId = (int) $arguments['draft_id'];

        // Fast-path rejection only (draft missing, wrong owner, already
        // finalized): cheap enough to fail before the slow classify() call
        // below, but it does not decide what gets saved - this unlocked
        // draft can go stale (e.g. a concurrent `smart_import_confirm`
        // committing it) while classify() is in flight, so the final save
        // re-checks status against a locked reload instead of this one.
        $draft = AiImportDraft::query()
            ->where('user_id', $user->id)
            ->findOrFail($draftId);

        $this->guardDraftIsProposable($draft);

        // Deliberately outside any lock: this is a slow network/AI call,
        // and holding a row lock across it would serialize unrelated work
        // and risk long-held locks on failure/timeout.
        $classification = $this->classifier->classify(
            $user,
            $draft,
            isset($arguments['hint']) ? (string) $arguments['hint'] : null,
        );

        return DB::transaction(function () use ($user, $draftId, $classification): array {
            /*
             * Re-checked against a locked reload, never the unlocked
             * `$draft` above: a concurrent `smart_import_confirm` could
             * have committed this draft while `classify()` was in flight,
             * and saving the new classification onto a finalized draft
             * would silently corrupt the audit record of what was
             * actually committed, with no error raised anywhere.
             */
            $lockedDraft = AiImportDraft::query()
                ->where('user_id', $user->id)
                ->lockForUpdate()
                ->findOrFail($draftId);

            $this->guardDraftIsProposable($lockedDraft);

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
     * Only a draft still in "draft" status may be proposed/re-proposed.
     * Shared by the initial (unlocked) check and the re-check made under
     * `lockForUpdate` immediately before saving the new classification.
     */
    private function guardDraftIsProposable(AiImportDraft $draft): void
    {
        if ($draft->status !== AiImportDraft::STATUS_DRAFT) {
            throw new RuntimeException('Only drafts still in "draft" status can be proposed.');
        }
    }
}
