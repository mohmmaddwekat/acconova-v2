<?php

namespace App\Services\AI;

use App\Models\AiConversation;
use App\Models\AiPendingAction;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Two-step gate for sensitive assistant actions.
 *
 * Step one (`propose`) stores the plan that was shown to the user and returns
 * a single-use token; nothing is changed. Step two (`execute`) runs the
 * action only when the same user, in the same conversation, presents that
 * token with identical arguments before it expires. The action and the
 * "executed" mark commit in one transaction, so a failure leaves the token
 * usable and a success makes any replay return the stored result unchanged.
 */
final class PendingActionGate
{
    public const TTL_MINUTES = 15;

    /**
     * @param  array<string, mixed>  $arguments  without the confirm token
     * @param  array<string, mixed>  $plan
     */
    public function propose(User $user, AiConversation $conversation, string $tool, array $arguments, array $plan): AiPendingAction
    {
        return AiPendingAction::create([
            'ai_conversation_id' => $conversation->id,
            'user_id' => $user->id,
            'tool_name' => $tool,
            'token' => Str::random(32),
            'arguments_hash' => $this->hash($tool, $arguments),
            'plan' => $plan,
            'status' => AiPendingAction::STATUS_PENDING,
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
        ]);
    }

    /**
     * @param  array<string, mixed>  $arguments  without the confirm token
     * @param  callable(AiPendingAction): array<string, mixed>  $run  performs the action, returns its result
     * @return array<string, mixed>
     */
    public function execute(User $user, AiConversation $conversation, string $tool, array $arguments, string $token, callable $run): array
    {
        return DB::transaction(function () use ($user, $conversation, $tool, $arguments, $token, $run): array {
            $action = AiPendingAction::query()
                ->where('token', $token)
                ->where('user_id', $user->id)
                ->where('ai_conversation_id', $conversation->id)
                ->where('tool_name', $tool)
                ->lockForUpdate()
                ->first();

            if ($action === null || ! hash_equals($action->arguments_hash, $this->hash($tool, $arguments))) {
                return $this->refused('invalid_token', 'This confirmation does not match the planned action; nothing was changed. Ask for a new plan.');
            }

            if ($action->status === AiPendingAction::STATUS_EXECUTED) {
                return [
                    'status' => 'already_executed',
                    'message' => 'This action was already carried out; nothing was changed again.',
                    'previous_result' => $action->result,
                ];
            }

            if ($action->expires_at->isPast()) {
                return $this->refused('expired', 'The confirmation expired; nothing was changed. Ask for a new plan.');
            }

            $result = $run($action);

            if (in_array($result['status'] ?? null, ['archived', 'restored', 'rolled_back', 'updated', 'created'], true)) {
                $audit = $result['audit'] ?? null;
                unset($result['audit']);

                $action->status = AiPendingAction::STATUS_EXECUTED;
                $action->result = $result;
                $action->executed_at = now();
                $action->save();

                if ($audit !== null) {
                    $result['audit'] = $audit;
                }
            }

            return $result;
        });
    }

    /**
     * @param  array<string, mixed>  $arguments
     */
    public function hash(string $tool, array $arguments): string
    {
        unset($arguments['confirm_token']);
        $this->sortRecursively($arguments);

        return hash('sha256', $tool.'|'.json_encode($arguments, JSON_UNESCAPED_UNICODE));
    }

    /**
     * @return array<string, mixed>
     */
    private function refused(string $status, string $message): array
    {
        return ['status' => $status, 'message' => $message];
    }

    /**
     * @param  array<mixed>  $value
     */
    private function sortRecursively(array &$value): void
    {
        ksort($value);

        foreach ($value as &$item) {
            if (is_array($item)) {
                $this->sortRecursively($item);
            }
        }
    }
}
