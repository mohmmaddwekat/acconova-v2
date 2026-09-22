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

        foreach ($plan['calls'] as $call) {
            $startedAt = hrtime(true);
            $name = $call['name'];
            $arguments = $call['arguments'];

            try {
                $result = $this->tools->execute(
                    $user,
                    $name,
                    $arguments,
                );

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
        $answer['tool_calls'] =
            array_values(
                array_unique(
                    $usedTools,
                ),
            );

        return $answer;
    }

    /**
     * @param  array<string,mixed>  $arguments
     * @param  array<string,mixed>|null  $result
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
