<?php

namespace App\Services\AI\Tools;

use App\Enums\WriteActionSeverity;
use App\Models\AiConversation;
use App\Models\AiImportDraft;
use App\Models\User;
use App\Services\AI\Contracts\AiWriteTool;
use App\Services\AI\Import\ImportDestinationCatalog;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Reverses a committed smart-import draft: records it created are archived
 * and records it overwrote get their previous values back. Requires the same
 * permissions as the commit it undoes.
 */
final class SmartImportRollbackTool implements AiWriteTool
{
    public function __construct(
        private readonly ImportDestinationCatalog $catalog,
    ) {}

    public function name(): string
    {
        return 'smart_import_rollback';
    }

    public function description(): string
    {
        return 'Undo a committed smart-import draft: archive the records it created and restore '.
            'the records it updated. Only call this when the user explicitly asks to undo the import.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'draft_id' => [
                    'type' => 'integer',
                    'description' => 'The id of the committed AiImportDraft to roll back.',
                ],
            ],
            'required' => ['draft_id'],
            'additionalProperties' => false,
        ];
    }

    public function allowed(User $user): bool
    {
        return WorkspaceFeaturePermissions::allows($user, 'ai.business_data.write');
    }

    public function severity(): WriteActionSeverity
    {
        return WriteActionSeverity::Destructive;
    }

    public function execute(User $user, array $arguments, AiConversation $conversation): array
    {
        $draftId = (int) $arguments['draft_id'];

        return DB::transaction(function () use ($user, $draftId, $conversation): array {
            $draft = AiImportDraft::query()
                ->where('user_id', $user->id)
                ->where('ai_conversation_id', $conversation->id)
                ->lockForUpdate()
                ->findOrFail($draftId);

            if ($draft->status !== AiImportDraft::STATUS_COMMITTED) {
                throw new RuntimeException('Only committed drafts can be rolled back.');
            }

            $entity = $this->catalog->find((string) $draft->target_entity);

            if ($entity === null) {
                throw new RuntimeException("Unknown import destination: {$draft->target_entity}.");
            }

            if (! WorkspaceFeaturePermissions::allows($user, $entity->requiredPermission())) {
                throw new RuntimeException('You do not have permission to roll back this import.');
            }

            $summary = (array) $draft->commit_summary;
            $result = $entity->rollback((array) ($summary['changes'] ?? []));

            $draft->status = AiImportDraft::STATUS_ROLLED_BACK;
            $draft->commit_summary = [...$summary, 'rollback' => $result];
            $draft->save();

            return [
                ...$result,
                'draft_id' => $draft->id,
                'audit' => [
                    'before' => ['status' => AiImportDraft::STATUS_COMMITTED],
                    'after' => ['status' => $draft->status, ...$result],
                ],
            ];
        });
    }
}
