<?php

namespace App\Services\AI;

use App\Models\AiConversation;
use App\Models\AiMessage;
use Illuminate\Support\Collection;

final class AiConversationMemory
{
    /**
     * Build a bounded context window from a persistent summary plus the most
     * recent messages. Old chat history is not resent forever.
     *
     * @return list<array{role:string,content:string}>
     */
    public function context(AiConversation $conversation): array
    {
        $recent = $conversation
            ->messages()
            ->latest('id')
            ->limit(max(4, (int) config('ai.memory.recent_messages', 20)))
            ->get();

        $messages = [
            [
                'role' => 'system',
                'content' => (string) config('ai.system_prompt'),
            ],
        ];

        if (is_string($conversation->summary) && $conversation->summary !== '') {
            $messages[] = [
                'role' => 'system',
                'content' => "Conversation memory summary:\n".$conversation->summary,
            ];
        }

        $budget = max(
            12000,
            (int) config('ai.memory.context_char_budget', 60000),
        );

        $used = array_sum(
            array_map(
                fn (array $message): int => mb_strlen($message['content']),
                $messages,
            ),
        );

        $selected = collect();

        /*
         * Walk newest-to-oldest so the current user request is always kept.
         * Then restore chronological order before sending it to the provider.
         */
        foreach ($recent as $message) {
            $length = mb_strlen($message->content);

            if (
                $selected->isNotEmpty()
                && $used + $length > $budget
            ) {
                break;
            }

            $selected->push($message);
            $used += $length;
        }

        foreach ($selected->reverse()->values() as $message) {
            $messages[] = [
                'role' => $message->role,
                'content' => $message->content,
            ];
        }

        return $messages;
    }

    public function compactIfNeeded(
        AiConversation $conversation,
        AiGateway $gateway,
    ): void {
        $trigger = max(
            10,
            (int) config('ai.memory.summarize_after_messages', 40),
        );

        if ($conversation->messages()->count() < $trigger) {
            return;
        }

        $keep = max(
            4,
            (int) config('ai.memory.recent_messages', 20),
        );

        $recentIds = $conversation
            ->messages()
            ->latest('id')
            ->limit($keep)
            ->pluck('id');

        if ($recentIds->isEmpty()) {
            return;
        }

        $firstRecentId = (int) $recentIds->min();

        $query = $conversation
            ->messages()
            ->where('id', '<', $firstRecentId)
            ->orderBy('id');

        if ($conversation->summary_through_message_id) {
            $query->where(
                'id',
                '>',
                (int) $conversation->summary_through_message_id,
            );
        }

        /** @var Collection<int, AiMessage> $older */
        $older = $query->get();

        if ($older->isEmpty()) {
            return;
        }

        $characterLimit = max(
            10000,
            (int) config('ai.memory.summary_transcript_chars', 60000),
        );

        $selected = collect();
        $usedCharacters = 0;

        foreach ($older as $message) {
            $line = strtoupper($message->role).': '.$message->content;
            $lineLength = mb_strlen($line) + 2;

            if (
                $selected->isNotEmpty()
                && $usedCharacters + $lineLength > $characterLimit
            ) {
                break;
            }

            $selected->push($message);
            $usedCharacters += $lineLength;
        }

        if ($selected->isEmpty()) {
            return;
        }

        $transcript = $selected
            ->map(
                fn (AiMessage $message): string => strtoupper($message->role).': '.$message->content,
            )
            ->implode("\n\n");

        $summaryRequest = [
            [
                'role' => 'system',
                'content' => 'Summarize durable facts, decisions, preferences, unresolved questions, and important business context from the transcript. Be concise. Do not invent facts.',
            ],
            [
                'role' => 'user',
                'content' => "Previous summary:\n".
                    ($conversation->summary ?: '(none)').
                    "\n\nNew transcript:\n".
                    $transcript,
            ],
        ];

        $summary = $gateway->chat(
            $summaryRequest,
            (int) config('ai.memory.summary_max_output_tokens', 700),
        );

        $conversation->forceFill([
            'summary' => $summary['content'],
            'summary_through_message_id' => (int) $selected->last()->id,
        ])->save();
    }
}
