<?php

namespace App\Services\AI;

use App\Models\AiConversation;
use App\Models\AiWorkTask;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * Work sessions: the assistant turns a request into a short list of steps and
 * works through them one at a time with the same tools, permissions and
 * confirmations as the normal chat. A step that needs the user's answer or
 * approval stops the run and stays `blocked` until the user replies; a long
 * plan continues on the next message. Nothing here skips a confirmation.
 */
final class AiWorkRunner
{
    public const MAX_STEPS_PER_TURN = 4;

    public const MAX_PLAN_STEPS = 6;

    private const STOPPING_STATUSES = [
        'confirmation_required', 'needs_clarification', 'invalid', 'duplicate', 'not_found',
        'plan_stale', 'invalid_token', 'expired', 'failed',
    ];

    public function __construct(
        private readonly AiAssistantOrchestrator $orchestrator,
        private readonly AiGateway $gateway,
        private readonly AiCapabilityGuide $guide,
    ) {}

    /**
     * Same contract as `AiAssistantOrchestrator::chat`, plus the plan state.
     *
     * @param  list<array{role:string,content:string}>  $messages
     * @return array<string, mixed>
     */
    public function chat(AiConversation $conversation, User $user, array $messages, ?string $preferredProvider = null): array
    {
        $usage = ['input_tokens' => 0, 'output_tokens' => 0, 'total_tokens' => 0];
        $open = $this->openTasks($conversation);

        if ($open->isEmpty()) {
            $planned = $this->plan($conversation, $user, $messages, $preferredProvider);
            $usage = $this->add($usage, $planned['usage']);
            $open = $planned['tasks'];
        }

        $parts = [];
        $pending = [];
        $toolCalls = [];
        $toolResults = [];
        $last = null;
        $executed = 0;

        foreach ($open as $task) {
            if ($executed >= self::MAX_STEPS_PER_TURN) {
                break;
            }

            $resuming = $task->status === AiWorkTask::STATUS_BLOCKED;
            $task->forceFill(['status' => AiWorkTask::STATUS_IN_PROGRESS, 'started_at' => $task->started_at ?? now()])->save();

            $answer = $this->orchestrator->chat(
                $conversation,
                $user,
                $this->stepMessages($messages, $conversation, $task, $resuming),
                $preferredProvider,
            );

            $usage = $this->add($usage, $answer);
            $last = $answer;
            $toolCalls = [...$toolCalls, ...$answer['tool_calls']];
            $toolResults = [...$toolResults, ...($answer['tool_results'] ?? [])];

            [$text, $blocks] = $this->splitPending($answer['content']);
            $pending = [...$pending, ...$blocks];

            $stopped = collect($answer['tool_results'] ?? [])->contains(
                fn (array $result): bool => ! $result['ok'] || in_array($result['status'], self::STOPPING_STATUSES, true),
            );

            $task->forceFill([
                'status' => $stopped ? AiWorkTask::STATUS_BLOCKED : AiWorkTask::STATUS_DONE,
                'note' => Str::limit($text, 500, '…'),
                'finished_at' => $stopped ? null : now(),
            ])->save();

            $parts[] = $task->position.'. '.$task->title."\n".$text;
            $executed++;

            if ($stopped) {
                break;
            }
        }

        $remaining = $this->openTasks($conversation)->count();

        if ($remaining > 0 && ! $this->openTasks($conversation)->contains('status', AiWorkTask::STATUS_BLOCKED)) {
            $parts[] = 'The plan has '.$remaining.' more step(s). Say "continue" to go on.';
        }

        return [
            'content' => implode('', $pending).implode("\n\n", $parts),
            'provider' => $last['provider'] ?? 'work',
            'model' => $last['model'] ?? 'work',
            ...$usage,
            'tool_calls' => array_values(array_unique($toolCalls)),
            'tool_results' => $toolResults,
        ];
    }

    public function cancel(AiConversation $conversation): int
    {
        return AiWorkTask::query()
            ->where('ai_conversation_id', $conversation->id)
            ->whereIn('status', AiWorkTask::OPEN)
            ->update(['status' => AiWorkTask::STATUS_CANCELLED, 'finished_at' => now()]);
    }

    /**
     * @return Collection<int, AiWorkTask>
     */
    private function openTasks(AiConversation $conversation): Collection
    {
        return AiWorkTask::query()
            ->where('ai_conversation_id', $conversation->id)
            ->whereIn('status', AiWorkTask::OPEN)
            ->orderBy('position')
            ->get();
    }

