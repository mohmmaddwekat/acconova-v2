<?php

namespace App\Services\AI\Tools;

use App\Enums\WriteActionSeverity;
use App\Models\AiConversation;
use App\Models\AiImportDraft;
use App\Models\User;
use App\Services\AI\Contracts\AiWriteTool;
use App\Services\AI\Import\ImportClassifier;
use App\Services\AI\Import\ImportDestinationCatalog;
use App\Services\AI\Tools\Concerns\RemapsImportRows;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
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
    use RemapsImportRows;

    public function __construct(
        private readonly ImportClassifier $classifier,
        private readonly ImportDestinationCatalog $catalog,
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

    public function severity(): WriteActionSeverity
    {
        return WriteActionSeverity::Standard;
    }

    public function execute(User $user, array $arguments, AiConversation $conversation): array
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
            ->where('ai_conversation_id', $conversation->id)
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

        return DB::transaction(function () use ($user, $draftId, $conversation, $classification): array {
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
                ->where('ai_conversation_id', $conversation->id)
                ->lockForUpdate()
                ->findOrFail($draftId);

            $this->guardDraftIsProposable($lockedDraft);

            $before = [
                'target_entity' => $lockedDraft->target_entity,
                'field_mapping' => $lockedDraft->field_mapping,
            ];

            $lockedDraft->target_entity = $classification['target_entity'];
            $lockedDraft->field_mapping = $classification['field_mapping'];
            $lockedDraft->ai_notes = $classification['notes'];
            $lockedDraft->save();

            $after = [
                'target_entity' => $lockedDraft->target_entity,
                'field_mapping' => $lockedDraft->field_mapping,
            ];

            $rows = (array) $lockedDraft->extracted_rows;
            $validation = $this->validateAgainstTargetEntity($lockedDraft, $rows);

            return [
                'draft_id' => $lockedDraft->id,
                'target_entity' => $lockedDraft->target_entity,
                'field_mapping' => $lockedDraft->field_mapping,
                'sample_rows' => array_slice($rows, 0, 5),
                'row_count' => count($rows),
                'notes' => $lockedDraft->ai_notes,
                'valid_rows' => $validation['valid_rows'],
                'error_rows' => $validation['error_rows'],
                'errors' => $validation['errors'],
                'usage' => $classification['usage'],
                'confidence' => $classification['confidence'],
                'audit' => [
                    'before' => $before,
                    'after' => $after,
                ],
            ];
        });
    }

    /**
     * Resolve the draft's newly-classified target entity (if any) and run
     * its rows through that entity's `preview()`, so the caller can show
     * validation counts alongside the classification without a separate
     * round trip. A draft the classifier could not confidently match to
     * any catalog entity (`target_entity` still null) has nothing to
     * validate against, so this reports zero rows of either kind rather
     * than guessing.
     *
     * @param  array<int, array<string, mixed>>  $rows
     * @return array{valid_rows:int, error_rows:int, errors:list<array{row:int,message:string}>}
     */
    private function validateAgainstTargetEntity(AiImportDraft $draft, array $rows): array
    {
        $entity = $draft->target_entity !== null
            ? $this->catalog->find($draft->target_entity)
            : null;

        if ($entity === null) {
            return ['valid_rows' => 0, 'error_rows' => 0, 'errors' => []];
        }

        $fieldMapping = (array) $draft->field_mapping;
        $remappedRows = $this->remapRows(collect($rows), $fieldMapping);

        /*
         * `preview()` delegates to the target entity's own import action
         * (e.g. `ImportPartiesFromSpreadsheet::analyze()`), which throws a
         * `ValidationException` outright when the row count exceeds its
         * hard limit, rather than returning per-row errors. Left uncaught,
         * that exception would escape this whole method and propagate out
         * of the enclosing `DB::transaction()` in execute(), rolling back
         * the classification save that already happened earlier in the
         * same transaction and surfacing as a generic orchestrator failure
         * instead of a reportable validation outcome. Treat it the same way
         * `SmartImportConfirmTool::errorsFromCommitException()` treats a
         * commit-time `ValidationException`: the whole file counts as
         * errored.
         */
        try {
            $preview = $entity->preview($remappedRows);
        } catch (ValidationException $exception) {
            return [
                'valid_rows' => 0,
                'error_rows' => count($rows),
                'errors' => array_slice(
                    array_map(
                        static fn (string $message): array => ['row' => 0, 'message' => $message],
                        Arr::flatten($exception->errors()),
                    ),
                    0,
                    10,
                ),
            ];
        }

        return [
            'valid_rows' => $preview['valid_rows'],
            'error_rows' => $preview['error_rows'],
            'errors' => array_slice($preview['errors'], 0, 10),
        ];
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
