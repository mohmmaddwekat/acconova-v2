<?php

namespace App\Services\AI;

use App\Models\AiConversation;
use App\Models\AiToolRun;
use App\Models\User;
use Throwable;

final class AiAssistantOrchestrator
{
    public function __construct(
        private readonly AiGateway $gateway,
        private readonly AiToolPlanner $planner,
        private readonly AiBusinessToolRegistry $tools,
        private readonly AiWriteToolRegistry $writeTools,
        private readonly AiCapabilityGuide $guide,
    ) {}

    /**
     * @param  list<array{role:string,content:string}>  $messages
     * @return array{
     *     content:string,
     *     provider:string,
     *     model:string,
     *     input_tokens:int,
     *     output_tokens:int,
     *     total_tokens:int,
     *     tool_calls:list<string>
     * }
     */
    public function chat(
        AiConversation $conversation,
        User $user,
        array $messages,
        ?string $preferredProvider = null,
    ): array {
        $plan = $this->planner->plan(
            $user,
            $messages,
            $preferredProvider,
        );

        $results = [];
        $usedTools = [];
        $toolUsage = ['input_tokens' => 0, 'output_tokens' => 0, 'total_tokens' => 0];

        foreach ($plan['calls'] as $call) {
            $startedAt = hrtime(true);
            $name = $call['name'];
            $arguments = $call['arguments'];

            $registry = $this->tools->available($user, $name)
                ? $this->tools
                : $this->writeTools;

            try {
                // $registry may resolve to the read-only AiBusinessToolRegistry,
                // whose execute() only declares 3 params: passing $conversation
                // here regardless is safe, since PHP silently ignores an extra
                // positional argument to a non-variadic method (it only errors
                // on too few required args) — only AiWriteToolRegistry's
                // execute() actually consumes it.
                $result = $registry->execute(
                    $user,
                    $name,
                    $arguments,
                    $conversation,
                );

                $beforePayload = null;
                $afterPayload = null;

                // Only a write-tool result can carry 'audit'/'usage' keys
                // meant for extraction: stripping them from a read-only
                // AiBusinessToolRegistry result would also discard any
                // same-named key that tool happens to return for unrelated
                // business reasons, so read-only results are left untouched.
                if ($registry === $this->writeTools) {
                    [$result, $beforePayload, $afterPayload] = $this->extractAudit($result);
                    [$result, $usage] = $this->extractUsage($result);

                    if ($usage !== null) {
                        $toolUsage['input_tokens'] += $usage['input_tokens'];
                        $toolUsage['output_tokens'] += $usage['output_tokens'];
                        $toolUsage['total_tokens'] += $usage['total_tokens'];
                    }
                }

                $results[] = [
                    'tool' => $name,
                    'ok' => true,
                    'data' => $result,
                ];
                $usedTools[] = $name;

                $this->recordRun(
                    $conversation,
                    $user,
                    $name,
                    $arguments,
                    'success',
                    $result,
                    $startedAt,
                    beforePayload: $beforePayload,
                    afterPayload: $afterPayload,
                );
            } catch (Throwable $exception) {
                report($exception);

                $results[] = [
                    'tool' => $name,
                    'ok' => false,
                    'error' => 'The tool could not return data.',
                ];

                $this->recordRun(
                    $conversation,
                    $user,
                    $name,
                    $arguments,
                    'failed',
                    null,
                    $startedAt,
                    $exception,
                );
            }
        }

        $enriched = $messages;

        // The answering model learns what it can do for this user, built from live permissions.
        array_splice($enriched, ($enriched[0]['role'] ?? null) === 'system' ? 1 : 0, 0, [[
            'role' => 'system',
            'content' => $this->guide->forUser($user),
        ]]);

        if ($results !== []) {
            $payload = json_encode(
                $results,
                JSON_UNESCAPED_UNICODE
                | JSON_UNESCAPED_SLASHES
                | JSON_THROW_ON_ERROR,
            );

            $payload = mb_substr(
                $payload,
                0,
                max(
                    4000,
                    (int) config(
                        'ai.tools.max_result_chars',
                        30000,
                    ),
                ),
            );

            $toolContext = [
                'role' => 'system',
                'content' => 'Trusted AccoNova business-tool results are below. '.
                    'They are tenant-scoped and permission-checked by the server. '.
                    "Use these results to answer the user's question. ".
                    "Do not claim data not present in the results and do not ask for raw database access.\n\n".
                    $payload,
            ];

            $insertAt = max(
                1,
                count($enriched) - 1,
            );

            array_splice(
                $enriched,
                $insertAt,
                0,
                [$toolContext],
            );
        }

        $answer = $this->gateway->chat(
            $enriched,
            null,
            $preferredProvider,
        );

        $answer['input_tokens'] +=
            $plan['usage']['input_tokens'];
        $answer['output_tokens'] +=
            $plan['usage']['output_tokens'];
        $answer['total_tokens'] +=
            $plan['usage']['total_tokens'];
        $answer['input_tokens'] +=
            $toolUsage['input_tokens'];
        $answer['output_tokens'] +=
            $toolUsage['output_tokens'];
        $answer['total_tokens'] +=
            $toolUsage['total_tokens'];
        $answer['tool_calls'] =
            array_values(
                array_unique(
                    $usedTools,
                ),
            );

        return $answer;
    }