    /**
     * @param  list<array{role:string,content:string}>  $messages
     * @return array{tasks: Collection<int, AiWorkTask>, usage: array<string, int>}
     */
    private function plan(AiConversation $conversation, User $user, array $messages, ?string $preferredProvider): array
    {
        $request = $this->lastUserText($messages);
        $usage = ['input_tokens' => 0, 'output_tokens' => 0, 'total_tokens' => 0];
        $titles = [];

        try {
            $out = $this->gateway->chat([
                ['role' => 'system', 'content' => 'You plan work for a business assistant. Break the user\'s request into 1 to '.self::MAX_PLAN_STEPS.' short, ordered steps. '.
                    'Each step is one action: look up data, add or change one record, or report a result. Put the concrete values in the step. '.
                    'A simple question is one step. Do not add steps for asking permission or for greeting. '.
                    "Only plan what the assistant can do:\n".$this->guide->forUser($user)."\n\n".
                    'Return JSON only: {"steps":["step one","step two"]}.'],
                ['role' => 'user', 'content' => mb_substr($request, 0, 3000)],
            ], 400, $preferredProvider);

            $usage = $this->add($usage, $out);
            $titles = $this->parseSteps((string) $out['content']);
        } catch (\Throwable $exception) {
            report($exception);
        }

        if ($titles === []) {
            $titles = [Str::limit($request !== '' ? $request : 'Handle the request', 200, '…')];
        }

        // Only finished or cancelled steps can be left here: a new plan replaces them.
        AiWorkTask::query()->where('ai_conversation_id', $conversation->id)->delete();

        $tasks = collect($titles)->take(self::MAX_PLAN_STEPS)->values()->map(
            fn (string $title, int $index): AiWorkTask => AiWorkTask::create([
                'ai_conversation_id' => $conversation->id,
                'user_id' => $user->id,
                'position' => $index + 1,
                'title' => Str::limit($title, 250, '…'),
                'status' => AiWorkTask::STATUS_PENDING,
            ]),
        );

        return ['tasks' => $tasks, 'usage' => $usage];
    }

    /**
     * @return list<string>
     */
    private function parseSteps(string $raw): array
    {
        if (! preg_match('/\{.*\}/s', $raw, $match)) {
            return [];
        }

        $decoded = json_decode($match[0], true);
        $steps = is_array($decoded) ? ($decoded['steps'] ?? []) : [];

        return collect(is_array($steps) ? $steps : [])
            ->filter(fn ($step): bool => is_string($step) && trim($step) !== '')
            ->map(fn (string $step): string => trim($step))
            ->values()
            ->all();
    }

    /**
     * The step instruction rides on the user's last message so the planner and
     * the answering model both see it, with what is already done so a step is
     * never repeated.
     *
     * @param  list<array{role:string,content:string}>  $messages
     * @return list<array{role:string,content:string}>
     */
    private function stepMessages(array $messages, AiConversation $conversation, AiWorkTask $task, bool $resuming): array
    {
        $all = AiWorkTask::query()->where('ai_conversation_id', $conversation->id)->orderBy('position')->get();
        $done = $all->where('status', AiWorkTask::STATUS_DONE)->map(fn (AiWorkTask $item): string => $item->position.'. '.$item->title.' — '.Str::limit((string) $item->note, 120, '…'));

        $instruction = "[Work session step {$task->position} of {$all->count()}: {$task->title}. Do only this step now using the tools if needed, and report briefly what happened. ".
            'If it needs a missing value or the user\'s approval, ask for it and stop. '.
            ($done->isEmpty() ? '' : 'Already done, do not repeat: '.$done->implode('; ').'. ').
            ($resuming ? 'This step was waiting for the user; their latest message answers it.' : '').']';

        $index = array_key_last($messages);

        if ($index !== null && ($messages[$index]['role'] ?? '') === 'user') {
            $messages[$index]['content'] = trim((string) $messages[$index]['content'])."\n\n".$instruction;
        } else {
            $messages[] = ['role' => 'user', 'content' => $instruction];
        }

        return $messages;
    }

    /**
     * @param  list<array{role:string,content:string}>  $messages
     */
    private function lastUserText(array $messages): string
    {
        foreach (array_reverse($messages) as $message) {
            if (($message['role'] ?? '') === 'user') {
                return trim((string) preg_replace('/\[\[ACCONOVA_[A-Z_0-9]+\]\][\s\S]*?\[\[\/ACCONOVA_[A-Z_0-9]+\]\]/', '', (string) $message['content']));
            }
        }

        return '';
    }

    /**
     * @return array{0: string, 1: list<string>}
     */
    private function splitPending(string $content): array
    {
        preg_match_all('/\[\[ACCONOVA_PENDING_V1\]\][\s\S]*?\[\[\/ACCONOVA_PENDING_V1\]\]/', $content, $found);

        return [trim((string) preg_replace('/\[\[ACCONOVA_PENDING_V1\]\][\s\S]*?\[\[\/ACCONOVA_PENDING_V1\]\]\s*/', '', $content)), $found[0]];
    }

    /**
     * @param  array<string, int>  $total
     * @param  array<string, mixed>  $extra
     * @return array<string, int>
     */
    private function add(array $total, array $extra): array
    {
        foreach (['input_tokens', 'output_tokens', 'total_tokens'] as $key) {
            $total[$key] += (int) ($extra[$key] ?? 0);
        }

        return $total;
    }
}
