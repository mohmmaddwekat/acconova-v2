<?php

namespace App\Services\AI;

use App\Models\User;
use RuntimeException;

final class AiToolPlanner
{
    public function __construct(
        private readonly AiGateway $gateway,
        private readonly AiBusinessToolRegistry $tools,
    ) {
    }

    /**
     * @param  list<array{role:string,content:string}>  $messages
     * @return array{
     *     calls:list<array{name:string,arguments:array<string,mixed>}>,
     *     usage:array{input_tokens:int,output_tokens:int,total_tokens:int}
     * }
     */
    public function plan(
        User $user,
        array $messages,
        ?string $preferredProvider = null,
    ): array {
        if (! (bool) config('ai.tools.enabled', true)) {
            return $this->emptyPlan();
        }

        $definitions = $this->tools->definitionsFor($user);

        if ($definitions === []) {
            return $this->emptyPlan();
        }

        $recent = array_slice($messages, -8);
        $transcript = [];

        foreach ($recent as $message) {
            $role = (string) ($message['role'] ?? '');
            $content = trim((string) ($message['content'] ?? ''));

            if ($content === '') {
                continue;
            }

            $transcript[] = strtoupper($role).': '.mb_substr($content, 0, 3500);
        }

        $plannerMessages = [
            [
                'role' => 'system',
                'content' =>
                    "You are the AccoNova internal business-tool planner. ".
                    "Use tools whenever the user's question depends on live AccoNova business data. ".
                    "Never invent tool names or arguments. Never request SQL, table names, columns, raw database access, credentials, or secrets. ".
                    "Use only the supplied tool catalog. At most ".
                    max(1, (int) config('ai.tools.max_calls', 4)).
                    " calls. If no business data is needed, return no calls. ".
                    "Resolve relative dates using today's date ".
                    now()->toDateString().
                    ". Return JSON only, exactly in this shape: ".
                    '{"calls":[{"name":"tool_name","arguments":{}}]}.',
            ],
            [
                'role' => 'user',
                'content' =>
                    "Tool catalog:\n".
                    json_encode(
                        $definitions,
                        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
                    ).
                    "\n\nConversation:\n".
                    mb_substr(implode("\n\n", $transcript), -16000),
            ],
        ];

        $result = $this->gateway->chat(
            $plannerMessages,
            (int) config('ai.tools.planner_max_output_tokens', 450),
            $preferredProvider,
        );

        $decoded = $this->decodePlan($result['content']);
        $maxCalls = max(1, (int) config('ai.tools.max_calls', 4));
        $calls = [];

        foreach (array_slice((array) ($decoded['calls'] ?? []), 0, $maxCalls) as $call) {
            if (! is_array($call)) {
                continue;
            }

            $name = trim((string) ($call['name'] ?? ''));

            if (
                $name === ''
                || ! $this->tools->available($user, $name)
            ) {
                continue;
            }

            $arguments = $call['arguments'] ?? [];

            $calls[] = [
                'name' => $name,
                'arguments' => is_array($arguments)
                    ? $arguments
                    : [],
            ];
        }

        return [
            'calls' => $calls,
            'usage' => [
                'input_tokens' => (int) $result['input_tokens'],
                'output_tokens' => (int) $result['output_tokens'],
                'total_tokens' => (int) $result['total_tokens'],
            ],
        ];
    }

    /** @return array<string,mixed> */
    private function decodePlan(string $content): array
    {
        $content = trim($content);
        $fence = chr(96).chr(96).chr(96);

        if (str_starts_with($content, $fence)) {
            $content = preg_replace(
                '/^'.preg_quote($fence, '/').'(?:json)?\s*|\s*'.preg_quote($fence, '/').'$/i',
                '',
                $content,
            ) ?? $content;
        }

        $decoded = json_decode($content, true);

        if (is_array($decoded)) {
            return $decoded;
        }

        $start = strpos($content, '{');
        $end = strrpos($content, '}');

        if ($start !== false && $end !== false && $end > $start) {
            $decoded = json_decode(
                substr($content, $start, $end - $start + 1),
                true,
            );
        }

        if (! is_array($decoded)) {
            throw new RuntimeException('AI tool planner returned invalid JSON.');
        }

        return $decoded;
    }

    /**
     * @return array{
     *     calls:list<array{name:string,arguments:array<string,mixed>}>,
     *     usage:array{input_tokens:int,output_tokens:int,total_tokens:int}
     * }
     */
    private function emptyPlan(): array
    {
        return [
            'calls' => [],
            'usage' => [
                'input_tokens' => 0,
                'output_tokens' => 0,
                'total_tokens' => 0,
            ],
        ];
    }
}
