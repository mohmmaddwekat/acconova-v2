<?php

namespace App\Services\AI\Tools;

use App\Models\Party;
use App\Models\User;
use App\Services\AI\Contracts\AiBusinessTool;
use App\Services\Credit\CreditRecommendationService;
use App\Services\Finance\FinanceAuthorization;
use App\Services\Workspace\WorkspaceFeaturePermissions;

final class CreditRecommendationTool implements AiBusinessTool
{
    public function __construct(private readonly CreditRecommendationService $credit) {}

    public function name(): string
    {
        return 'credit_recommendation';
    }

    public function description(): string
    {
        return 'Explained credit recommendation for one customer (credit, cheque with conditions, advance payment, cash only, stop credit, or insufficient data) with reasons and reference data. Advice only; the merchant decides.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'party' => ['type' => 'string', 'description' => 'Customer name, email or phone.'],
            ],
            'required' => ['party'],
            'additionalProperties' => false,
        ];
    }

    public function allowed(User $user): bool
    {
        return FinanceAuthorization::allows($user, 'finance.sales.view')
            && WorkspaceFeaturePermissions::allows($user, 'parties.account.view');
    }

    public function execute(User $user, array $arguments): array
    {
        $needle = mb_strtolower(trim((string) ($arguments['party'] ?? '')));

        if ($needle === '') {
            return ['status' => 'needs_clarification', 'message' => 'Which customer?'];
        }

        $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $needle).'%';
        $matches = Party::query()
            ->where(fn ($query) => $query
                ->whereRaw('LOWER(name) LIKE ?', [$like])
                ->orWhereRaw('LOWER(company_name) LIKE ?', [$like])
                ->orWhereRaw('LOWER(email) = ?', [$needle])
                ->orWhere('phone', $needle))
            ->limit(6)
            ->get();

        if ($matches->isEmpty()) {
            return ['status' => 'not_found', 'message' => 'No customer matches that name.'];
        }

        $exact = $matches->filter(fn (Party $party): bool => in_array($needle, [mb_strtolower((string) $party->name), mb_strtolower((string) $party->company_name)], true));
        $party = $exact->count() === 1 ? $exact->first() : ($matches->count() === 1 ? $matches->first() : null);

        if ($party === null) {
            return [
                'status' => 'needs_clarification',
                'message' => 'Several customers match. Ask which one.',
                'candidates' => $matches->map(fn (Party $match): array => ['id' => $match->id, 'name' => $match->company_name ?: $match->name])->all(),
            ];
        }

        $assessment = $this->credit->assess($party);

        return [
            'status' => 'ok',
            'customer' => $party->company_name ?: $party->name,
            'recommendation' => $assessment['recommendation'],
            'reasons' => array_map(fn (array $reason): array => ['code' => $reason['code'], 'text' => $reason['text']], $assessment['reasons']),
            'sufficiency' => $assessment['sufficiency'],
            'data' => $assessment['data'],
            'latest_decision' => $assessment['latest_decision'],
            'disclaimer' => $assessment['disclaimer'],
        ];
    }
}
