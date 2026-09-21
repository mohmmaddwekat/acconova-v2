<?php

namespace App\Http\Controllers;

use App\Models\Party;
use App\Models\Product;
use App\Services\FinanceAuthorization;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class BusinessControlController extends Controller
{
    public function lookups(
        Request $request,
    ): JsonResponse {
        $tenant = app(
            TenantContext::class,
        );
        $organizationId =
            $tenant->id();

        $canFinance =
            FinanceAuthorization::allows(
                $request->user(),
                'finance.cash.view',
            )
            || FinanceAuthorization::allows(
                $request->user(),
                'finance.purchases.view',
            )
            || FinanceAuthorization::allows(
                $request->user(),
                'finance.sales.view',
            );

        $canStaff =
            StaffController::allowed(
                'staff.view',
            )
            || StaffController::allowed(
                'staff.team_view',
            );

        $canParties =
            $request->user()?->can(
                'viewAny',
                Party::class,
            )
            ?? false;

        $departments =
            ($canFinance || $canStaff)
                ? DB::table('departments')
                    ->where(
                        'organization_id',
                        $organizationId,
                    )
                    ->orderBy('name')
                    ->get([
                        'id',
                        'name',
                    ])
                : DB::table(
                    'staff_members as staff',
                )
                    ->join(
                        'departments as department',
                        'department.id',
                        '=',
                        'staff.department_id',
                    )
                    ->where(
                        'staff.organization_id',
                        $organizationId,
                    )
                    ->where(
                        'staff.user_id',
                        $request->user()->id,
                    )
                    ->get([
                        'department.id',
                        'department.name',
                    ]);

        $parties = $canParties
            ? Party::query()
                ->usableForNewBusiness()
                ->orderByRaw(
                    'COALESCE(company_name, name)',
                )
                ->limit(500)
                ->get([
                    'id',
                    'name',
                    'company_name',
                ])
                ->map(fn (Party $party): array => [
                    'id' => $party->id,
                    'name' =>
                        $party->company_name
                        ?: $party->name,
                ])
            : collect();

        $purchaseDocuments =
            FinanceAuthorization::allows(
                $request->user(),
                'finance.purchases.view',
            )
                ? DB::table(
                    'financial_documents as document',
                )
                    ->leftJoin(
                        'parties as party',
                        'party.id',
                        '=',
                        'document.party_id',
                    )
                    ->where(
                        'document.organization_id',
                        $organizationId,
                    )
                    ->where(
                        'document.kind',
                        'purchase_invoice',
                    )
                    ->whereIn(
                        'document.status',
                        [
                            'issued',
                            'partially_paid',
                            'paid',
                            'overpaid',
                        ],
                    )
                    ->latest(
                        'document.issue_date',
                    )
                    ->limit(250)
                    ->get([
                        'document.id',
                        'document.number',
                        'document.total',
                        'document.currency',
                        'party.name as party_name',
                        'party.company_name',
                    ])
                    ->map(fn ($row): array => [
                        'id' => $row->id,
                        'number' => $row->number,
                        'total' => $row->total,
                        'currency' => $row->currency,
                        'party' =>
                            $row->company_name
                            ?: $row->party_name,
                    ])
                : collect();

        $staff = $canStaff
            ? DB::table('staff_members')
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->where('active', true)
                ->orderBy('name')
                ->limit(500)
                ->get([
                    'id',
                    'name',
                    'department_id',
                ])
            : collect();

        return response()->json([
            'currency' => strtoupper(
                (string) (
                    $tenant->organization()
                        ->preferences['currency']
                    ?? 'ILS'
                ),
            ),
            'departments' => $departments,
            'parties' => $parties,
            'purchase_documents' =>
                $purchaseDocuments,
            'staff' => $staff,
            'can_review_expense_claims' =>
                $this->canReviewExpenseClaims(
                    $request,
                ),
        ]);
    }

    public function index(
        Request $request,
        string $feature,
    ): JsonResponse {
        $this->authorizeFeature(
            $request,
            $feature,
            false,
        );

        $organizationId = app(
            TenantContext::class,
        )->id();

        $data = match ($feature) {
            'expiry-alerts' =>
                $this->expiryAlerts(
                    $organizationId,
                ),
            'landed-costs' =>
                $this->landedCosts(
                    $organizationId,
                ),
            'exchange-rates' =>
                $this->exchangeRates(
                    $organizationId,
                ),
            'budgets' =>
                $this->budgets(
                    $organizationId,
                ),
            'spending-limits' =>
                $this->spendingLimits(
                    $organizationId,
                ),
            'expense-claims' =>
                $this->expenseClaims(
                    $request,
                    $organizationId,
                ),
            'petty-cash' =>
                $this->pettyCash(
                    $organizationId,
                ),
            'recurring-expenses' =>
                $this->recurringExpenses(
                    $organizationId,
                ),
            'contracts' =>
                $this->contracts(
                    $organizationId,
                ),
            'document-expiry' =>
                $this->expiringDocuments(
                    $organizationId,
                ),
            'data-quality' =>
                $this->dataQuality(
                    $organizationId,
                ),
            default => abort(404),
        };

        return response()->json([
            'data' => $data,
        ]);
    }

    public function store(
        Request $request,
        string $feature,
    ): JsonResponse {
        $this->authorizeFeature(
            $request,
            $feature,
            true,
        );

        $organizationId = app(
            TenantContext::class,
        )->id();

        $record = match ($feature) {
            'landed-costs' =>
                $this->storeLandedCost(
                    $request,
                    $organizationId,
                ),
            'budgets' =>
                $this->storeBudget(
                    $request,
                    $organizationId,
                ),
            'spending-limits' =>
                $this->storeSpendingLimit(
                    $request,
                    $organizationId,
                ),
            'expense-claims' =>
                $this->storeExpenseClaim(
                    $request,
                    $organizationId,
                ),
            'petty-cash' =>
                $this->storePettyCashFund(
                    $request,
                    $organizationId,
                ),
            'recurring-expenses' =>
                $this->storeRecurringExpense(
                    $request,
                    $organizationId,
                ),
            'contracts' =>
                $this->storeContract(
                    $request,
                    $organizationId,
                ),
            'document-expiry' =>
                $this->storeExpiringDocument(
                    $request,
                    $organizationId,
                ),
            default => abort(404),
        };

        return response()->json([
            'data' => $record,
        ], 201);
    }

    public function update(
        Request $request,
        string $feature,
        string $record,
    ): JsonResponse {
        $this->authorizeFeature(
            $request,
            $feature,
            true,
        );

        $organizationId = app(
            TenantContext::class,
        )->id();

        $result = match ($feature) {
            'landed-costs' =>
                $this->updateLandedCost(
                    $request,
                    $organizationId,
                    (int) $record,
                ),
            'spending-limits' =>
                $this->updateSpendingLimit(
                    $request,
                    $organizationId,
                    (int) $record,
                ),
            'expense-claims' =>
                $this->updateExpenseClaim(
                    $request,
                    $organizationId,
                    (int) $record,
                ),
            'petty-cash' =>
                $this->updatePettyCashFund(
                    $request,
                    $organizationId,
                    (int) $record,
                ),
            'recurring-expenses' =>
                $this->updateRecurringExpense(
                    $request,
                    $organizationId,
                    (int) $record,
                ),
            'contracts' =>
                $this->updateContract(
                    $request,
                    $organizationId,
                    (int) $record,
                ),
            'document-expiry' =>
                $this->updateExpiringDocument(
                    $request,
                    $organizationId,
                    (int) $record,
                ),
            default => abort(404),
        };

        return response()->json([
            'data' => $result,
        ]);
    }

    public function pettyCashTransaction(
        Request $request,
        string $fund,
    ): JsonResponse {
        $this->authorizeFeature(
            $request,
            'petty-cash',
            true,
        );

        $organizationId = app(
            TenantContext::class,
        )->id();

        $data = $request->validate([
            'direction' => [
                'required',
                Rule::in([
                    'in',
                    'out',
                ]),
            ],
            'amount' => [
                'required',
                'numeric',
                'gt:0',
            ],
            'transaction_date' => [
                'nullable',
                'date_format:Y-m-d',
            ],
            'category' => [
                'nullable',
                'string',
                'max:120',
            ],
            'reference' => [
                'nullable',
                'string',
                'max:180',
            ],
            'notes' => [
                'nullable',
                'string',
                'max:3000',
            ],
        ]);

        $record = DB::transaction(
            function () use (
                $request,
                $organizationId,
                $fund,
                $data,
            ): object {
                $cashFund = DB::table(
                    'petty_cash_funds',
                )
                    ->where(
                        'organization_id',
                        $organizationId,
                    )
                    ->where(
                        'id',
                        (int) $fund,
                    )
                    ->lockForUpdate()
                    ->first();

                abort_unless(
                    $cashFund,
                    404,
                );

                if (! $cashFund->active) {
                    throw ValidationException::withMessages([
                        'fund' => [
                            'This petty cash fund is inactive.',
                        ],
                    ]);
                }

                $currentBalance =
                    $this->pettyCashBalance(
                        $organizationId,
                        $cashFund,
                    );

                $amount =
                    (float) $data['amount'];

                $projected =
                    $data['direction'] === 'in'
                        ? $currentBalance + $amount
                        : $currentBalance - $amount;

                if ($projected < -0.00005) {
                    throw ValidationException::withMessages([
                        'amount' => [
                            'Petty cash cannot be spent below zero balance.',
                        ],
                    ]);
                }

                if (
                    $projected
                    > (float) $cashFund->limit_amount
                        + 0.00005
                ) {
                    throw ValidationException::withMessages([
                        'amount' => [
                            'This transaction would exceed the petty cash fund limit.',
                        ],
                    ]);
                }

                $id = DB::table(
                    'petty_cash_transactions',
                )->insertGetId([
                    'organization_id' =>
                        $organizationId,
                    'petty_cash_fund_id' =>
                        $cashFund->id,
                    'direction' =>
                        $data['direction'],
                    'amount' =>
                        number_format(
                            $amount,
                            4,
                            '.',
                            '',
                        ),
                    'transaction_date' =>
                        $data['transaction_date']
                        ?? now()->toDateString(),
                    'category' =>
                        $data['category']
                        ?? null,
                    'reference' =>
                        $data['reference']
                        ?? null,
                    'notes' =>
                        $data['notes']
                        ?? null,
                    'created_by' =>
                        $request->user()->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                return DB::table(
                    'petty_cash_transactions',
                )->where(
                    'id',
                    $id,
                )->first();
            },
            3,
        );

        return response()->json([
            'data' => $record,
        ], 201);
    }

    private function expiryAlerts(
        int $organizationId,
    ): array {
        return DB::table(
            'inventory_batches as batch',
        )
            ->leftJoin(
                'products as product',
                'product.id',
                '=',
                'batch.product_id',
            )
            ->leftJoin(
                'warehouses as warehouse',
                'warehouse.id',
                '=',
                'batch.warehouse_id',
            )
            ->where(
                'batch.organization_id',
                $organizationId,
            )
            ->whereNotNull(
                'batch.expiry_date',
            )
            ->where(
                'batch.quantity',
                '>',
                0,
            )
            ->whereNotIn(
                'batch.status',
                [
                    'depleted',
                    'recalled',
                ],
            )
            ->orderBy(
                'batch.expiry_date',
            )
            ->get([
                'batch.id',
                'batch.product_id',
                'batch.warehouse_id',
                'batch.lot_code',
                'batch.quantity',
                'batch.expiry_date',
                'batch.status',
                'product.name as product',
                'warehouse.name as warehouse',
            ])
            ->map(function ($row): array {
                $days = CarbonImmutable::today()
                    ->diffInDays(
                        CarbonImmutable::parse(
                            $row->expiry_date,
                        ),
                        false,
                    );

                $alert = match (true) {
                    $days < 0 => 'expired',
                    $days <= 7 => 'critical',
                    $days <= 15 => 'warning',
                    $days <= 30 => 'upcoming',
                    default => 'later',
                };

                return [
                    ...((array) $row),
                    'days_until_expiry' =>
                        $days,
                    'alert_level' =>
                        $alert,
                ];
            })
            ->values()
            ->all();
    }

    private function landedCosts(
        int $organizationId,
    ): array {
        $rows = DB::table(
            'landed_costs as cost',
        )
            ->join(
                'financial_documents as document',
                'document.id',
                '=',
                'cost.purchase_document_id',
            )
            ->leftJoin(
                'parties as party',
                'party.id',
                '=',
                'document.party_id',
            )
            ->where(
                'cost.organization_id',
                $organizationId,
            )
            ->latest(
                'cost.id',
            )
            ->get([
                'cost.*',
                'document.number as document_number',
                'document.total as document_total',
                'document.currency as document_currency',
                'party.name as party_name',
                'party.company_name',
            ]);

        return $rows
            ->map(function ($row) use (
                $organizationId,
            ): array {
                $lines = DB::table(
                    'financial_document_lines as line',
                )
                    ->leftJoin(
                        'products as product',
                        'product.id',
                        '=',
                        'line.product_id',
                    )
                    ->where(
                        'line.organization_id',
                        $organizationId,
                    )
                    ->where(
                        'line.financial_document_id',
                        $row->purchase_document_id,
                    )
                    ->orderBy(
                        'line.position',
                    )
                    ->get([
                        'line.id',
                        'line.product_id',
                        'line.description',
                        'line.quantity',
                        'line.line_total',
                        'product.name as product',
                    ]);

                $basisValues =
                    $lines->map(
                        function ($line) use ($row): float {
                            return match (
                                $row->allocation_method
                            ) {
                                'quantity' =>
                                    max(
                                        (float) $line->quantity,
                                        0,
                                    ),
                                'equal' => 1.0,
                                default =>
                                    max(
                                        (float) $line->line_total,
                                        0,
                                    ),
                            };
                        },
                    );

                $basisTotal =
                    (float) $basisValues->sum();

                if (
                    $basisTotal <= 0.00005
                    && $lines->isNotEmpty()
                ) {
                    $basisValues =
                        $lines->map(
                            fn (): float => 1.0,
                        );
                    $basisTotal =
                        (float) $basisValues->sum();
                }

                $allocation = $lines
                    ->values()
                    ->map(
                        function (
                            $line,
                            int $index,
                        ) use (
                            $row,
                            $basisValues,
                            $basisTotal,
                        ): array {
                            $share =
                                $basisTotal > 0
                                    ? (
                                        (float) (
                                            $basisValues[$index]
                                            ?? 0
                                        )
                                        / $basisTotal
                                    )
                                    : 0;

                            $allocated =
                                round(
                                    (float) $row->amount
                                    * $share,
                                    4,
                                );

                            return [
                                'line_id' =>
                                    $line->id,
                                'product_id' =>
                                    $line->product_id,
                                'product' =>
                                    $line->product
                                    ?: $line->description,
                                'quantity' =>
                                    (string) $line->quantity,
                                'allocated_cost' =>
                                    number_format(
                                        $allocated,
                                        4,
                                        '.',
                                        '',
                                    ),
                                'extra_unit_cost' =>
                                    number_format(
                                        (float) $line->quantity
                                            > 0
                                            ? $allocated
                                                / (float) $line->quantity
                                            : 0,
                                        4,
                                        '.',
                                        '',
                                    ),
                            ];
                        },
                    )
                    ->all();

                return [
                    ...((array) $row),
                    'party' =>
                        $row->company_name
                        ?: $row->party_name,
                    'allocations' =>
                        $allocation,
                    'accounting_effect' =>
                        false,
                ];
            })
            ->all();
    }

    private function exchangeRates(
        int $organizationId,
    ): array {
        return DB::table(
            'exchange_rate_history as rate',
        )
            ->leftJoin(
                'financial_documents as document',
                'document.id',
                '=',
                'rate.financial_document_id',
            )
            ->leftJoin(
                'users as user',
                'user.id',
                '=',
                'rate.changed_by',
            )
            ->where(
                'rate.organization_id',
                $organizationId,
            )
            ->latest(
                'rate.recorded_at',
            )
            ->limit(500)
            ->get([
                'rate.id',
                'rate.financial_document_id',
                'rate.base_currency',
                'rate.currency',
                'rate.exchange_rate',
                'rate.source',
                'rate.recorded_at',
                'document.number as document_number',
                'document.kind as document_kind',
                'user.name as changed_by',
            ])
            ->map(fn ($row): array => [
                ...((array) $row),
                'url' =>
                    $row->financial_document_id
                        ? (
                            $row->document_kind
                                === 'purchase_invoice'
                                    ? '/app/invoices/purchases/'
                                    : '/app/invoices/sales/'
                        )
                        .$row->financial_document_id
                        : null,
            ])
            ->all();
    }

    private function budgets(
        int $organizationId,
    ): array {
        return DB::table(
            'department_budgets as budget',
        )
            ->join(
                'departments as department',
                'department.id',
                '=',
                'budget.department_id',
            )
            ->where(
                'budget.organization_id',
                $organizationId,
            )
            ->orderByDesc(
                'budget.month',
            )
            ->orderBy(
                'department.name',
            )
            ->get([
                'budget.*',
                'department.name as department',
            ])
            ->map(
                function ($row) use (
                    $organizationId,
                ): array {
                    $actual =
                        $this->departmentSpend(
                            $organizationId,
                            (int) $row->department_id,
                            (string) $row->currency,
                            CarbonImmutable::parse(
                                $row->month,
                            ),
                        );

                    $budget =
                        (float) $row->amount;

                    return [
                        ...((array) $row),
                        'actual' =>
                            number_format(
                                $actual,
                                4,
                                '.',
                                '',
                            ),
                        'variance' =>
                            number_format(
                                $budget - $actual,
                                4,
                                '.',
                                '',
                            ),
                        'usage_percent' =>
                            $budget > 0
                                ? round(
                                    $actual
                                        / $budget
                                        * 100,
                                    2,
                                )
                                : 0,
                    ];
                },
            )
            ->all();
    }

    private function spendingLimits(
        int $organizationId,
    ): array {
        $month =
            CarbonImmutable::today()
                ->startOfMonth();

        return DB::table(
            'department_spending_limits as limit',
        )
            ->join(
                'departments as department',
                'department.id',
                '=',
                'limit.department_id',
            )
            ->where(
                'limit.organization_id',
                $organizationId,
            )
            ->orderBy(
                'department.name',
            )
            ->get([
                'limit.*',
                'department.name as department',
            ])
            ->map(
                function ($row) use (
                    $organizationId,
                    $month,
                ): array {
                    $spent =
                        $this->departmentSpend(
                            $organizationId,
                            (int) $row->department_id,
                            (string) $row->currency,
                            $month,
                        );

                    $limit =
                        (float) $row->monthly_limit;

                    return [
                        ...((array) $row),
                        'month' =>
                            $month->format(
                                'Y-m',
                            ),
                        'spent' =>
                            number_format(
                                $spent,
                                4,
                                '.',
                                '',
                            ),
                        'remaining' =>
                            number_format(
                                max(
                                    $limit - $spent,
                                    0,
                                ),
                                4,
                                '.',
                                '',
                            ),
                        'usage_percent' =>
                            $limit > 0
                                ? round(
                                    $spent
                                        / $limit
                                        * 100,
                                    2,
                                )
                                : 0,
                    ];
                },
            )
            ->all();
    }

    private function expenseClaims(
        Request $request,
        int $organizationId,
    ): array {
        $canReview =
            $this->canReviewExpenseClaims(
                $request,
            );

        $query = DB::table(
            'expense_claims as claim',
        )
            ->join(
                'users as submitter',
                'submitter.id',
                '=',
                'claim.submitted_by',
            )
            ->leftJoin(
                'users as reviewer',
                'reviewer.id',
                '=',
                'claim.reviewed_by',
            )
            ->leftJoin(
                'departments as department',
                'department.id',
                '=',
                'claim.department_id',
            )
            ->where(
                'claim.organization_id',
                $organizationId,
            )
            ->latest(
                'claim.id',
            );

        if (! $canReview) {
            $query->where(
                'claim.submitted_by',
                $request->user()->id,
            );
        }

        return $query
            ->get([
                'claim.*',
                'submitter.name as submitted_by_name',
                'reviewer.name as reviewed_by_name',
                'department.name as department',
            ])
            ->map(fn ($row): array => [
                ...((array) $row),
                'can_review' =>
                    $canReview,
            ])
            ->all();
    }

    private function pettyCash(
        int $organizationId,
    ): array {
        return DB::table(
            'petty_cash_funds as fund',
        )
            ->leftJoin(
                'departments as department',
                'department.id',
                '=',
                'fund.department_id',
            )
            ->leftJoin(
                'users as custodian',
                'custodian.id',
                '=',
                'fund.custodian_user_id',
            )
            ->where(
                'fund.organization_id',
                $organizationId,
            )
            ->orderByDesc(
                'fund.active',
            )
            ->orderBy(
                'fund.name',
            )
            ->get([
                'fund.*',
                'department.name as department',
                'custodian.name as custodian',
            ])
            ->map(
                function ($row) use (
                    $organizationId,
                ): array {
                    $balance =
                        $this->pettyCashBalance(
                            $organizationId,
                            $row,
                        );

                    $outThisMonth =
                        (float) DB::table(
                            'petty_cash_transactions',
                        )
                            ->where(
                                'organization_id',
                                $organizationId,
                            )
                            ->where(
                                'petty_cash_fund_id',
                                $row->id,
                            )
                            ->where(
                                'direction',
                                'out',
                            )
                            ->whereYear(
                                'transaction_date',
                                now()->year,
                            )
                            ->whereMonth(
                                'transaction_date',
                                now()->month,
                            )
                            ->sum('amount');

                    return [
                        ...((array) $row),
                        'balance' =>
                            number_format(
                                $balance,
                                4,
                                '.',
                                '',
                            ),
                        'spent_this_month' =>
                            number_format(
                                $outThisMonth,
                                4,
                                '.',
                                '',
                            ),
                    ];
                },
            )
            ->all();
    }

    private function recurringExpenses(
        int $organizationId,
    ): array {
        return DB::table(
            'recurring_expenses as recurring',
        )
            ->leftJoin(
                'departments as department',
                'department.id',
                '=',
                'recurring.department_id',
            )
            ->leftJoin(
                'parties as party',
                'party.id',
                '=',
                'recurring.party_id',
            )
            ->where(
                'recurring.organization_id',
                $organizationId,
            )
            ->orderByDesc(
                'recurring.active',
            )
            ->orderBy(
                'recurring.next_due_on',
            )
            ->get([
                'recurring.*',
                'department.name as department',
                'party.name as party_name',
                'party.company_name',
            ])
            ->map(function ($row): array {
                $nextDue =
                    CarbonImmutable::parse(
                        $row->next_due_on,
                    );

                return [
                    ...((array) $row),
                    'party' =>
                        $row->company_name
                        ?: $row->party_name,
                    'days_until_due' =>
                        CarbonImmutable::today()
                            ->diffInDays(
                                $nextDue,
                                false,
                            ),
                    'forecast_next_30' =>
                        $row->active
                        && $nextDue->lte(
                            CarbonImmutable::today()
                                ->addDays(30),
                        )
                            ? (string) $row->amount
                            : '0.0000',
                ];
            })
            ->all();
    }

    private function contracts(
        int $organizationId,
    ): array {
        DB::table('party_contracts')
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'status',
                'active',
            )
            ->whereDate(
                'ends_on',
                '<',
                now()->toDateString(),
            )
            ->update([
                'status' => 'expired',
                'updated_at' => now(),
            ]);

        return DB::table(
            'party_contracts as contract',
        )
            ->leftJoin(
                'parties as party',
                'party.id',
                '=',
                'contract.party_id',
            )
            ->where(
                'contract.organization_id',
                $organizationId,
            )
            ->orderBy(
                'contract.ends_on',
            )
            ->get([
                'contract.*',
                'party.name as party_name',
                'party.company_name',
            ])
            ->map(function ($row): array {
                $days =
                    CarbonImmutable::today()
                        ->diffInDays(
                            CarbonImmutable::parse(
                                $row->ends_on,
                            ),
                            false,
                        );

                $alert = match (true) {
                    $days < 0 => 'expired',
                    $days <= 7 => '7_days',
                    $days <= 15 => '15_days',
                    $days <= 30 => '30_days',
                    $days <= (int) $row->reminder_days =>
                        'reminder',
                    default => 'none',
                };

                return [
                    ...((array) $row),
                    'party' =>
                        $row->company_name
                        ?: $row->party_name,
                    'days_until_expiry' =>
                        $days,
                    'alert_level' =>
                        $alert,
                ];
            })
            ->all();
    }

    private function expiringDocuments(
        int $organizationId,
    ): array {
        DB::table('expiring_documents')
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'status',
                'active',
            )
            ->whereDate(
                'expires_on',
                '<',
                now()->toDateString(),
            )
            ->update([
                'status' => 'expired',
                'updated_at' => now(),
            ]);

        return DB::table(
            'expiring_documents',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->orderBy(
                'expires_on',
            )
            ->get()
            ->map(function ($row): array {
                $days =
                    CarbonImmutable::today()
                        ->diffInDays(
                            CarbonImmutable::parse(
                                $row->expires_on,
                            ),
                            false,
                        );

                return [
                    ...((array) $row),
                    'days_until_expiry' =>
                        $days,
                    'alert_level' => match (true) {
                        $days < 0 => 'expired',
                        $days <= 7 => '7_days',
                        $days <= 15 => '15_days',
                        $days <= 30 => '30_days',
                        $days <= (int) $row->reminder_days =>
                            'reminder',
                        default => 'none',
                    },
                ];
            })
            ->all();
    }

    private function dataQuality(
        int $organizationId,
    ): array {
        $issues = collect();

        $parties = DB::table('parties')
            ->where(
                'organization_id',
                $organizationId,
            )
            ->whereNull('deleted_at')
            ->get([
                'id',
                'name',
                'company_name',
                'email',
                'phone',
                'tax_number',
            ]);

        foreach ($parties as $party) {
            $label =
                $party->company_name
                ?: $party->name
                ?: '#'.$party->id;

            if (
                ! $party->email
                && ! $party->phone
            ) {
                $issues->push([
                    'id' =>
                        'party-contact-'.$party->id,
                    'entity_type' => 'party',
                    'entity_id' => $party->id,
                    'entity' => $label,
                    'issue' =>
                        'Missing phone and email',
                    'severity' => 'high',
                    'url' =>
                        '/app/parties?focus='
                        .$party->id,
                ]);
            }
        }

        $partyGroups = $parties
            ->groupBy(
                fn ($party): string =>
                    mb_strtolower(
                        trim(
                            (string) (
                                $party->company_name
                                ?: $party->name
                                ?: ''
                            ),
                        ),
                    ),
            )
            ->filter(
                fn ($group, $key): bool =>
                    $key !== ''
                    && $group->count() > 1,
            );

        foreach ($partyGroups as $group) {
            foreach ($group as $party) {
                $issues->push([
                    'id' =>
                        'party-duplicate-'.$party->id,
                    'entity_type' => 'party',
                    'entity_id' => $party->id,
                    'entity' =>
                        $party->company_name
                        ?: $party->name
                        ?: '#'.$party->id,
                    'issue' =>
                        'Possible duplicate party name',
                    'severity' => 'warning',
                    'url' =>
                        '/app/parties?focus='
                        .$party->id,
                ]);
            }
        }

        $products = DB::table('products')
            ->where(
                'organization_id',
                $organizationId,
            )
            ->whereNull('deleted_at')
            ->get([
                'id',
                'name',
                'sku',
                'type',
                'cost_price',
            ]);

        foreach ($products as $product) {
            if (
                in_array(
                    $product->type,
                    [
                        'product',
                        'raw_material',
                    ],
                    true,
                )
                && (float) $product->cost_price <= 0
            ) {
                $issues->push([
                    'id' =>
                        'product-cost-'.$product->id,
                    'entity_type' => 'product',
                    'entity_id' => $product->id,
                    'entity' => $product->name,
                    'issue' =>
                        'Physical product has no cost',
                    'severity' => 'high',
                    'url' =>
                        '/app/products?focus='
                        .$product->id,
                ]);
            }
        }

        $productGroups = $products
            ->groupBy(
                fn ($product): string =>
                    mb_strtolower(
                        trim(
                            (string) $product->name,
                        ),
                    ),
            )
            ->filter(
                fn ($group, $key): bool =>
                    $key !== ''
                    && $group->count() > 1,
            );

        foreach ($productGroups as $group) {
            foreach ($group as $product) {
                $issues->push([
                    'id' =>
                        'product-duplicate-'.$product->id,
                    'entity_type' => 'product',
                    'entity_id' => $product->id,
                    'entity' => $product->name,
                    'issue' =>
                        'Possible duplicate product name',
                    'severity' => 'warning',
                    'url' =>
                        '/app/products?focus='
                        .$product->id,
                ]);
            }
        }

        return $issues
            ->take(500)
            ->values()
            ->all();
    }

    private function storeLandedCost(
        Request $request,
        int $organizationId,
    ): object {
        $data = $request->validate([
            'purchase_document_id' => [
                'required',
                'integer',
            ],
            'cost_type' => [
                'required',
                Rule::in([
                    'shipping',
                    'customs',
                    'insurance',
                    'handling',
                    'other',
                ]),
            ],
            'title' => [
                'required',
                'string',
                'max:180',
            ],
            'amount' => [
                'required',
                'numeric',
                'gt:0',
            ],
            'allocation_method' => [
                'required',
                Rule::in([
                    'value',
                    'quantity',
                    'equal',
                ]),
            ],
            'notes' => [
                'nullable',
                'string',
                'max:3000',
            ],
        ]);

        $document = DB::table(
            'financial_documents',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'id',
                (int) $data['purchase_document_id'],
            )
            ->where(
                'kind',
                'purchase_invoice',
            )
            ->whereIn(
                'status',
                [
                    'issued',
                    'partially_paid',
                    'paid',
                    'overpaid',
                ],
            )
            ->first();

        if (! $document) {
            throw ValidationException::withMessages([
                'purchase_document_id' => [
                    'Choose an issued purchase invoice from this workspace.',
                ],
            ]);
        }

        $id = DB::table(
            'landed_costs',
        )->insertGetId([
            'organization_id' =>
                $organizationId,
            'purchase_document_id' =>
                $document->id,
            'cost_type' =>
                $data['cost_type'],
            'title' =>
                $data['title'],
            'amount' =>
                $data['amount'],
            'currency' =>
                $document->currency,
            'allocation_method' =>
                $data['allocation_method'],
            'status' => 'draft',
            'notes' =>
                $data['notes']
                ?? null,
            'created_by' =>
                $request->user()->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return DB::table(
            'landed_costs',
        )->where(
            'id',
            $id,
        )->first();
    }

    private function storeBudget(
        Request $request,
        int $organizationId,
    ): object {
        $data = $request->validate([
            'department_id' => [
                'required',
                'integer',
            ],
            'month' => [
                'required',
                'date_format:Y-m',
            ],
            'amount' => [
                'required',
                'numeric',
                'min:0',
            ],
            'currency' => [
                'required',
                'regex:/^[A-Z]{3}$/',
            ],
            'notes' => [
                'nullable',
                'string',
                'max:3000',
            ],
        ]);

        $this->assertTenantRecord(
            'departments',
            (int) $data['department_id'],
            $organizationId,
        );

        $month = CarbonImmutable::createFromFormat(
            'Y-m-d',
            $data['month'].'-01',
        )->toDateString();

        DB::table('department_budgets')
            ->updateOrInsert([
                'organization_id' =>
                    $organizationId,
                'department_id' =>
                    (int) $data['department_id'],
                'month' => $month,
                'currency' =>
                    strtoupper(
                        $data['currency'],
                    ),
            ], [
                'amount' =>
                    $data['amount'],
                'notes' =>
                    $data['notes']
                    ?? null,
                'updated_at' => now(),
                'created_at' => now(),
            ]);

        return DB::table(
            'department_budgets',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'department_id',
                (int) $data['department_id'],
            )
            ->where(
                'month',
                $month,
            )
            ->where(
                'currency',
                strtoupper(
                    $data['currency'],
                ),
            )
            ->first();
    }

    private function storeSpendingLimit(
        Request $request,
        int $organizationId,
    ): object {
        $data = $request->validate([
            'department_id' => [
                'required',
                'integer',
            ],
            'monthly_limit' => [
                'required',
                'numeric',
                'gt:0',
            ],
            'currency' => [
                'required',
                'regex:/^[A-Z]{3}$/',
            ],
            'notes' => [
                'nullable',
                'string',
                'max:3000',
            ],
        ]);

        $this->assertTenantRecord(
            'departments',
            (int) $data['department_id'],
            $organizationId,
        );

        DB::table(
            'department_spending_limits',
        )->updateOrInsert([
            'organization_id' =>
                $organizationId,
            'department_id' =>
                (int) $data['department_id'],
            'currency' =>
                strtoupper(
                    $data['currency'],
                ),
        ], [
            'monthly_limit' =>
                $data['monthly_limit'],
            'active' => true,
            'notes' =>
                $data['notes']
                ?? null,
            'updated_at' => now(),
            'created_at' => now(),
        ]);

        return DB::table(
            'department_spending_limits',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'department_id',
                (int) $data['department_id'],
            )
            ->where(
                'currency',
                strtoupper(
                    $data['currency'],
                ),
            )
            ->first();
    }

    private function storeExpenseClaim(
        Request $request,
        int $organizationId,
    ): object {
        $data = $request->validate([
            'title' => [
                'required',
                'string',
                'max:180',
            ],
            'amount' => [
                'required',
                'numeric',
                'gt:0',
            ],
            'currency' => [
                'required',
                'regex:/^[A-Z]{3}$/',
            ],
            'expense_date' => [
                'required',
                'date_format:Y-m-d',
            ],
            'merchant' => [
                'nullable',
                'string',
                'max:180',
            ],
            'reference' => [
                'nullable',
                'string',
                'max:180',
            ],
            'notes' => [
                'nullable',
                'string',
                'max:3000',
            ],
        ]);

        $departmentId = DB::table(
            'staff_members',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'user_id',
                $request->user()->id,
            )
            ->value(
                'department_id',
            );

        $id = DB::table(
            'expense_claims',
        )->insertGetId([
            'organization_id' =>
                $organizationId,
            'submitted_by' =>
                $request->user()->id,
            'department_id' =>
                $departmentId,
            'title' =>
                $data['title'],
            'amount' =>
                $data['amount'],
            'currency' =>
                strtoupper(
                    $data['currency'],
                ),
            'expense_date' =>
                $data['expense_date'],
            'merchant' =>
                $data['merchant']
                ?? null,
            'reference' =>
                $data['reference']
                ?? null,
            'notes' =>
                $data['notes']
                ?? null,
            'status' => 'submitted',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return DB::table(
            'expense_claims',
        )->where(
            'id',
            $id,
        )->first();
    }

    private function storePettyCashFund(
        Request $request,
        int $organizationId,
    ): object {
        $data = $request->validate([
            'name' => [
                'required',
                'string',
                'max:160',
                Rule::unique(
                    'petty_cash_funds',
                    'name',
                )->where(
                    'organization_id',
                    $organizationId,
                ),
            ],
            'department_id' => [
                'nullable',
                'integer',
            ],
            'limit_amount' => [
                'required',
                'numeric',
                'gt:0',
            ],
            'opening_balance' => [
                'nullable',
                'numeric',
                'min:0',
            ],
            'currency' => [
                'required',
                'regex:/^[A-Z]{3}$/',
            ],
            'notes' => [
                'nullable',
                'string',
                'max:3000',
            ],
        ]);

        if (! empty($data['department_id'])) {
            $this->assertTenantRecord(
                'departments',
                (int) $data['department_id'],
                $organizationId,
            );
        }

        $opening =
            (float) (
                $data['opening_balance']
                ?? 0
            );

        if (
            $opening
            > (float) $data['limit_amount']
                + 0.00005
        ) {
            throw ValidationException::withMessages([
                'opening_balance' => [
                    'Opening balance cannot exceed the fund limit.',
                ],
            ]);
        }

        $id = DB::table(
            'petty_cash_funds',
        )->insertGetId([
            'organization_id' =>
                $organizationId,
            'department_id' =>
                $data['department_id']
                ?? null,
            'custodian_user_id' =>
                $request->user()->id,
            'name' =>
                $data['name'],
            'currency' =>
                strtoupper(
                    $data['currency'],
                ),
            'limit_amount' =>
                $data['limit_amount'],
            'opening_balance' =>
                $opening,
            'active' => true,
            'notes' =>
                $data['notes']
                ?? null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return DB::table(
            'petty_cash_funds',
        )->where(
            'id',
            $id,
        )->first();
    }

    private function storeRecurringExpense(
        Request $request,
        int $organizationId,
    ): object {
        $data = $request->validate([
            'title' => [
                'required',
                'string',
                'max:180',
            ],
            'department_id' => [
                'nullable',
                'integer',
            ],
            'party_id' => [
                'nullable',
                'integer',
            ],
            'amount' => [
                'required',
                'numeric',
                'gt:0',
            ],
            'currency' => [
                'required',
                'regex:/^[A-Z]{3}$/',
            ],
            'frequency' => [
                'required',
                Rule::in([
                    'weekly',
                    'monthly',
                    'quarterly',
                    'yearly',
                ]),
            ],
            'next_due_on' => [
                'required',
                'date_format:Y-m-d',
            ],
            'notes' => [
                'nullable',
                'string',
                'max:3000',
            ],
        ]);

        if (! empty($data['department_id'])) {
            $this->assertTenantRecord(
                'departments',
                (int) $data['department_id'],
                $organizationId,
            );
        }

        if (! empty($data['party_id'])) {
            $this->assertTenantRecord(
                'parties',
                (int) $data['party_id'],
                $organizationId,
            );
        }

        $id = DB::table(
            'recurring_expenses',
        )->insertGetId([
            'organization_id' =>
                $organizationId,
            ...$data,
            'currency' =>
                strtoupper(
                    $data['currency'],
                ),
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return DB::table(
            'recurring_expenses',
        )->where(
            'id',
            $id,
        )->first();
    }

    private function storeContract(
        Request $request,
        int $organizationId,
    ): object {
        $data = $request->validate([
            'party_id' => [
                'nullable',
                'integer',
            ],
            'title' => [
                'required',
                'string',
                'max:180',
            ],
            'contract_type' => [
                'required',
                Rule::in([
                    'customer',
                    'supplier',
                    'other',
                ]),
            ],
            'starts_on' => [
                'required',
                'date_format:Y-m-d',
            ],
            'ends_on' => [
                'required',
                'date_format:Y-m-d',
                'after_or_equal:starts_on',
            ],
            'value' => [
                'nullable',
                'numeric',
                'min:0',
            ],
            'currency' => [
                'required',
                'regex:/^[A-Z]{3}$/',
            ],
            'renewal_type' => [
                'required',
                Rule::in([
                    'none',
                    'manual',
                    'auto',
                ]),
            ],
            'reminder_days' => [
                'nullable',
                'integer',
                'between:1,365',
            ],
            'notes' => [
                'nullable',
                'string',
                'max:5000',
            ],
        ]);

        if (! empty($data['party_id'])) {
            $this->assertTenantRecord(
                'parties',
                (int) $data['party_id'],
                $organizationId,
            );

            if (
                in_array(
                    $data['contract_type'],
                    ['customer', 'supplier'],
                    true,
                )
            ) {
                $hasRole = DB::table(
                    'party_roles',
                )
                    ->where(
                        'organization_id',
                        $organizationId,
                    )
                    ->where(
                        'party_id',
                        (int) $data['party_id'],
                    )
                    ->where(
                        'role',
                        $data['contract_type'],
                    )
                    ->exists();

                if (! $hasRole) {
                    throw ValidationException::withMessages([
                        'party_id' => [
                            $data['contract_type'] === 'customer'
                                ? 'Choose a party with the customer role.'
                                : 'Choose a party with the supplier role.',
                        ],
                    ]);
                }
            }
        }

        $id = DB::table(
            'party_contracts',
        )->insertGetId([
            'organization_id' =>
                $organizationId,
            ...$data,
            'value' =>
                $data['value']
                ?? 0,
            'currency' =>
                strtoupper(
                    $data['currency'],
                ),
            'reminder_days' =>
                $data['reminder_days']
                ?? 30,
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return DB::table(
            'party_contracts',
        )->where(
            'id',
            $id,
        )->first();
    }

    private function storeExpiringDocument(
        Request $request,
        int $organizationId,
    ): object {
        $data = $request->validate([
            'subject_type' => [
                'required',
                Rule::in([
                    'party',
                    'staff',
                    'organization',
                    'other',
                ]),
            ],
            'subject_id' => [
                'nullable',
                'integer',
            ],
            'subject_label' => [
                'nullable',
                'string',
                'max:180',
            ],
            'document_type' => [
                'required',
                'string',
                'max:120',
            ],
            'document_number' => [
                'nullable',
                'string',
                'max:180',
            ],
            'issued_on' => [
                'nullable',
                'date_format:Y-m-d',
            ],
            'expires_on' => [
                'required',
                'date_format:Y-m-d',
                'after_or_equal:issued_on',
            ],
            'reminder_days' => [
                'nullable',
                'integer',
                'between:1,365',
            ],
            'notes' => [
                'nullable',
                'string',
                'max:3000',
            ],
        ]);

        if (
            ! empty($data['subject_id'])
            && in_array(
                $data['subject_type'],
                [
                    'party',
                    'staff',
                ],
                true,
            )
        ) {
            $this->assertTenantRecord(
                $data['subject_type'] === 'party'
                    ? 'parties'
                    : 'staff_members',
                (int) $data['subject_id'],
                $organizationId,
            );
        }

        $subjectLabel =
            $data['subject_label']
            ?? null;

        if (
            ! empty($data['subject_id'])
            && $data['subject_type']
                === 'party'
        ) {
            $party = DB::table('parties')
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->where(
                    'id',
                    (int) $data['subject_id'],
                )
                ->first([
                    'name',
                    'company_name',
                ]);

            $subjectLabel =
                $party?->company_name
                ?: $party?->name;
        }

        if (
            ! empty($data['subject_id'])
            && $data['subject_type']
                === 'staff'
        ) {
            $subjectLabel =
                DB::table('staff_members')
                    ->where(
                        'organization_id',
                        $organizationId,
                    )
                    ->where(
                        'id',
                        (int) $data['subject_id'],
                    )
                    ->value('name');
        }

        if (
            $data['subject_type']
                === 'organization'
        ) {
            $subjectLabel =
                app(TenantContext::class)
                    ->organization()
                    ->name;
        }

        $id = DB::table(
            'expiring_documents',
        )->insertGetId([
            'organization_id' =>
                $organizationId,
            ...$data,
            'subject_label' =>
                $subjectLabel,
            'reminder_days' =>
                $data['reminder_days']
                ?? 30,
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return DB::table(
            'expiring_documents',
        )->where(
            'id',
            $id,
        )->first();
    }

    private function updateLandedCost(
        Request $request,
        int $organizationId,
        int $record,
    ): object {
        $data = $request->validate([
            'status' => [
                'required',
                Rule::in([
                    'draft',
                    'allocated',
                ]),
            ],
        ]);

        $current = $this->tenantRecord(
            'landed_costs',
            $record,
            $organizationId,
        );

        if (
            $current->status === 'allocated'
            && $data['status'] === 'draft'
        ) {
            throw ValidationException::withMessages([
                'status' => [
                    'Allocated landed cost worksheets are locked. Create a new adjustment instead of reopening one.',
                ],
            ]);
        }

        DB::table('landed_costs')
            ->where('id', $record)
            ->update([
                'status' => $data['status'],
                'allocated_at' =>
                    $data['status'] === 'allocated'
                        ? ($current->allocated_at ?? now())
                        : null,
                'updated_at' => now(),
            ]);

        return $this->tenantRecord(
            'landed_costs',
            $record,
            $organizationId,
        );
    }

    private function updateSpendingLimit(
        Request $request,
        int $organizationId,
        int $record,
    ): object {
        $data = $request->validate([
            'active' => [
                'required',
                'boolean',
            ],
        ]);

        $this->tenantRecord(
            'department_spending_limits',
            $record,
            $organizationId,
        );

        DB::table(
            'department_spending_limits',
        )
            ->where('id', $record)
            ->update([
                'active' =>
                    $data['active'],
                'updated_at' => now(),
            ]);

        return $this->tenantRecord(
            'department_spending_limits',
            $record,
            $organizationId,
        );
    }

    private function updateExpenseClaim(
        Request $request,
        int $organizationId,
        int $record,
    ): object {
        if (
            ! $this->canReviewExpenseClaims(
                $request,
            )
        ) {
            abort(403);
        }

        $data = $request->validate([
            'status' => [
                'required',
                Rule::in([
                    'approved',
                    'rejected',
                    'paid',
                ]),
            ],
            'rejection_reason' => [
                'nullable',
                'string',
                'max:1000',
                'required_if:status,rejected',
            ],
            'payout_reference' => [
                'nullable',
                'string',
                'max:180',
                'required_if:status,paid',
            ],
        ]);

        $current = $this->tenantRecord(
            'expense_claims',
            $record,
            $organizationId,
        );

        $allowed = [
            'submitted' => [
                'approved',
                'rejected',
            ],
            'approved' => [
                'paid',
                'rejected',
            ],
            'rejected' => [],
            'paid' => [],
        ];

        if (
            ! in_array(
                $data['status'],
                $allowed[$current->status]
                    ?? [],
                true,
            )
        ) {
            throw ValidationException::withMessages([
                'status' => [
                    'This expense claim status transition is not allowed.',
                ],
            ]);
        }

        DB::table('expense_claims')
            ->where('id', $record)
            ->update([
                'status' =>
                    $data['status'],
                'reviewed_by' =>
                    $request->user()->id,
                'reviewed_at' => now(),
                'rejection_reason' =>
                    $data['status'] === 'rejected'
                        ? $data['rejection_reason']
                        : $current->rejection_reason,
                'payout_reference' =>
                    $data['status'] === 'paid'
                        ? $data['payout_reference']
                        : $current->payout_reference,
                'paid_at' =>
                    $data['status'] === 'paid'
                        ? now()
                        : $current->paid_at,
                'updated_at' => now(),
            ]);

        return $this->tenantRecord(
            'expense_claims',
            $record,
            $organizationId,
        );
    }

    private function updatePettyCashFund(
        Request $request,
        int $organizationId,
        int $record,
    ): object {
        $data = $request->validate([
            'active' => [
                'required',
                'boolean',
            ],
        ]);

        $this->tenantRecord(
            'petty_cash_funds',
            $record,
            $organizationId,
        );

        DB::table('petty_cash_funds')
            ->where('id', $record)
            ->update([
                'active' => $data['active'],
                'updated_at' => now(),
            ]);

        return $this->tenantRecord(
            'petty_cash_funds',
            $record,
            $organizationId,
        );
    }

    private function updateRecurringExpense(
        Request $request,
        int $organizationId,
        int $record,
    ): object {
        $data = $request->validate([
            'active' => [
                'nullable',
                'boolean',
            ],
            'advance_next_due' => [
                'nullable',
                'boolean',
            ],
        ]);

        $current = $this->tenantRecord(
            'recurring_expenses',
            $record,
            $organizationId,
        );

        $nextDue =
            CarbonImmutable::parse(
                $current->next_due_on,
            );

        if (
            $data['advance_next_due']
            ?? false
        ) {
            $nextDue = match (
                $current->frequency
            ) {
                'weekly' =>
                    $nextDue->addWeek(),
                'quarterly' =>
                    $nextDue->addMonths(3),
                'yearly' =>
                    $nextDue->addYear(),
                default =>
                    $nextDue->addMonth(),
            };
        }

        DB::table(
            'recurring_expenses',
        )
            ->where('id', $record)
            ->update([
                ...(
                    array_key_exists(
                        'active',
                        $data,
                    )
                        ? [
                            'active' =>
                                $data['active'],
                        ]
                        : []
                ),
                'next_due_on' =>
                    $nextDue->toDateString(),
                'updated_at' => now(),
            ]);

        return $this->tenantRecord(
            'recurring_expenses',
            $record,
            $organizationId,
        );
    }

    private function updateContract(
        Request $request,
        int $organizationId,
        int $record,
    ): object {
        $data = $request->validate([
            'status' => [
                'required',
                Rule::in([
                    'active',
                    'terminated',
                ]),
            ],
        ]);

        $current = $this->tenantRecord(
            'party_contracts',
            $record,
            $organizationId,
        );

        if (
            $current->status === 'expired'
            && $data['status'] === 'active'
        ) {
            throw ValidationException::withMessages([
                'status' => [
                    'Expired contracts must be renewed as a new contract period.',
                ],
            ]);
        }

        DB::table('party_contracts')
            ->where('id', $record)
            ->update([
                'status' => $data['status'],
                'updated_at' => now(),
            ]);

        return $this->tenantRecord(
            'party_contracts',
            $record,
            $organizationId,
        );
    }

    private function updateExpiringDocument(
        Request $request,
        int $organizationId,
        int $record,
    ): object {
        $data = $request->validate([
            'status' => [
                'required',
                Rule::in([
                    'active',
                    'renewed',
                ]),
            ],
        ]);

        $current = $this->tenantRecord(
            'expiring_documents',
            $record,
            $organizationId,
        );

        if (
            $current->status === 'expired'
            && $data['status'] === 'active'
        ) {
            throw ValidationException::withMessages([
                'status' => [
                    'Expired documents should be renewed with a new expiry record.',
                ],
            ]);
        }

        DB::table('expiring_documents')
            ->where('id', $record)
            ->update([
                'status' => $data['status'],
                'updated_at' => now(),
            ]);

        return $this->tenantRecord(
            'expiring_documents',
            $record,
            $organizationId,
        );
    }

    private function departmentSpend(
        int $organizationId,
        int $departmentId,
        string $currency,
        CarbonImmutable $month,
    ): float {
        return (float) DB::table(
            'cash_movements',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'department_id',
                $departmentId,
            )
            ->where(
                'currency',
                $currency,
            )
            ->where(
                'direction',
                'outgoing',
            )
            ->where(
                'status',
                'posted',
            )
            ->whereYear(
                'movement_date',
                $month->year,
            )
            ->whereMonth(
                'movement_date',
                $month->month,
            )
            ->where(function ($query): void {
                $query
                    ->where('method', '!=', 'check')
                    ->orWhereNull('check_status')
                    ->orWhereNotIn(
                        'check_status',
                        [
                            'bounced',
                            'cancelled',
                        ],
                    );
            })
            ->sum('amount');
    }

    private function pettyCashBalance(
        int $organizationId,
        object $fund,
    ): float {
        $incoming =
            (float) DB::table(
                'petty_cash_transactions',
            )
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->where(
                    'petty_cash_fund_id',
                    $fund->id,
                )
                ->where(
                    'direction',
                    'in',
                )
                ->sum('amount');

        $outgoing =
            (float) DB::table(
                'petty_cash_transactions',
            )
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->where(
                    'petty_cash_fund_id',
                    $fund->id,
                )
                ->where(
                    'direction',
                    'out',
                )
                ->sum('amount');

        return (float) $fund->opening_balance
            + $incoming
            - $outgoing;
    }

    private function canReviewExpenseClaims(
        Request $request,
    ): bool {
        return FinanceAuthorization::allows(
            $request->user(),
            'finance.cash.pay',
        )
            || StaffController::allowed(
                'staff.manage',
            )
            || StaffController::allowed(
                'staff.team_manage',
            );
    }

    private function tenantRecord(
        string $table,
        int $id,
        int $organizationId,
    ): object {
        $row = DB::table($table)
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where('id', $id)
            ->first();

        abort_unless(
            $row,
            404,
        );

        return $row;
    }

    private function assertTenantRecord(
        string $table,
        int $id,
        int $organizationId,
    ): void {
        $this->tenantRecord(
            $table,
            $id,
            $organizationId,
        );
    }

    private function authorizeFeature(
        Request $request,
        string $feature,
        bool $manage,
    ): void {
        if ($feature === 'expiry-alerts') {
            abort_unless(
                $request->user()?->can(
                    'viewAny',
                    Product::class,
                ),
                403,
            );

            return;
        }

        if ($feature === 'landed-costs') {
            FinanceAuthorization::authorize(
                $request->user(),
                $manage
                    ? 'finance.purchases.manage'
                    : 'finance.purchases.view',
            );

            return;
        }

        if ($feature === 'exchange-rates') {
            abort_unless(
                FinanceAuthorization::allows(
                    $request->user(),
                    'finance.sales.view',
                )
                || FinanceAuthorization::allows(
                    $request->user(),
                    'finance.purchases.view',
                ),
                403,
            );

            abort_if(
                $manage,
                403,
            );

            return;
        }

        if (
            in_array(
                $feature,
                [
                    'budgets',
                    'spending-limits',
                    'petty-cash',
                    'recurring-expenses',
                ],
                true,
            )
        ) {
            FinanceAuthorization::authorize(
                $request->user(),
                $manage
                    ? 'finance.cash.pay'
                    : 'finance.cash.view',
            );

            return;
        }

        if ($feature === 'expense-claims') {
            abort_unless(
                $request->user(),
                403,
            );

            return;
        }

        if ($feature === 'contracts') {
            abort_unless(
                $request->user()?->can(
                    $manage
                        ? 'create'
                        : 'viewAny',
                    Party::class,
                ),
                403,
            );

            return;
        }

        if ($feature === 'document-expiry') {
            if ($manage) {
                abort_unless(
                    StaffController::allowed(
                        'staff.manage',
                    )
                    || StaffController::allowed(
                        'staff.team_manage',
                    )
                    || in_array(
                        app(TenantContext::class)
                            ->role()
                            ->value,
                        [
                            'owner',
                            'admin',
                            'manager',
                        ],
                        true,
                    ),
                    403,
                );

                return;
            }

            abort_unless(
                StaffController::allowed(
                    'staff.view',
                )
                || StaffController::allowed(
                    'staff.team_view',
                )
                || $request->user()?->can(
                    'viewAny',
                    Party::class,
                ),
                403,
            );

            return;
        }

        if ($feature === 'data-quality') {
            abort_if(
                $manage,
                403,
            );

            abort_unless(
                $request->user()?->can(
                    'viewAny',
                    Party::class,
                )
                || $request->user()?->can(
                    'viewAny',
                    Product::class,
                ),
                403,
            );

            return;
        }

        abort(404);
    }
}
