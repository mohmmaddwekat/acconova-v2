<?php

namespace App\Services\AI;

use App\Models\Organization;
use App\Models\User;
use App\Services\Billing\AiCreditService;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * What the assistant has used this month, in the same plain terms a person
 * reads on a usage page: allowance, used, remaining, when it resets, a daily
 * trend, and the split by model. Everyone sees their own usage; workspace-wide
 * totals are only for users who administer the assistant.
 */
final class AiUsageService
{
    public function __construct(private readonly AiCreditService $credits) {}

    /**
     * @return array<string, mixed>
     */
    public function forUser(User $user, Organization $organization, ?int $conversationId = null): array
    {
        $now = CarbonImmutable::now();
        $start = $now->startOfMonth();
        $end = $now->endOfMonth();
        $organizationId = (int) $organization->id;

        $base = fn () => DB::table('ai_messages')
            ->where('organization_id', $organizationId)
            ->whereBetween('created_at', [$start, $end]);

        $included = $this->credits->includedMonthlyLimit($organizationId);
        $used = $this->credits->monthlyUsage($organizationId);
        $wallet = (int) ($this->credits->snapshot($organization)['balance_tokens'] ?? 0);
        $mine = $base()->where('user_id', $user->id);
        $isAdmin = WorkspaceFeaturePermissions::allows($user, 'ai.admin.configure');

        $daily = fn ($query): array => $query
            ->selectRaw('DATE(created_at) as day, SUM(total_tokens) as tokens, COUNT(*) as messages')
            ->groupBy('day')
            ->orderBy('day')
            ->get()
            ->map(fn (object $row): array => ['date' => (string) $row->day, 'tokens' => (int) $row->tokens, 'messages' => (int) $row->messages])
            ->all();

        $result = [
            'period' => ['start' => $start->toDateString(), 'end' => $end->toDateString(), 'resets_on' => $end->addDay()->toDateString(), 'days_left' => (int) $now->startOfDay()->diffInDays($end->addDay()->startOfDay())],
            'allowance' => [
                'included_tokens' => $included,
                'used_tokens' => $used,
                'remaining_included_tokens' => $included === null ? null : max($included - $used, 0),
                'percent_used' => $included === null || $included === 0 ? null : min(100, (int) round($used / $included * 100)),
                'overage_tokens' => $included === null ? 0 : max($used - $included, 0),
                'wallet_balance_tokens' => $wallet,
            ],
            'me' => [
                'tokens' => (int) (clone $mine)->sum('total_tokens'),
                'messages' => (clone $mine)->count(),
                'today_tokens' => (int) (clone $mine)->whereDate('created_at', $now->toDateString())->sum('total_tokens'),
                'daily' => $daily(clone $mine),
            ],
            'by_model' => $base()->where('user_id', $user->id)->whereNotNull('model')
                ->selectRaw('model, SUM(total_tokens) as tokens')->groupBy('model')->orderByDesc('tokens')->get()
                ->map(fn (object $row): array => ['model' => (string) $row->model, 'tokens' => (int) $row->tokens])->all(),
            'workspace' => null,
            'conversation' => null,
        ];

        if ($isAdmin) {
            $result['workspace'] = [
                'tokens' => $used,
                'messages' => $base()->count(),
                'daily' => $daily($base()),
                'top_users' => $base()->selectRaw('user_id, SUM(total_tokens) as tokens')->groupBy('user_id')->orderByDesc('tokens')->limit(5)->get()
                    ->map(fn (object $row): array => ['user_id' => (int) $row->user_id, 'tokens' => (int) $row->tokens])->all(),
            ];
        }

        if ($conversationId !== null) {
            $result['conversation'] = [
                'id' => $conversationId,
                'tokens' => (int) DB::table('ai_messages')
                    ->where('organization_id', $organizationId)
                    ->where('user_id', $user->id)
                    ->where('ai_conversation_id', $conversationId)
                    ->sum('total_tokens'),
            ];
        }

        return $result;
    }
}
