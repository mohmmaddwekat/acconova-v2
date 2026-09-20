<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\FinancialDocument;
use App\Models\FinancialDocumentLine;
use App\Models\GovernmentObligation;
use App\Models\Party;
use App\Models\Product;
use App\Models\TaxRule;
use App\Models\Warehouse;
use App\Services\FinanceAuthorization;
use App\Services\WorkspacePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FinanceLookupController extends Controller
{
    public function referencePrice(Request $request): JsonResponse
    {
        $data = $request->validate([
            'party_id' => ['required', 'integer'],
            'product_id' => ['required', 'integer'],
            'kind' => ['required', 'in:sale_invoice,purchase_invoice'],
        ]);

        FinanceAuthorization::authorize(
            $request->user(),
            $data['kind'] === 'sale_invoice'
                ? 'finance.sales.view'
                : 'finance.purchases.view',
        );

        $party = Party::query()
            ->usableForNewBusiness()
            ->findOrFail((int) $data['party_id']);

        $product = Product::query()
            ->usableForNewBusiness()
            ->findOrFail((int) $data['product_id']);

        $document = FinancialDocument::query()
            ->where('party_id', $party->id)
            ->where('kind', $data['kind'])
            ->whereIn('status', ['issued', 'partially_paid', 'paid', 'overpaid'])
            ->whereHas('lines', fn ($query) => $query->where('product_id', $product->id))
            ->orderByDesc('issue_date')
            ->orderByDesc('id')
            ->first();

        $line = $document
            ? FinancialDocumentLine::query()
                ->where('financial_document_id', $document->id)
                ->where('product_id', $product->id)
                ->orderByDesc('id')
                ->first()
            : null;

        if ($line) {
            return response()->json([
                'source' => 'party_history',
                'unit_price' => $line->unit_price,
                'document_number' => $document?->number,
                'issue_date' => $document?->issue_date?->format('Y-m-d'),
            ]);
        }

        return response()->json([
            'source' => 'catalog',
            'unit_price' => $data['kind'] === 'sale_invoice'
                ? $product->unit_price
                : $product->cost_price,
            'document_number' => null,
            'issue_date' => null,
        ]);
    }

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

        $canSalesView = FinanceAuthorization::allows($request->user(), 'finance.sales.view');
        $canSalesManage = FinanceAuthorization::allows($request->user(), 'finance.sales.manage');
        $canPurchasesView = FinanceAuthorization::allows($request->user(), 'finance.purchases.view');
        $canPurchasesManage = FinanceAuthorization::allows($request->user(), 'finance.purchases.manage');
        $canCashView = FinanceAuthorization::allows($request->user(), 'finance.cash.view');
        $canCashPay = FinanceAuthorization::allows($request->user(), 'finance.cash.pay');
        $canCashReceive = FinanceAuthorization::allows($request->user(), 'finance.cash.receive');
        $canTaxesView = FinanceAuthorization::allows($request->user(), 'finance.taxes.view');
        $canTaxesManage = FinanceAuthorization::allows($request->user(), 'finance.taxes.manage');

        $tenant = app(TenantContext::class);
        $customRole = WorkspacePermissions::custom(
            $request->user()->id,
            $tenant->id(),
        );
        $canRecurringPayments = $customRole
            ? in_array('payments.view', $customRole->permissions, true)
            : in_array($tenant->role()->value, ['owner', 'admin', 'manager', 'accountant'], true);

        $canPartyData = $canSalesView || $canPurchasesView || $canCashView;
        $canProductData = $canSalesView || $canPurchasesView;
        $canOperationalData = $canSalesManage || $canPurchasesManage || $canCashPay || $canCashReceive;
        $canTaxRules = $canSalesManage || $canPurchasesManage || $canTaxesView;
        $canObligations = $canTaxesView || $canCashPay;

        $parties = $canPartyData
            ? Party::query()
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
                ])
            : collect();

        $products = $canProductData
            ? Product::query()
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
                ])
            : collect();

        $warehouses = ($canSalesManage || $canPurchasesManage)
            ? Warehouse::query()
                ->orderByDesc('is_default')
                ->orderBy('name')
                ->get(['id', 'code', 'name', 'is_default'])
                ->map(fn (Warehouse $warehouse): array => [
                    'id' => $warehouse->id,
                    'code' => $warehouse->code,
                    'name' => $warehouse->name,
                    'is_default' => (bool) $warehouse->is_default,
                ])
            : collect();

        $taxRules = $canTaxRules
            ? TaxRule::query()
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
                ])
            : collect();

        $obligations = $canObligations
            ? GovernmentObligation::query()
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
                ])
            : collect();

        $departments = $canOperationalData
            ? Department::query()->orderBy('name')->get(['id', 'name'])
            : collect();

        $organization = app(TenantContext::class)->organization();

        $preferences = $organization->preferences ?? [];

        return response()->json([
            'currency' => $preferences['currency'] ?? 'ILS',
            'settings' => [
                'decimal_places' => (int) ($preferences['decimal_places'] ?? 2),
                'payment_methods' => array_values($preferences['payment_methods'] ?? [
                    'bank_transfer',
                    'card',
                    'cash',
                    'check',
                ]),
                'validate_check_date' => (bool) ($preferences['validate_check_date'] ?? true),
                'post_dated_checks_pending' => (bool) ($preferences['post_dated_checks_pending'] ?? true),
                'bank_accounts' => array_values($preferences['bank_accounts'] ?? []),
                'organization' => [
                    'name' => $organization->name,
                    'legal_name' => $preferences['legal_name'] ?? $organization->name,
                    'trade_name' => $preferences['trade_name'] ?? $organization->name,
                    'support_email' => $preferences['support_email'] ?? '',
                    'phone' => $preferences['phone'] ?? '',
                    'commercial_registration' => $preferences['commercial_registration'] ?? '',
                    'vat_number' => $preferences['vat_number'] ?? '',
                    'website' => $preferences['website'] ?? '',
                    'country' => $preferences['country'] ?? '',
                    'city' => $preferences['city'] ?? '',
                    'address' => $preferences['address'] ?? '',
                    'invoice_footer' => $preferences['invoice_footer'] ?? '',
                    'logo_url' => ! empty($preferences['logo_path'])
                        ? '/api/workspace-settings/logo?v='.urlencode((string) $organization->updated_at?->timestamp)
                        : null,
                ],
                'invoice' => [
                    'template' => $preferences['invoice_template'] ?? 'professional',
                    'purchase_template' => $preferences['purchase_template'] ?? 'professional',
                    'receipt_template' => $preferences['receipt_template'] ?? 'professional',
                    'accent_color' => $preferences['invoice_accent_color'] ?? '#2563EB',
                    'paper_size' => $preferences['print_paper_size'] ?? 'a4',
                    'margins' => $preferences['print_margins'] ?? 'normal',
                    'logo_position' => $preferences['logo_position'] ?? 'center',
                    'show_logo' => (bool) ($preferences['show_invoice_logo'] ?? true),
                    'show_contact' => (bool) ($preferences['show_invoice_contact'] ?? true),
                    'show_tax_number' => (bool) ($preferences['show_invoice_tax_number'] ?? true),
                    'show_notes' => (bool) ($preferences['show_invoice_notes'] ?? true),
                    'show_qr' => (bool) ($preferences['show_invoice_qr'] ?? false),
                    'columns' => array_values($preferences['invoice_columns'] ?? [
                        'description',
                        'quantity',
                        'unit_price',
                        'discount',
                        'tax',
                        'total',
                    ]),
                ],
            ],
            'parties' => $parties,
            'products' => $products,
            'warehouses' => $warehouses,
            'departments' => $departments,
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
                'recurring_payments_view' => $canRecurringPayments,
            ],
        ]);
    }
}
