<?php

namespace App\Http\Controllers;

use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\PaymentPlan;
use App\Models\Product;
use App\Models\Task;
use App\Services\FinanceAuthorization;
use App\Support\TaskAccess;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BusinessPulseController extends Controller
{
    private const OPEN_DOCUMENT_STATUSES = [
        'issued',
        'partially_paid',
    ];

    public function brief(
        Request $request,
    ): JsonResponse {
        $organizationId = app(TenantContext::class)->id();
        $canSales = FinanceAuthorization::allows(
            $request->user(),
            'finance.sales.view',
        );
        $canPurchases = FinanceAuthorization::allows(
            $request->user(),
            'finance.purchases.view',
        );
        $canCash = FinanceAuthorization::allows(
            $request->user(),
            'finance.cash.view',
        );

        $overdueSales = $canSales
            ? FinancialDocument::query()
                ->where('kind', 'sale_invoice')
                ->whereIn('status', self::OPEN_DOCUMENT_STATUSES)
                ->whereDate('due_date', '<', today())
                ->where('balance_due', '>', 0)
                ->count()
            : 0;

        $overduePurchases = $canPurchases
            ? FinancialDocument::query()
                ->where('kind', 'purchase_invoice')
                ->whereIn('status', self::OPEN_DOCUMENT_STATUSES)
                ->whereDate('due_date', '<', today())
                ->where('balance_due', '>', 0)
                ->count()
            : 0;

        $lowStock = Product::query()
            ->where('track_inventory', true)
            ->where('low_stock_threshold', '>', 0)
            ->withSum(
                'inventoryBalances as on_hand_total',
                'on_hand',
            )
            ->get([
                'id',
                'low_stock_threshold',
            ])
            ->filter(
                fn (Product $product) => (float) ($product->on_hand_total ?? 0)
                    <= (float) $product->low_stock_threshold,
            )
            ->count();

        $overdueTasks = TaskAccess::applyVisible(
            Task::query()->operational(),
            $request->user(),
        )
            ->where('status', '!=', 'completed')
            ->whereDate('due_on', '<', today())
            ->count();

        $duePayments = $canCash
            ? PaymentPlan::query()
                ->where('active', true)
                ->where('direction', 'outgoing')
                ->whereDate('next_due_on', '<=', today())
                ->count()
            : 0;

        $inactiveCustomers = $this->inactiveCustomersQuery(
            $organizationId,
            90,
        )->count();

        return response()->json([
            'data' => [
                'overdue_sales' => $overdueSales,
                'overdue_purchases' => $overduePurchases,
                'low_stock' => $lowStock,
                'overdue_tasks' => $overdueTasks,
                'due_payments' => $duePayments,
                'inactive_customers' => $inactiveCustomers,
                'generated_at' => now()->toIso8601String(),
            ],
        ]);
    }

    public function followUps(
        Request $request,
    ): JsonResponse {
        $organizationId = app(TenantContext::class)->id();

        $reminders = DB::table('record_reminders as r')
            ->leftJoin('parties as p', function ($join): void {
                $join
                    ->on('p.id', '=', 'r.record_id')
                    ->where('r.record_type', '=', 'party');
            })
            ->where('r.organization_id', $organizationId)
            ->where('r.user_id', $request->user()->id)
            ->whereNull('r.completed_at')
            ->where('r.due_at', '<=', now()->addDays(7))
            ->orderBy('r.due_at')
            ->limit(50)
            ->get([
                'r.id',
                'r.record_type',
                'r.record_id',
                'r.note',
                'r.due_at',
                'p.name',
                'p.company_name',
            ])
            ->map(fn ($row) => [
                'id' => $row->id,
                'record_type' => $row->record_type,
                'record_id' => $row->record_id,
                'name' => $row->company_name
                    ?: $row->name
                    ?: '#'.$row->record_id,
                'note' => $row->note,
                'due_at' => $row->due_at,
                'overdue' => CarbonImmutable::parse($row->due_at)->isPast(),
                'url' => $row->record_type === 'party'
                    ? '/app/parties?focus='.$row->record_id
                    : '/app',
            ])
            ->values();

        $overdueInvoices = FinanceAuthorization::allows(
            $request->user(),
            'finance.sales.view',
        )
            ? FinancialDocument::query()
                ->where('kind', 'sale_invoice')
                ->whereIn('status', self::OPEN_DOCUMENT_STATUSES)
                ->whereDate('due_date', '<', today())
                ->where('balance_due', '>', 0)
                ->with('party:id,name,company_name')
                ->orderBy('due_date')
                ->limit(50)
                ->get()
                ->map(fn (FinancialDocument $document) => [
                    'id' => $document->id,
                    'number' => $document->number,
                    'party_id' => $document->party_id,
                    'party_name' => $document->party?->company_name
                        ?: $document->party?->name,
                    'due_date' => $document->due_date?->format('Y-m-d'),
                    'balance_due' => $document->balance_due,
                    'currency' => $document->currency,
                    'url' => '/app/invoices/sales/'.$document->id,
                ])
                ->values()
            : collect();

        $inactive = $this->inactiveCustomersQuery(
            $organizationId,
            90,
        )
            ->orderByRaw(
                "COALESCE(NULLIF(company_name, ''), NULLIF(name, ''))",
            )
            ->limit(50)
            ->get([
                'id',
                'name',
                'company_name',
                'email',
                'phone',
                'updated_at',
            ])
            ->map(fn (Party $party) => [
                'id' => $party->id,
                'name' => $party->company_name
                    ?: $party->name
                    ?: '#'.$party->id,
                'email' => $party->email,
                'phone' => $party->phone,
                'last_known_activity' => $party->updated_at?->toIso8601String(),
                'url' => '/app/parties?focus='.$party->id,
            ])
            ->values();

        $missingContact = Party::query()
            ->whereHas('roles', fn ($query) => $query->where('role', 'customer'),
            )
            ->where(function ($query): void {
                $query
                    ->where(function ($inner): void {
                        $inner
                            ->whereNull('email')
                            ->orWhere('email', '');
                    })
                    ->orWhere(function ($inner): void {
                        $inner
                            ->whereNull('phone')
                            ->orWhere('phone', '');
                    });
            })
            ->limit(50)
            ->get([
                'id',
                'name',
                'company_name',
                'email',
                'phone',
            ])
            ->map(fn (Party $party) => [
                'id' => $party->id,
                'name' => $party->company_name
                    ?: $party->name
                    ?: '#'.$party->id,
                'email' => $party->email,
                'phone' => $party->phone,
                'url' => '/app/parties?focus='.$party->id,
            ])
            ->values();

        return response()->json([
            'data' => [
                'reminders' => $reminders,
                'overdue_invoices' => $overdueInvoices,
                'inactive_customers' => $inactive,
                'missing_contact' => $missingContact,
            ],
        ]);
    }

    public function cashflow(
        Request $request,
    ): JsonResponse {
        $data = $request->validate([
            'month' => [
                'nullable',
                'date_format:Y-m',
            ],
        ]);

        $month = isset($data['month'])
            ? CarbonImmutable::createFromFormat(
                'Y-m',
                $data['month'],
            )->startOfMonth()
            : CarbonImmutable::today()->startOfMonth();

        $start = $month->startOfMonth();
        $end = $month->endOfMonth();

        $rows = collect();

        if (FinanceAuthorization::allows(
            $request->user(),
            'finance.sales.view',
        )) {
            FinancialDocument::query()
                ->where('kind', 'sale_invoice')
                ->whereIn('status', self::OPEN_DOCUMENT_STATUSES)
                ->whereBetween('due_date', [
                    $start->format('Y-m-d'),
                    $end->format('Y-m-d'),
                ])
                ->where('balance_due', '>', 0)
                ->get([
                    'id',
                    'number',
                    'due_date',
                    'balance_due',
                    'currency',
                ])
                ->each(function (FinancialDocument $document) use ($rows): void {
                    $rows->push([
                        'key' => 'sale-'.$document->id,
                        'date' => $document->due_date?->format('Y-m-d'),
                        'direction' => 'incoming',
                        'kind' => 'invoice',
                        'label' => $document->number,
                        'amount' => $document->balance_due,
                        'currency' => $document->currency,
                        'url' => '/app/invoices/sales/'.$document->id,
                    ]);
                });
        }

        if (FinanceAuthorization::allows(
            $request->user(),
            'finance.purchases.view',
        )) {
            FinancialDocument::query()
                ->where('kind', 'purchase_invoice')
                ->whereIn('status', self::OPEN_DOCUMENT_STATUSES)
                ->whereBetween('due_date', [
                    $start->format('Y-m-d'),
                    $end->format('Y-m-d'),
                ])
                ->where('balance_due', '>', 0)
                ->get([
                    'id',
                    'number',
                    'due_date',
                    'balance_due',
                    'currency',
                ])
                ->each(function (FinancialDocument $document) use ($rows): void {
                    $rows->push([
                        'key' => 'purchase-'.$document->id,
                        'date' => $document->due_date?->format('Y-m-d'),
                        'direction' => 'outgoing',
                        'kind' => 'invoice',
                        'label' => $document->number,
                        'amount' => $document->balance_due,
                        'currency' => $document->currency,
                        'url' => '/app/invoices/purchases/'.$document->id,
                    ]);
                });
        }

        if (FinanceAuthorization::allows(
            $request->user(),
            'finance.cash.view',
        )) {
            PaymentPlan::query()
                ->where('active', true)
                ->whereBetween('next_due_on', [
                    $start->format('Y-m-d'),
                    $end->format('Y-m-d'),
                ])
                ->get()
                ->each(function (PaymentPlan $plan) use ($rows): void {
                    $rows->push([
                        'key' => 'plan-'.$plan->id,
                        'date' => $plan->next_due_on?->format('Y-m-d'),
                        'direction' => $plan->direction,
                        'kind' => 'recurring_payment',
                        'label' => $plan->title,
                        'amount' => $plan->amount,
                        'currency' => $plan->currency,
                        'url' => '/app/payments?view=recurring',
                    ]);
                });
        }

        $grouped = $rows
            ->sortBy('date')
            ->groupBy('date')
            ->map(function ($items, $date) {
                return [
                    'date' => $date,
                    'incoming' => number_format(
                        (float) $items
                            ->where('direction', 'incoming')
                            ->sum(fn ($item) => (float) $item['amount']),
                        4,
                        '.',
                        '',
                    ),
                    'outgoing' => number_format(
                        (float) $items
                            ->where('direction', 'outgoing')
                            ->sum(fn ($item) => (float) $item['amount']),
                        4,
                        '.',
                        '',
                    ),
                    'items' => $items->values(),
                ];
            })
            ->values();

        return response()->json([
            'data' => [
                'month' => $month->format('Y-m'),
                'days' => $grouped,
            ],
        ]);
    }

    public function anomalies(
        Request $request,
    ): JsonResponse {
        $organizationId = app(TenantContext::class)->id();
        $items = collect();

        if (FinanceAuthorization::allows(
            $request->user(),
            'finance.sales.view',
        )) {
            $balances = DB::table('financial_documents as d')
                ->leftJoin('parties as p', 'p.id', '=', 'd.party_id')
                ->where('d.organization_id', $organizationId)
                ->where('d.kind', 'sale_invoice')
                ->whereIn('d.status', self::OPEN_DOCUMENT_STATUSES)
                ->where('d.balance_due', '>', 0)
                ->whereNotNull('d.party_id')
                ->selectRaw(
                    'd.party_id,
                     COALESCE(p.company_name, p.name) as party_name,
                     SUM(d.balance_due) as outstanding,
                     MIN(d.currency) as currency',
                )
                ->groupBy(
                    'd.party_id',
                    'p.company_name',
                    'p.name',
                )
                ->get();

            $positiveAverage = (float) (
                $balances->avg(
                    fn ($row) => (float) $row->outstanding,
                )
                ?: 0
            );

            if ($positiveAverage > 0) {
                $balances
                    ->filter(
                        fn ($row) => (float) $row->outstanding
                            >= $positiveAverage * 3,
                    )
                    ->sortByDesc(
                        fn ($row) => (float) $row->outstanding,
                    )
                    ->take(20)
                    ->each(function ($row) use ($items, $positiveAverage): void {
                        $items->push([
                            'key' => 'party-balance-'.$row->party_id,
                            'severity' => 'review',
                            'kind' => 'unusual_customer_balance',
                            'title' => $row->party_name
                                ?: '#'.$row->party_id,
                            'detail' => number_format(
                                (float) $row->outstanding,
                                2,
                            )
                                .' '.$row->currency
                                .' · ~'
                                .number_format(
                                    (float) $row->outstanding
                                    / $positiveAverage,
                                    1,
                                )
                                .'× average open customer balance',
                            'url' => '/app/parties?focus='.$row->party_id,
                        ]);
                    });
            }
        }

        Product::query()
            ->where(function ($query): void {
                $query
                    ->whereNull('cost_price')
                    ->orWhere('cost_price', '<=', 0);
            })
            ->limit(50)
            ->get([
                'id',
                'name',
                'sku',
            ])
            ->each(function (Product $product) use ($items): void {
                $items->push([
                    'key' => 'no-cost-'.$product->id,
                    'severity' => 'warning',
                    'kind' => 'product_without_cost',
                    'title' => $product->name,
                    'detail' => $product->sku,
                    'url' => '/app/products?focus='.$product->id,
                ]);
            });

        if (
            FinanceAuthorization::allows(
                $request->user(),
                'finance.sales.view',
            )
            || FinanceAuthorization::allows(
                $request->user(),
                'finance.purchases.view',
            )
        ) {
            DB::table('financial_documents')
                ->where('organization_id', $organizationId)
                ->whereNotIn('status', ['draft', 'voided'])
                ->selectRaw(
                    'kind, party_id, issue_date, total, COUNT(*) as duplicate_count, MIN(id) as first_id',
                )
                ->groupBy(
                    'kind',
                    'party_id',
                    'issue_date',
                    'total',
                )
                ->havingRaw('COUNT(*) > 1')
                ->limit(30)
                ->get()
                ->each(function ($duplicate) use ($items): void {
                    $items->push([
                        'key' => 'duplicate-'.$duplicate->first_id,
                        'severity' => 'review',
                        'kind' => 'possible_duplicate_invoice',
                        'title' => 'Possible duplicate invoice',
                        'detail' => $duplicate->duplicate_count
                            .' records · '
                            .$duplicate->issue_date
                            .' · '
                            .$duplicate->total,
                        'url' => $duplicate->kind === 'sale_invoice'
                            ? '/app/invoices/sales/'.$duplicate->first_id
                            : '/app/invoices/purchases/'.$duplicate->first_id,
                    ]);
                });

            DB::table('financial_document_lines as l')
                ->join(
                    'financial_documents as d',
                    'd.id',
                    '=',
                    'l.financial_document_id',
                )
                ->leftJoin(
                    'products as p',
                    'p.id',
                    '=',
                    'l.product_id',
                )
                ->where('d.organization_id', $organizationId)
                ->whereNotIn('d.status', ['draft', 'voided'])
                ->whereNotNull('l.product_id')
                ->orderByDesc('l.id')
                ->limit(1500)
                ->get([
                    'l.id',
                    'l.product_id',
                    'l.unit_price',
                    'l.description',
                    'd.id as document_id',
                    'd.kind',
                    'p.name as product_name',
                    'p.unit_price as catalog_price',
                    'p.cost_price as cost_price',
                ])
                ->filter(function ($row): bool {
                    $baseline = $row->kind === 'sale_invoice'
                        ? (float) $row->catalog_price
                        : (float) $row->cost_price;
                    $entered = (float) $row->unit_price;

                    if ($baseline <= 0 || $entered <= 0) {
                        return false;
                    }

                    $ratio = $entered / $baseline;

                    return $ratio >= 3
                        || $ratio <= (1 / 3);
                })
                ->take(40)
                ->each(function ($row) use ($items): void {
                    $items->push([
                        'key' => 'price-'.$row->id,
                        'severity' => 'warning',
                        'kind' => 'unusual_price',
                        'title' => $row->product_name
                            ?: $row->description,
                        'detail' => $row->unit_price,
                        'url' => $row->kind === 'sale_invoice'
                            ? '/app/invoices/sales/'.$row->document_id
                            : '/app/invoices/purchases/'.$row->document_id,
                    ]);
                });
        }

        if (FinanceAuthorization::allows(
            $request->user(),
            'finance.cash.view',
        )) {
            $recent = DB::table('cash_movements')
                ->where('organization_id', $organizationId)
                ->where('status', 'posted')
                ->where('direction', 'outgoing')
                ->latest('movement_date')
                ->limit(200)
                ->get([
                    'id',
                    'number',
                    'amount',
                    'currency',
                ]);

            $average = $recent->avg(
                fn ($row) => (float) $row->amount,
            ) ?: 0;

            if ($average > 0) {
                $recent
                    ->filter(
                        fn ($row) => (float) $row->amount
                            >= $average * 3,
                    )
                    ->take(20)
                    ->each(function ($row) use ($items, $average): void {
                        $items->push([
                            'key' => 'cash-'.$row->id,
                            'severity' => 'review',
                            'kind' => 'large_payment',
                            'title' => $row->number,
                            'detail' => number_format(
                                (float) $row->amount,
                                2,
                            )
                                .' '.$row->currency
                                .' · ~'
                                .number_format(
                                    (float) $row->amount / $average,
                                    1,
                                )
                                .'× recent average',
                            'url' => '/app/payments/'.$row->id,
                        ]);
                    });
            }
        }

        return response()->json([
            'data' => [
                'items' => $items->values(),
                'generated_at' => now()->toIso8601String(),
            ],
        ]);
    }

    private function inactiveCustomersQuery(
        int $organizationId,
        int $days,
    ) {
        $cutoff = now()
            ->subDays($days);

        return Party::query()
            ->whereHas('roles', fn ($query) => $query->where('role', 'customer'),
            )
            ->where('parties.updated_at', '<', $cutoff)
            ->whereNotExists(function ($query) use ($organizationId, $cutoff): void {
                $query
                    ->selectRaw('1')
                    ->from('financial_documents')
                    ->whereColumn(
                        'financial_documents.party_id',
                        'parties.id',
                    )
                    ->where(
                        'financial_documents.organization_id',
                        $organizationId,
                    )
                    ->where(
                        'financial_documents.updated_at',
                        '>=',
                        $cutoff,
                    );
            })
            ->whereNotExists(function ($query) use ($organizationId, $cutoff): void {
                $query
                    ->selectRaw('1')
                    ->from('cash_movements')
                    ->whereColumn(
                        'cash_movements.party_id',
                        'parties.id',
                    )
                    ->where(
                        'cash_movements.organization_id',
                        $organizationId,
                    )
                    ->where(
                        'cash_movements.updated_at',
                        '>=',
                        $cutoff,
                    );
            });
    }
}
