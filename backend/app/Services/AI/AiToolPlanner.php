<?php

namespace App\Services\AI;

use App\Models\User;
use RuntimeException;

final class AiToolPlanner
{
    /**
     * Smart-import write tools, in the order a safe lifecycle would call
     * them. Shared by `enforceConfirmRequiresPriorPreview()` to recognize
     * which planner-selected calls are write calls at all.
     *
     * @var list<string>
     */
    private const WRITE_TOOL_NAMES = [
        'smart_import_propose',
        'smart_import_revise',
        'smart_import_confirm',
    ];

    private const CONFIRM_TOOL_NAME = 'smart_import_confirm';

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
            'calls' => $this->enforceConfirmRequiresPriorPreview($calls),
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
     * §1): nothing otherwise stops the model from selecting
     * `smart_import_confirm` in the same plan as the `smart_import_propose`/
     * `smart_import_revise` call that produced the thing being confirmed,
     * with no human-visible preview step actually occurring in between.
     *
     * Two rules, applied in order:
     *  1. If this plan also contains `smart_import_propose` or
     *     `smart_import_revise`, drop every `smart_import_confirm` call
     *     from it (those two are safe to run together with a read tool or
     *     alone; only confirm riding along with them in one shot is unsafe).
     *  2. As a simpler general safety net, allow at most one write-tool
     *     call per plan: once the first `smart_import_propose`/`_revise`/
     *     `_confirm` call is kept, every later write-tool call is dropped.
     *
     * @param  list<array{name:string,arguments:array<string,mixed>}>  $calls
     * @return list<array{name:string,arguments:array<string,mixed>}>
     */
    private function enforceConfirmRequiresPriorPreview(array $calls): array
    {
        $names = array_column($calls, 'name');

        $hasPriorPreviewCall = in_array('smart_import_propose', $names, true)
            || in_array('smart_import_revise', $names, true);

        if ($hasPriorPreviewCall) {
            $calls = array_values(array_filter(
                $calls,
                static fn (array $call): bool => $call['name'] !== self::CONFIRM_TOOL_NAME,
            ));
        }

        $writeToolCallSeen = false;

        return array_values(array_filter(
            $calls,
            function (array $call) use (&$writeToolCallSeen): bool {
                if (! in_array($call['name'], self::WRITE_TOOL_NAMES, true)) {
                    return true;
                }

                if ($writeToolCallSeen) {
                    return false;
                }

                $writeToolCallSeen = true;

                return true;
            },
        ));
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