    /**
     * Splits a tool's raw `'audit'` key (shaped
     * `array{before?: array<string,mixed>, after?: array<string,mixed>}`)
     * out of its result, so it can be persisted onto the `AiToolRun` row
     * without ever reaching the LLM-facing context or `resultMeta()`. A
     * result with no `'audit'` key (or a non-array one) is returned
     * unchanged, with both payloads `null`.
     *
     * @param  array<string,mixed>  $result
     * @return array{0:array<string,mixed>,1:?array<string,mixed>,2:?array<string,mixed>}
     */
    private function extractAudit(array $result): array
    {
        $audit = $result['audit'] ?? null;

        if (! is_array($audit)) {
            return [$result, null, null];
        }

        unset($result['audit']);

        $before = $audit['before'] ?? null;
        $after = $audit['after'] ?? null;

        return [
            $result,
            is_array($before) ? $before : null,
            is_array($after) ? $after : null,
        ];
    }

    /**
     * Splits a tool's raw `'usage'` key (shaped
     * `array{input_tokens:int,output_tokens:int,total_tokens:int}`) out of
     * its result, so the AI tokens it spent (e.g. an image-extraction or
     * classification call made inside the tool) can be accumulated into
     * the orchestrator's own totals without ever reaching the LLM-facing
     * tool-result context — the model doesn't need to see its own token
     * counts. A result with no `'usage'` key (or a non-array one) is
     * returned unchanged, with a null usage.
     *
     * @param  array<string,mixed>  $result
     * @return array{0:array<string,mixed>,1:?array{input_tokens:int,output_tokens:int,total_tokens:int}}
     */
    private function extractUsage(array $result): array
    {
        $usage = $result['usage'] ?? null;

        if (! is_array($usage)) {
            return [$result, null];
        }

        unset($result['usage']);

        return [
            $result,
            [
                'input_tokens' => (int) ($usage['input_tokens'] ?? 0),
                'output_tokens' => (int) ($usage['output_tokens'] ?? 0),
                'total_tokens' => (int) ($usage['total_tokens'] ?? 0),
            ],
        ];
    }

    /**
     * @param  array<string,mixed>  $arguments
     * @param  array<string,mixed>|null  $result
     * @param  array<string,mixed>|null  $beforePayload
     * @param  array<string,mixed>|null  $afterPayload
     */
    private function recordRun(
        AiConversation $conversation,
        User $user,
        string $name,
        array $arguments,
        string $status,
        ?array $result,
        int $startedAt,
        ?Throwable $exception = null,
        ?array $beforePayload = null,
        ?array $afterPayload = null,
    ): void {
        rescue(
            function () use (
                $conversation,
                $user,
                $name,
                $arguments,
                $status,
                $result,
                $startedAt,
                $exception,
                $beforePayload,
                $afterPayload,
            ): void {
                AiToolRun::create([
                    'ai_conversation_id' => $conversation->id,
                    'user_id' => $user->id,
                    'tool_name' => $name,
                    'arguments' => $arguments,
                    'status' => $status,
                    'result_meta' => $result === null
                            ? null
                            : $this->resultMeta(
                                $result,
                            ),
                    'before_payload' => $beforePayload,
                    'after_payload' => $afterPayload,
                    'duration_ms' => max(
                        0,
                        (int) round(
                            (
                                hrtime(true)
                                - $startedAt
                            )
                            / 1_000_000,
                        ),
                    ),
                    'error' => $exception
                            ? mb_substr(
                                $exception
                                    ->getMessage(),
                                0,
                                500,
                            )
                            : null,
                ]);
            },
            report: true,
        );
    }

    /**
     * @param  array<string,mixed>  $result
     * @return array<string,mixed>
     */
    private function resultMeta(
        array $result,
    ): array {
        $meta = [
            'keys' => array_values(
                array_keys(
                    $result,
                ),
            ),
        ];

        foreach (
            [
                'currencies',
                'balances',
                'invoices',
                'alerts',
                'departments',
            ] as $key
        ) {
            if (
                isset($result[$key])
                && is_array(
                    $result[$key],
                )
            ) {
                $meta[
                    $key.'_count'
                ] =
                    count(
                        $result[$key],
                    );
            }
        }

        return $meta;
    }
}
