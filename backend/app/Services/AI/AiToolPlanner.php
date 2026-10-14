<?php

namespace App\Services\AI;

use App\Enums\WriteActionSeverity;
use App\Models\User;
use RuntimeException;

final class AiToolPlanner
{
    public function __construct(
        private readonly AiGateway $gateway,
        private readonly AiBusinessToolRegistry $tools,
        private readonly AiWriteToolRegistry $writeTools,
    ) {}

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

        $definitions = array_merge(
            $this->tools->definitionsFor($user),
            $this->writeTools->definitionsFor($user),
        );

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
                'content' => 'You are the AccoNova internal business-tool planner. '.
                    "Use tools whenever the user's question depends on live AccoNova business data. ".
                    'Never invent tool names or arguments. Never request SQL, table names, columns, raw database access, credentials, or secrets. '.
                    'Write tools require genuine user confirmation between a preview and a commit: never plan a '.
                    'smart_import_confirm call in the same response as the smart_import_propose or smart_import_revise '.
                    'call that produced the thing being confirmed. '.
                    'Use only the supplied tool catalog. At most '.
                    max(1, (int) config('ai.tools.max_calls', 4)).
                    ' calls. If no business data is needed, return no calls. '.
                    "Resolve relative dates using today's date ".
                    now()->toDateString().
                    '. Return JSON only, exactly in this shape: '.
                    '{"calls":[{"name":"tool_name","arguments":{}}]}.',
            ],
            [
                'role' => 'user',
                'content' => "Tool catalog:\n".
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

        try {
            $decoded = $this->decodePlan($result['content']);
        } catch (RuntimeException $exception) {
            report($exception);

            return [
                'calls' => [],
                'usage' => [
                    'input_tokens' => (int) $result['input_tokens'],
                    'output_tokens' => (int) $result['output_tokens'],
                    'total_tokens' => (int) $result['total_tokens'],
                ],
            ];
        }

        $maxCalls = max(1, (int) config('ai.tools.max_calls', 4));
        $calls = [];

        foreach (array_slice((array) ($decoded['calls'] ?? []), 0, $maxCalls) as $call) {
            if (! is_array($call)) {
                continue;
            }

            $name = trim((string) ($call['name'] ?? ''));

            if (
                $name === ''
                || (
                    ! $this->tools->available($user, $name)
                    && ! $this->writeTools->available($user, $name)
                )
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
            'calls' => $this->enforceSingleWriteCallBySeverity($user, $calls),
            'usage' => [
                'input_tokens' => (int) $result['input_tokens'],
                'output_tokens' => (int) $result['output_tokens'],
                'total_tokens' => (int) $result['total_tokens'],
            ],
        ];
    }

    /**
     * Server-side enforcement of the design spec's "preview before commit"
     * guarantee (`backend/docs/superpowers/specs/2026-10-10-smart-import-engine-design.md`,
     * §1), generalized by `AiWriteTool::severity()` (see
     * `backend/docs/superpowers/specs/2026-10-13-ai-write-permission-matrix-design.md`)
     * instead of hardcoded smart-import tool names: nothing otherwise stops
     * the model from selecting a commit-style write call in the same plan
     * as the preview/propose call that produced the thing being committed,
     * with no human-visible preview step actually occurring in between.
     *
     * Three rules, applied in order, over the calls that already survived
     * the per-call `available()` check above (write-tool calls are
     * identified via `$writeTools->available($user, $name)`):
     *  1. If more than one write-tool call survived, keep only the first
     *     (the existing "cap at one write call per plan" behavior,
     *     unchanged for `Standard` severity).
     *  2. If exactly one write-tool call remains after rule 1 AND the
     *     original (pre-filter) list contained more than one write-tool
     *     call (i.e. this one only survived by beating another write
     *     call) AND its severity is `Destructive`, drop it too: a
     *     destructive call is only allowed to run when the model proposed
     *     it completely alone, never when it merely won a fight against
     *     another write call — which is exactly the preview/propose step a
     *     destructive action must never be batched with.
     *  3. Everything else (non-write-tool calls, and the single surviving
     *     write-tool call if any) is kept, in its original order.
     *
     * @param  list<array{name:string,arguments:array<string,mixed>}>  $calls
     * @return list<array{name:string,arguments:array<string,mixed>}>
     */
    private function enforceSingleWriteCallBySeverity(User $user, array $calls): array
    {
        $writeCallIndexes = [];

        foreach ($calls as $index => $call) {
            if ($this->writeTools->available($user, $call['name'])) {
                $writeCallIndexes[] = $index;
            }
        }

        if ($writeCallIndexes === []) {
            return $calls;
        }

        $keptWriteCallIndex = $writeCallIndexes[0];

        if (
            count($writeCallIndexes) > 1
            && $this->writeTools->severityOf($calls[$keptWriteCallIndex]['name']) === WriteActionSeverity::Destructive
        ) {
            $keptWriteCallIndex = null;
        }

        $result = [];

        foreach ($calls as $index => $call) {
            if (in_array($index, $writeCallIndexes, true) && $index !== $keptWriteCallIndex) {
                continue;
            }

            $result[] = $call;
        }

        return $result;
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
