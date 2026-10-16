<?php

namespace App\Services\AI\Tools;

use App\Enums\WriteActionSeverity;
use App\Models\AiConversation;
use App\Models\AiImportDraft;
use App\Models\User;
use App\Services\AI\Contracts\AiWriteTool;
use App\Services\AI\Import\ImportDestinationCatalog;
use App\Services\AI\PendingActionGate;
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
        private readonly PendingActionGate $gate,
    ) {}

    public function name(): string
    {
        return 'smart_import_rollback';
    }

    public function description(): string
    {
        return 'Undo a committed smart-import draft: archive the records it created and restore '.
            'the records it updated. Only call this when the user explicitly asks to undo the import. The first call only returns a plan '.
            '(confirmation_required): show it and wait for the user\'s explicit yes in their next message, then call again with the confirm_token.';
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
                'confirm_token' => ['type' => 'string', 'description' => 'Token from the plan the user already approved. Omit it on the first call.'],
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
        $token = trim((string) ($arguments['confirm_token'] ?? ''));
        $base = ['draft_id' => $draftId];

        if ($token !== '') {
            return $this->gate->execute($user, $conversation, $this->name(), $base, $token, fn (): array => $this->rollbackApproved($user, $draftId, $conversation));
        }

        $draft = AiImportDraft::query()
            ->where('user_id', $user->id)
            ->where('ai_conversation_id', $conversation->id)
            ->findOrFail($draftId);

        if ($draft->status !== AiImportDraft::STATUS_COMMITTED) {
            throw new RuntimeException('Only committed drafts can be rolled back.');
        }

        $changes = (array) (((array) $draft->commit_summary)['changes'] ?? []);
        $plan = [
            'operation' => 'rollback',
            'draft_id' => $draft->id,
            'file' => $draft->source_file_name,
            'entity' => $draft->target_entity,
            'will_archive' => count((array) ($changes['created'] ?? [])),
            'will_restore' => count((array) ($changes['updated'] ?? [])),
        ];
        $pending = $this->gate->propose($user, $conversation, $this->name(), $base, $plan);

        return [
            'status' => 'confirmation_required',
            'message' => 'Nothing was changed yet. Show this plan to the user; only after their explicit yes, call again with the same arguments and this confirm_token.',
            'plan' => $plan,
            'confirm_token' => $pending->token,
            'expires_in_minutes' => PendingActionGate::TTL_MINUTES,
        ];
    }

    /**
     * Performs the rollback. Reached only after the user confirmed: through a
     * valid confirm token, or from the UI button that asks for confirmation.
     *
     * @return array<string, mixed>
     */
    public function rollbackApproved(User $user, int $draftId, AiConversation $conversation): array
    {
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
                'status' => 'rolled_back',
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
