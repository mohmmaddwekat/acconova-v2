<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\FinancialDocument;
use App\Models\SupplierPaymentPlan;
use App\Services\Finance\FinanceAuthorization;
use App\Services\Finance\SupplierPaymentPlanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Proposed supplier payments. Viewing and drafting need cash and purchases
 * visibility; approving a plan and changing the rules need finance approval
 * rights. No endpoint here moves money or records a payment.
 */
class SupplierPaymentPlanController extends Controller
{
    public function policy(Request $request, SupplierPaymentPlanService $service): JsonResponse
    {
        $this->authorizeView($request);

        return response()->json(['data' => $service->policy()->only($this->policyFields())]);
    }

    public function updatePolicy(Request $request, SupplierPaymentPlanService $service): JsonResponse
    {
        abort_unless(FinanceAuthorization::allows($request->user(), 'finance.approvals.review'), 403);

        return response()->json(['data' => $service->updatePolicy($request->only($this->policyFields()))->only($this->policyFields())]);
    }

    public function proposal(Request $request, SupplierPaymentPlanService $service): JsonResponse
    {
        $this->authorizeView($request);

        return response()->json(['data' => $service->propose(...$this->options($request))]);
    }

    public function store(Request $request, SupplierPaymentPlanService $service): JsonResponse
    {
        $this->authorizeView($request);

        return response()->json(['data' => $this->present($service->generate($request->user(), ...$this->options($request)))], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizeView($request);

        return response()->json(['data' => SupplierPaymentPlan::query()->latest('id')->limit(20)->get()->map(fn (SupplierPaymentPlan $plan): array => [
            'id' => $plan->id, 'status' => $plan->status, 'as_of' => $plan->as_of->toDateString(), 'scenario' => $plan->scenario,
            'planned_total' => $plan->planned_total, 'unfunded_total' => $plan->unfunded_total, 'approved_at' => $plan->approved_at?->toIso8601String(),
        ])->values()]);
    }

    public function show(Request $request, int $plan): JsonResponse
    {
        $this->authorizeView($request);

        return response()->json(['data' => $this->present(SupplierPaymentPlan::query()->with('items')->findOrFail($plan))]);
    }

    public function approve(Request $request, int $plan, SupplierPaymentPlanService $service): JsonResponse
    {
        abort_unless(FinanceAuthorization::allows($request->user(), 'finance.approvals.review'), 403);

        return response()->json(['data' => $this->present($service->approve(SupplierPaymentPlan::query()->findOrFail($plan), $request->user()))]);
    }

    public function refresh(Request $request, int $plan, SupplierPaymentPlanService $service): JsonResponse
    {
        $this->authorizeView($request);

        $result = $service->refresh(SupplierPaymentPlan::query()->with('items')->findOrFail($plan), $request->user());

        return response()->json(['data' => $this->present($result['plan']), 'changes' => $result['changes']]);
    }

    private function authorizeView(Request $request): void
    {
        abort_unless(
            FinanceAuthorization::allows($request->user(), 'finance.cash.view')
            && FinanceAuthorization::allows($request->user(), 'finance.purchases.view'),
            403,
        );
    }

    /**
     * @return array{scenario: string, horizonDays: int, delayDays: int, currency: ?string}
     */
    private function options(Request $request): array
    {
        $input = $request->validate([
            'scenario' => ['sometimes', 'in:confirmed_only,expected,late_collection'],
            'horizon_days' => ['sometimes', 'integer', 'between:7,90'],
            'delay_days' => ['sometimes', 'integer', 'between:1,120'],
            'currency' => ['sometimes', 'string', 'size:3'],
        ]);

        return [
            'scenario' => $input['scenario'] ?? 'expected', 'horizonDays' => (int) ($input['horizon_days'] ?? 30),
            'delayDays' => (int) ($input['delay_days'] ?? 14), 'currency' => $input['currency'] ?? null,
        ];
    }

    /**
     * A stored plan with what each payment looks like against the books today.
     *
     * @return array<string, mixed>
     */
    private function present(SupplierPaymentPlan $plan): array
    {
        $plan->loadMissing('items');
        $balances = FinancialDocument::query()->whereIn('id', $plan->items->pluck('financial_document_id')->filter())->pluck('balance_due', 'id');

        return [
            'id' => $plan->id, 'status' => $plan->status, 'as_of' => $plan->as_of->toDateString(), 'approved_at' => $plan->approved_at?->toIso8601String(),
            'approved_by' => $plan->approved_by, 'previous_plan_id' => $plan->previous_plan_id,
            'plan' => $plan->payload,
            'items' => $plan->items->map(fn ($item): array => [
                'id' => $item->id, 'key' => $item->item_key, 'party_id' => $item->party_id, 'amount' => $item->amount, 'pay_on' => $item->pay_on->toDateString(),
                'kind' => $item->kind, 'depends_on_expected' => $item->depends_on_expected,
                'invoice_balance_now' => $item->financial_document_id ? (string) ($balances[$item->financial_document_id] ?? '0') : null,
                'settled_since' => $item->financial_document_id !== null && (float) ($balances[$item->financial_document_id] ?? 0) <= 0.004,
            ])->values(),
            'notice' => SupplierPaymentPlanService::DISCLAIMER,
        ];
    }

    /**
     * @return list<string>
     */
    private function policyFields(): array
    {
        return ['operating_reserve', 'min_partial_percent', 'pay_days_before_due', 'overdue_first', 'party_priorities'];
    }
}
