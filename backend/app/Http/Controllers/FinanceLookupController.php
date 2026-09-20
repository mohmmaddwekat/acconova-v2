<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\GovernmentObligation;
use App\Models\Party;
use App\Models\Product;
use App\Models\TaxRule;
use App\Models\Warehouse;
use App\Services\FinanceAuthorization;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FinanceLookupController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        abort_unless(
            collect([
                'finance.sales.view',
                'finance.purchases.view',
                'finance.cash.view',
                'finance.taxes.view',
            ])->contains(fn (string $permission): bool => FinanceAuthorization::allows($request->user(), $permission)),
            403,
        );

        $parties = Party::query()
            ->usableForNewBusiness()
            ->with('roles')
            ->orderByRaw('COALESCE(company_name, name)')
            ->limit(500)
            ->get()
            ->map(fn (Party $party): array => [
                'id' => $party->id,
                'name' => $party->company_name ?: $party->name,
                'email' => $party->email,
                'phone' => $party->phone,
                'tax_number' => $party->tax_number,
                'country_code' => $party->country_code,
                'region_code' => $party->state,
                'roles' => $party->roles->pluck('role')->map(fn ($role) => $role->value)->values()->all(),
            ]);

        $products = Product::query()
            ->usableForNewBusiness()
            ->orderBy('name')
            ->limit(1000)
            ->get()
            ->map(fn (Product $product): array => [
                'id' => $product->id,
                'name' => $product->name,
                'sku' => $product->sku,
                'type' => $product->type->value,
                'unit' => $product->unit,
                'unit_price' => $product->unit_price,
                'cost_price' => $product->cost_price,
                'tax_rate' => $product->tax_rate,
                'track_inventory' => (bool) $product->track_inventory,
            ]);

        $warehouses = Warehouse::query()
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get(['id', 'code', 'name', 'is_default'])
            ->map(fn (Warehouse $warehouse): array => [
                'id' => $warehouse->id,
                'code' => $warehouse->code,
                'name' => $warehouse->name,
                'is_default' => (bool) $warehouse->is_default,
            ]);

        $taxRules = TaxRule::query()
            ->where('active', true)
            ->orderBy('country_code')
            ->orderBy('region_code')
            ->orderBy('name')
            ->get()
            ->map(fn (TaxRule $rule): array => [
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
            ]);

        $obligations = GovernmentObligation::query()
            ->whereIn('status', ['open', 'partial'])
            ->orderBy('due_date')
            ->get()
            ->map(fn (GovernmentObligation $obligation): array => [
                'id' => $obligation->id,
                'title' => $obligation->title,
                'authority_name' => $obligation->authority_name,
                'country_code' => $obligation->country_code,
                'region_code' => $obligation->region_code,
                'due_date' => $obligation->due_date->format('Y-m-d'),
                'amount' => $obligation->amount,
                'paid_total' => $obligation->paid_total,
                'balance_due' => $obligation->balance_due,
                'currency' => $obligation->currency,
                'status' => $obligation->status,
            ]);

        $organization = app(TenantContext::class)->organization();

        return response()->json([
            'currency' => $organization->preferences['currency'] ?? 'ILS',
            'parties' => $parties,
            'products' => $products,
            'warehouses' => $warehouses,
            'departments' => Department::query()->orderBy('name')->get(['id', 'name']),
            'tax_rules' => $taxRules,
            'government_obligations' => $obligations,
            'permissions' => [
                'sales_view' => FinanceAuthorization::allows($request->user(), 'finance.sales.view'),
                'sales_manage' => FinanceAuthorization::allows($request->user(), 'finance.sales.manage'),
                'purchases_view' => FinanceAuthorization::allows($request->user(), 'finance.purchases.view'),
                'purchases_manage' => FinanceAuthorization::allows($request->user(), 'finance.purchases.manage'),
                'cash_view' => FinanceAuthorization::allows($request->user(), 'finance.cash.view'),
                'cash_pay' => FinanceAuthorization::allows($request->user(), 'finance.cash.pay'),
                'cash_receive' => FinanceAuthorization::allows($request->user(), 'finance.cash.receive'),
                'cash_correct' => FinanceAuthorization::allows($request->user(), 'finance.cash.correct'),
                'documents_correct' => FinanceAuthorization::allows($request->user(), 'finance.documents.correct'),
                'taxes_view' => FinanceAuthorization::allows($request->user(), 'finance.taxes.view'),
                'taxes_manage' => FinanceAuthorization::allows($request->user(), 'finance.taxes.manage'),
            ],
        ]);
    }
}
