<?php

namespace App\Http\Controllers;

use App\Models\GovernmentObligation;
use App\Models\TaxRule;
use App\Services\FinanceAuthorization;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TaxComplianceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.taxes.view');

        $rules = TaxRule::query()
            ->orderByDesc('active')
            ->orderBy('country_code')
            ->orderBy('region_code')
            ->orderBy('name')
            ->get();

        $obligations = GovernmentObligation::query()
            ->with('taxRule')
            ->orderByRaw("CASE WHEN status IN ('open','partial') THEN 0 ELSE 1 END")
            ->orderBy('due_date')
            ->get();

        return response()->json([
            'currency' => app(TenantContext::class)->organization()->preferences['currency'] ?? 'ILS',
            'rules' => $rules->map(fn (TaxRule $rule) => $this->rule($rule)),
            'obligations' => $obligations->map(fn (GovernmentObligation $obligation) => $this->obligation($obligation)),
        ]);
    }

    public function storeRule(Request $request): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.taxes.manage');
        $rule = TaxRule::create($this->validatedRule($request));

        return response()->json(['data' => $this->rule($rule)], 201);
    }

    public function updateRule(Request $request, TaxRule $taxRule): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.taxes.manage');
        $taxRule->update($this->validatedRule($request));

        return response()->json(['data' => $this->rule($taxRule->fresh())]);
    }

    public function storeObligation(Request $request): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.taxes.manage');
        $data = $request->validate([
            'tax_rule_id' => ['nullable', 'integer'],
            'authority_name' => ['required', 'string', 'max:200'],
            'title' => ['required', 'string', 'max:200'],
            'obligation_type' => ['required', Rule::in(['vat', 'sales_tax', 'gst', 'withholding', 'payroll', 'corporate', 'customs', 'excise', 'property', 'government_fee', 'other'])],
            'country_code' => ['required', 'regex:/^[A-Z]{2}$/'],
            'region_code' => ['nullable', 'string', 'max:80'],
            'period_start' => ['nullable', 'date_format:Y-m-d'],
            'period_end' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:period_start'],
            'due_date' => ['required', 'date_format:Y-m-d'],
            'amount' => ['required', 'numeric', 'gt:0', 'max:999999999999'],
            'currency' => ['required', 'regex:/^[A-Z]{3}$/'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        if ($data['tax_rule_id'] ?? null) {
            TaxRule::query()->findOrFail($data['tax_rule_id']);
        }

        $obligation = GovernmentObligation::create([
            ...$data,
            'paid_total' => '0',
            'balance_due' => $data['amount'],
            'status' => 'open',
            'created_by' => $request->user()->id,
        ]);

        return response()->json(['data' => $this->obligation($obligation)], 201);
    }

    /** @return array<string, mixed> */
    private function validatedRule(Request $request): array
    {
        $taxRule = $request->route('taxRule');

        return $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'code' => [
                'required',
                'string',
                'max:48',
                'regex:/^[A-Za-z0-9._-]+$/',
                Rule::unique('tax_rules', 'code')
                    ->where('organization_id', app(TenantContext::class)->id())
                    ->ignore($taxRule?->id),
            ],
            'tax_type' => ['required', Rule::in(['vat', 'sales_tax', 'gst', 'withholding', 'payroll', 'corporate', 'customs', 'excise', 'property', 'other'])],
            'country_code' => ['required', 'regex:/^[A-Z]{2}$/'],
            'region_code' => ['nullable', 'string', 'max:80'],
            'applies_to' => ['required', Rule::in(['sales', 'purchases', 'both'])],
            'rate' => ['required', 'numeric', 'between:0,100'],
            'inclusive' => ['required', 'boolean'],
            'recoverable' => ['required', 'boolean'],
            'effective_from' => ['nullable', 'date_format:Y-m-d'],
            'effective_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:effective_from'],
            'active' => ['required', 'boolean'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);
    }

    /** @return array<string, mixed> */
    private function rule(TaxRule $rule): array
    {
        return [
            'id' => $rule->id,
            'name' => $rule->name,
            'code' => $rule->code,
            'tax_type' => $rule->tax_type,
            'country_code' => $rule->country_code,
            'region_code' => $rule->region_code,
            'applies_to' => $rule->applies_to,
            'rate' => $rule->rate,
            'inclusive' => (bool) $rule->inclusive,
            'recoverable' => (bool) $rule->recoverable,
            'effective_from' => $rule->effective_from?->format('Y-m-d'),
            'effective_to' => $rule->effective_to?->format('Y-m-d'),
            'active' => (bool) $rule->active,
            'notes' => $rule->notes,
        ];
    }

    /** @return array<string, mixed> */
    private function obligation(GovernmentObligation $obligation): array
    {
        return [
            'id' => $obligation->id,
            'tax_rule_id' => $obligation->tax_rule_id,
            'authority_name' => $obligation->authority_name,
            'title' => $obligation->title,
            'obligation_type' => $obligation->obligation_type,
            'country_code' => $obligation->country_code,
            'region_code' => $obligation->region_code,
            'period_start' => $obligation->period_start?->format('Y-m-d'),
            'period_end' => $obligation->period_end?->format('Y-m-d'),
            'due_date' => $obligation->due_date->format('Y-m-d'),
            'amount' => $obligation->amount,
            'paid_total' => $obligation->paid_total,
            'balance_due' => $obligation->balance_due,
            'currency' => $obligation->currency,
            'status' => $obligation->status,
            'notes' => $obligation->notes,
        ];
    }
}
