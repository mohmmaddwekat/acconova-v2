<?php

namespace App\Services\AI\Tools;

use App\Models\AiImportDraft;
use App\Models\User;
use App\Services\AI\Contracts\AiWriteTool;
use App\Services\AI\Import\ImportClassifier;

/**
 * Classifies an eagerly-created `AiImportDraft`'s extracted rows against the
 * catalog of importable entities and writes the proposed target entity and
 * field mapping back onto the draft for the user to confirm.
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
            "entity its rows represent and how its columns map to that entity's fields.";
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

    /**
     * Gated by `ai.business_data.write` at the registry level (Task 13).
     * There is no further per-draft restriction here beyond the ownership
     * check `execute()` enforces: any user allowed to use the write-tool
     * registry at all may propose a classification for their own drafts.
     */
    public function allowed(User $user): bool
    {
        return true;
    }

    public function execute(User $user, array $arguments): array
    {
        $draft = AiImportDraft::query()
            ->where('user_id', $user->id)
            ->findOrFail((int) $arguments['draft_id']);

        $classification = $this->classifier->classify(
            $user,
            $draft,
            isset($arguments['hint']) ? (string) $arguments['hint'] : null,
        );

        $draft->target_entity = $classification['target_entity'];
        $draft->field_mapping = $classification['field_mapping'];
        $draft->ai_notes = $classification['notes'];
        $draft->save();

        $rows = (array) $draft->extracted_rows;

        return [
            'draft_id' => $draft->id,
            'target_entity' => $draft->target_entity,
            'sample_rows' => array_slice($rows, 0, 5),
            'row_count' => count($rows),
            'notes' => $draft->ai_notes,
        ];
    }
}
