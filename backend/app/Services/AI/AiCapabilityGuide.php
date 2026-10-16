<?php

namespace App\Services\AI;

use App\Models\User;
use Illuminate\Support\Str;

/**
 * A short, server-built briefing for the assistant: what it can do for this
 * user right now, and how to work. It is generated from the live tool
 * registries, so it can never promise a tool the user's permissions do not
 * allow or one that does not exist yet.
 */
final class AiCapabilityGuide
{
    public function __construct(
        private readonly AiBusinessToolRegistry $readTools,
        private readonly AiWriteToolRegistry $writeTools,
    ) {}

    public function forUser(User $user): string
    {
        $read = $this->lines($this->readTools->definitionsFor($user));
        $write = $this->lines($this->writeTools->definitionsFor($user));

        $lines = [
            'AccoNova assistant briefing for this user (built by the server from their permissions). '.
            'Claim only abilities listed here; for anything else say it is not available in the chat yet and point to the right page.',
            '',
            'Look up live data (read-only):',
            ...($read === [] ? ['- none'] : $read),
            '',
            'Change data (only when the user asks, through the tool):',
            ...($write === [] ? ['- none'] : $write),
            '',
            'How to work:',
            '- To add or change something, collect the values in the chat: ask for what is missing, one short question at a time, then do it once. Do not invent values.',
            '- If a name matches several records, ask which one before changing anything.',
            '- Archiving, pausing and undoing an import first return a plan; show it and wait for the user\'s explicit yes in their next message.',
            '- Nothing is ever deleted permanently and nothing is changed in bulk; archived records can be restored.',
            '- Files (CSV, Excel, PDF, image) are imported with the upload button: a preview comes first, and duplicates are skipped or updated as the user chooses.',
            '- After a change, report what actually happened from the tool result, including refusals and duplicates.',
        ];

        $later = $this->plannedModules();

        if ($later !== []) {
            $lines[] = '- Not available through chat yet (use the pages): '.implode(', ', $later).'.';
        }

        return implode("\n", $lines);
    }

    /**
     * @param  list<array{name:string,description:string,input_schema:array<string,mixed>}>  $definitions
     * @return list<string>
     */
    private function lines(array $definitions): array
    {
        return array_map(
            fn (array $definition): string => '- '.$definition['name'].': '.Str::limit(
                trim((string) preg_split('/(?<=[.!?])\s/', $definition['description'], 2)[0]),
                120,
            ),
            $definitions,
        );
    }

    /**
     * @return list<string>
     */
    private function plannedModules(): array
    {
        $labels = [
            'staff' => 'staff changes',
            'inventory' => 'inventory movements',
            'production' => 'production runs',
            'finance_documents' => 'invoices',
            'cash_payments' => 'receipts, payments and settlements',
        ];

        $planned = collect(AiActionMatrix::all())
            ->where('status', 'planned')
            ->pluck('module')
            ->unique();

        return $planned->map(fn (string $module): ?string => $labels[$module] ?? null)->filter()->values()->all();
    }
}
