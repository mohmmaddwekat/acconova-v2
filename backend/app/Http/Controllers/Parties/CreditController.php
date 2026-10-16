<?php

namespace App\Http\Controllers\Parties;

use App\Http\Controllers\Controller;
use App\Models\Party;
use App\Services\Credit\CreditRecommendationService;
use App\Services\Finance\FinanceAuthorization;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Credit policy, the explained credit recommendation for a customer and the
 * authorized merchant's recorded decision. Viewing needs sales and account
 * visibility; the policy and decisions need finance approval rights.
 */
class CreditController extends Controller
{
    public function policy(Request $request, CreditRecommendationService $service): JsonResponse
    {
        abort_unless(FinanceAuthorization::allows($request->user(), 'finance.sales.view'), 403);

        return response()->json(['data' => $service->policy()->only($this->policyFields())]);
    }

    public function updatePolicy(Request $request, CreditRecommendationService $service): JsonResponse
    {
        abort_unless(FinanceAuthorization::allows($request->user(), 'finance.approvals.review'), 403);

        return response()->json(['data' => $service->updatePolicy($request->only($this->policyFields()))->only($this->policyFields())]);
    }

    public function assessment(Request $request, int $party, CreditRecommendationService $service): JsonResponse
    {
        $record = $this->visibleParty($request, $party);

        $asOf = $request->validate(['as_of' => ['sometimes', 'date_format:Y-m-d']])['as_of'] ?? null;

        return response()->json(['data' => $service->assess($record, $asOf ? CarbonImmutable::parse($asOf) : null)]);
    }

    public function decide(Request $request, int $party, CreditRecommendationService $service): JsonResponse
    {
        $record = $this->visibleParty($request, $party);

        abort_unless(FinanceAuthorization::allows($request->user(), 'finance.approvals.review'), 403);

        $decision = $service->decide($record, $request->only([
            'decision', 'credit_limit', 'credit_days', 'advance_percent', 'notes', 'apply_credit_limit',
        ]), $request->user());

        return response()->json(['data' => ['id' => $decision->id, 'decision' => $decision->decision, 'overrides_recommendation' => $decision->overrides_recommendation]], 201);
    }

    public function decisions(Request $request, int $party, CreditRecommendationService $service): JsonResponse
    {
        return response()->json(['data' => $service->decisions($this->visibleParty($request, $party))]);
    }

    private function visibleParty(Request $request, int $party): Party
    {
        $record = Party::withTrashed()->findOrFail($party);

        abort_unless(
            $request->user()?->can('view', $record)
            && FinanceAuthorization::allows($request->user(), 'finance.sales.view')
            && WorkspaceFeaturePermissions::allows($request->user(), 'parties.account.view'),
            403,
        );

        return $record;
    }

    /**
     * @return list<string>
     */
    private function policyFields(): array
    {
        return [
            'min_history_invoices', 'min_history_days', 'min_on_time_ratio', 'max_avg_days_late', 'max_overdue_ratio',
            'stop_credit_overdue_days', 'stop_credit_bounced_cheques', 'stop_credit_missed_promises', 'lookback_days',
            'credit_days', 'advance_percent', 'limit_months_of_sales', 'max_credit_limit', 'new_customer_terms',
            'cheque_max_postdated_days', 'cheque_exposure_ratio',
        ];
    }
}
