<?php

namespace App\Http\Controllers;

use App\Models\CashMovement;
use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\PartyOpeningBalance;
use App\Services\FinanceAuthorization;
use App\Tenancy\TenantContext;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

class PartyAccountController extends Controller
{
    public function show(
        Request $request,
        string $party,
    ): JsonResponse {
        $party = Party::withTrashed()
            ->with('roles')
            ->findOrFail($party);

        abort_unless(
            $request->user()?->can('view', $party),
            403,
        );

        $canSales =
            FinanceAuthorization::allows(
                $request->user(),
                'finance.sales.view',
            );

        $canPurchases =
            FinanceAuthorization::allows(
                $request->user(),
                'finance.purchases.view',
            );

        $canCash =
            FinanceAuthorization::allows(
                $request->user(),
                'finance.cash.view',
            );

        abort_unless(
            $canSales
            || $canPurchases
            || $canCash,
            403,
        );

        $data = $request->validate([
            'scope' => [
                'sometimes',
                Rule::in([
                    'all',
                    'customer',
                    'supplier',
                ]),
            ],
            'date_from' => [
                'sometimes',
                'date_format:Y-m-d',
            ],
            'date_to' => [
                'sometimes',
                'date_format:Y-m-d',
                'after_or_equal:date_from',
            ],
        ]);

        $organization =
            app(TenantContext::class)
                ->organization();

        $preferences =
            $organization->preferences
            ?? [];

        $currency =
            strtoupper(
                (string) (
                    $preferences['currency']
                    ?? 'ILS'
                ),
            );

        $dateFrom = isset($data['date_from'])
            ? Carbon::parse($data['date_from'])->startOfDay()
            : now()->startOfYear();

        $dateTo = isset($data['date_to'])
            ? Carbon::parse($data['date_to'])->endOfDay()
            : now()->endOfDay();

        $roles =
            $party->roles
                ->pluck('role')
                ->map(
                    fn ($role): string =>
                        $role instanceof \BackedEnum
                            ? (string) $role->value
                            : (string) $role,
                )
                ->values()
                ->all();

        $scope =
            (string) (
                $data['scope']
                ?? (
                    in_array(
                        'customer',
                        $roles,
                        true,
                    )
                    && in_array(
                        'supplier',
                        $roles,
                        true,
                    )
                        ? 'all'
                        : (
                            in_array(
                                'supplier',
                                $roles,
                                true,
                            )
                                ? 'supplier'
                                : 'customer'
                        )
                )
            );

        $openingRows =
            PartyOpeningBalance::query()
                ->where(
                    'party_id',
                    $party->id,
                )
                ->get()
                ->keyBy('side');

        $customerOpening =
            $openingRows->get('customer');

        $supplierOpening =
            $openingRows->get('supplier');

        $customerCutoff =
            $customerOpening?->as_of_date
                ? $customerOpening
                    ->as_of_date
                    ->copy()
                    ->startOfDay()
                : null;

        $supplierCutoff =
            $supplierOpening?->as_of_date
                ? $supplierOpening
                    ->as_of_date
                    ->copy()
                    ->startOfDay()
                : null;

        $entries = collect();

        if (
            $customerOpening
            && $canSales
        ) {
            $entries->push(
                $this->openingEntry(
                    $customerOpening,
                    'customer',
                    $currency,
                ),
            );
        }

        if (
            $supplierOpening
            && $canPurchases
        ) {
            $entries->push(
                $this->openingEntry(
                    $supplierOpening,
                    'supplier',
                    $currency,
                ),
            );
        }

        $activeStatuses = [
            'issued',
            'partially_paid',
            'paid',
            'overpaid',
        ];

        if ($canSales) {
            FinancialDocument::query()
                ->where(
                    'party_id',
                    $party->id,
                )
                ->where(
                    'kind',
                    'sale_invoice',
                )
                ->whereIn(
                    'status',
                    $activeStatuses,
                )
                ->when(
                    $customerCutoff,
                    fn ($query) =>
                        $query->whereDate(
                            'issue_date',
                            '>',
                            $customerCutoff
                                ->toDateString(),
                        ),
                )
                ->whereDate(
                    'issue_date',
                    '<=',
                    $dateTo
                        ->toDateString(),
                )
                ->orderBy('issue_date')
                ->orderBy('id')
                ->get()
                ->each(
                    fn (
                        FinancialDocument $document,
                    ) =>
                        $entries->push(
                            $this->documentEntry(
                                $document,
                                'customer',
                            ),
                        ),
                );
        }

        if ($canPurchases) {
            FinancialDocument::query()
                ->where(
                    'party_id',
                    $party->id,
                )
                ->where(
                    'kind',
                    'purchase_invoice',
                )
                ->whereIn(
                    'status',
                    $activeStatuses,
                )
                ->when(
                    $supplierCutoff,
                    fn ($query) =>
                        $query->whereDate(
                            'issue_date',
                            '>',
                            $supplierCutoff
                                ->toDateString(),
                        ),
                )
                ->whereDate(
                    'issue_date',
                    '<=',
                    $dateTo
                        ->toDateString(),
                )
                ->orderBy('issue_date')
                ->orderBy('id')
                ->get()
                ->each(
                    fn (
                        FinancialDocument $document,
                    ) =>
                        $entries->push(
                            $this->documentEntry(
                                $document,
                                'supplier',
                            ),
                        ),
                );
        }

        if ($canCash) {
            CashMovement::query()
                ->where(
                    'party_id',
                    $party->id,
                )
                ->where(
                    'status',
                    'posted',
                )
                ->whereDate(
                    'movement_date',
                    '<=',
                    $dateTo
                        ->toDateString(),
                )
                ->where(function ($query): void {
                    $query
                        ->where(
                            'method',
                            '!=',
                            'check',
                        )
                        ->orWhereNull(
                            'check_status',
                        )
                        ->orWhereNotIn(
                            'check_status',
                            [
                                'bounced',
                                'cancelled',
                            ],
                        );
                })
                ->withSum(
                    'allocations as allocated_total',
                    'amount',
                )
                ->orderBy(
                    'movement_date',
                )
                ->orderBy('id')
                ->get()
                ->each(function (
                    CashMovement $movement,
                ) use (
                    $entries,
                    $customerCutoff,
                    $supplierCutoff,
                ): void {
                    $side =
                        $this->movementSide(
                            $movement,
                        );

                    if ($side === null) {
                        return;
                    }

                    $cutoff =
                        $side === 'customer'
                            ? $customerCutoff
                            : $supplierCutoff;

                    if (
                        $cutoff
                        && $movement
                            ->movement_date
                            ->lte($cutoff)
                    ) {
                        return;
                    }

                    $entries->push(
                        $this->cashEntry(
                            $movement,
                            $side,
                        ),
                    );
                });
        }

        $entries =
            $entries
                ->sortBy(
                    fn (
                        array $entry,
                    ): string =>
                        $entry['date']
                        .'|'
                        .$entry['sort_key'],
                )
                ->values();

        $customerEntries =
            $entries->where(
                'side',
                'customer',
            );

        $supplierEntries =
            $entries->where(
                'side',
                'supplier',
            );

        $customerPosition =
            $this->positionAt(
                $customerEntries,
                $dateTo,
                'customer',
            );

        $supplierPosition =
            $this->positionAt(
                $supplierEntries,
                $dateTo,
                'supplier',
            );

        $customerAdvance =
            $this->availableAdvance(
                $party->id,
                'customer',
                $dateTo,
            );

        $supplierAdvance =
            $this->availableAdvance(
                $party->id,
                'supplier',
                $dateTo,
            );

        $selected =
            $entries->filter(
                fn (
                    array $entry,
                ): bool =>
                    $scope === 'all'
                    || $entry['side']
                        === $scope,
            );

        $openingBalance =
            $selected
                ->filter(
                    function (
                        array $entry,
                    ) use (
                        $dateFrom,
                    ): bool {
                        $date =
                            Carbon::parse(
                                $entry['date'],
                            );

                        if (
                            $entry['type']
                            === 'opening_balance'
                        ) {
                            return $date
                                ->lte(
                                    $dateFrom,
                                );
                        }

                        return $date
                            ->lt(
                                $dateFrom,
                            );
                    },
                )
                ->sum(
                    fn (
                        array $entry,
                    ): float =>
                        $this->scopeEffect(
                            $entry,
                            $scope,
                        ),
                );

        $periodRows =
            $selected
                ->filter(
                    function (
                        array $entry,
                    ) use (
                        $dateFrom,
                        $dateTo,
                    ): bool {
                        $date =
                            Carbon::parse(
                                $entry['date'],
                            );

                        if (
                            $entry['type']
                            === 'opening_balance'
                            && $date
                                ->lte(
                                    $dateFrom,
                                )
                        ) {
                            return false;
                        }

                        return $date
                            ->gte(
                                $dateFrom,
                            )
                            && $date
                                ->lte(
                                    $dateTo,
                                );
                    },
                )
                ->values();

        $running =
            (float) $openingBalance;

        $rows =
            $periodRows
                ->map(
                    function (
                        array $entry,
                    ) use (
                        &$running,
                        $scope,
                    ): array {
                        $effect =
                            $this->scopeEffect(
                                $entry,
                                $scope,
                            );

                        $running +=
                            $effect;

                        return [
                            ...$entry,
                            'debit' =>
                                number_format(
                                    max(
                                        $effect,
                                        0,
                                    ),
                                    4,
                                    '.',
                                    '',
                                ),
                            'credit' =>
                                number_format(
                                    max(
                                        -$effect,
                                        0,
                                    ),
                                    4,
                                    '.',
                                    '',
                                ),
                            'balance' =>
                                number_format(
                                    $running,
                                    4,
                                    '.',
                                    '',
                                ),
                        ];
                    },
                )
                ->values();

        $invoiceTotal =
            $periodRows
                ->where(
                    'type',
                    'invoice',
                )
                ->sum(
                    fn (
                        array $entry,
                    ): float =>
                        (float) $entry['amount'],
                );

        $cashTotal =
            $periodRows
                ->where(
                    'type',
                    'cash',
                )
                ->sum(
                    fn (
                        array $entry,
                    ): float =>
                        (float) $entry['amount'],
                );

        $aging =
            $this->aging(
                $party->id,
                $scope,
                $canSales,
                $canPurchases,
                $dateTo,
            );

        return response()->json([
            'party' => [
                'id' => $party->id,
                'type' => $party->type instanceof \BackedEnum
                    ? $party->type->value
                    : (string) $party->type,
                'name' =>
                    $party->company_name
                    ?: $party->name,
                'company_name' =>
                    $party->company_name,
                'contact_name' =>
                    $party->name,
                'email' =>
                    $party->email,
                'phone' =>
                    $party->phone,
                'tax_number' =>
                    $party->tax_number,
                'credit_limit' =>
                    $party->credit_limit,
                'address' => [
                    'line_1' =>
                        $party->address_line_1,
                    'line_2' =>
                        $party->address_line_2,
                    'city' =>
                        $party->city,
                    'state' =>
                        $party->state,
                    'postal_code' =>
                        $party->postal_code,
                    'country_code' =>
                        $party->country_code,
                ],
                'notes' =>
                    $party->notes,
                'roles' =>
                    $roles,
                'archived' =>
                    $party->trashed(),
            ],
            'scope' => $scope,
            'currency' => $currency,
            'period' => [
                'date_from' =>
                    $dateFrom->toDateString(),
                'date_to' =>
                    $dateTo->toDateString(),
            ],
            'summary' => [
                'opening_balance' =>
                    number_format(
                        (float) $openingBalance,
                        4,
                        '.',
                        '',
                    ),
                'invoice_total' =>
                    number_format(
                        (float) $invoiceTotal,
                        4,
                        '.',
                        '',
                    ),
                'cash_total' =>
                    number_format(
                        (float) $cashTotal,
                        4,
                        '.',
                        '',
                    ),
                'closing_balance' =>
                    number_format(
                        (float) $running,
                        4,
                        '.',
                        '',
                    ),
                'transaction_count' =>
                    $rows->count(),
            ],
            'positions' => [
                'customer' =>
                    number_format(
                        $customerPosition,
                        4,
                        '.',
                        '',
                    ),
                'supplier' =>
                    number_format(
                        $supplierPosition,
                        4,
                        '.',
                        '',
                    ),
                'net' =>
                    number_format(
                        $customerPosition
                        - $supplierPosition,
                        4,
                        '.',
                        '',
                    ),
                'customer_advance' =>
                    number_format(
                        $customerAdvance,
                        4,
                        '.',
                        '',
                    ),
                'supplier_advance' =>
                    number_format(
                        $supplierAdvance,
                        4,
                        '.',
                        '',
                    ),
            ],
            'opening_balances' => [
                'customer' =>
                    $this->openingPayload(
                        $customerOpening,
                    ),
                'supplier' =>
                    $this->openingPayload(
                        $supplierOpening,
                    ),
            ],
            'aging' => $aging,
            'transactions' => $rows,
            'permissions' => [
                'sales_view' => $canSales,
                'sales_manage' =>
                    FinanceAuthorization::allows(
                        $request->user(),
                        'finance.sales.manage',
                    ),
                'purchases_view' =>
                    $canPurchases,
                'purchases_manage' =>
                    FinanceAuthorization::allows(
                        $request->user(),
                        'finance.purchases.manage',
                    ),
                'cash_view' => $canCash,
                'cash_receive' =>
                    FinanceAuthorization::allows(
                        $request->user(),
                        'finance.cash.receive',
                    ),
                'cash_pay' =>
                    FinanceAuthorization::allows(
                        $request->user(),
                        'finance.cash.pay',
                    ),
                'party_edit' =>
                    $request->user()?->can(
                        'update',
                        $party,
                    )
                    ?? false,
            ],
        ]);
    }

    public function updateOpeningBalances(
        Request $request,
        string $party,
    ): JsonResponse {
        $party = Party::withTrashed()
            ->findOrFail($party);

        abort_unless(
            $request->user()?->can(
                'update',
                $party,
            ),
            403,
        );

        $data = $request->validate([
            'customer' => [
                'sometimes',
                'array',
            ],
            'customer.amount' => [
                'required_with:customer',
                'numeric',
                'between:-999999999999,999999999999',
            ],
            'customer.as_of_date' => [
                'required_with:customer',
                'date_format:Y-m-d',
            ],
            'customer.notes' => [
                'nullable',
                'string',
                'max:1000',
            ],
            'supplier' => [
                'sometimes',
                'array',
            ],
            'supplier.amount' => [
                'required_with:supplier',
                'numeric',
                'between:-999999999999,999999999999',
            ],
            'supplier.as_of_date' => [
                'required_with:supplier',
                'date_format:Y-m-d',
            ],
            'supplier.notes' => [
                'nullable',
                'string',
                'max:1000',
            ],
        ]);

        foreach (
            [
                'customer',
                'supplier',
            ] as $side
        ) {
            if (
                ! array_key_exists(
                    $side,
                    $data,
                )
            ) {
                continue;
            }

            if (
                $side === 'customer'
                && ! FinanceAuthorization::allows(
                    $request->user(),
                    'finance.sales.manage',
                )
            ) {
                abort(403);
            }

            if (
                $side === 'supplier'
                && ! FinanceAuthorization::allows(
                    $request->user(),
                    'finance.purchases.manage',
                )
            ) {
                abort(403);
            }

            PartyOpeningBalance::query()
                ->updateOrCreate(
                    [
                        'party_id' =>
                            $party->id,
                        'side' => $side,
                    ],
                    [
                        'amount' =>
                            number_format(
                                (float) $data[
                                    $side
                                ]['amount'],
                                4,
                                '.',
                                '',
                            ),
                        'as_of_date' =>
                            $data[
                                $side
                            ]['as_of_date'],
                        'notes' =>
                            $data[
                                $side
                            ]['notes']
                            ?? null,
                        'updated_by' =>
                            $request
                                ->user()
                                ->id,
                    ],
                );
        }

        return response()->json([
            'message' =>
                'Opening balances updated.',
        ]);
    }

    private function openingEntry(
        PartyOpeningBalance $opening,
        string $side,
        string $currency,
    ): array {
        return [
            'id' =>
                'opening-'
                .$side
                .'-'
                .$opening->id,
            'source_id' =>
                $opening->id,
            'side' => $side,
            'type' =>
                'opening_balance',
            'date' =>
                $opening
                    ->as_of_date
                    ->format(
                        'Y-m-d',
                    ),
            'reference' =>
                $side === 'customer'
                    ? 'OPEN-CUSTOMER'
                    : 'OPEN-SUPPLIER',
            'description' =>
                $opening->notes
                ?: (
                    $side
                    === 'customer'
                        ? 'Customer carried balance'
                        : 'Supplier carried balance'
                ),
            'amount' =>
                number_format(
                    abs(
                        (float) $opening
                            ->amount,
                    ),
                    4,
                    '.',
                    '',
                ),
            'currency' =>
                $currency,
            'effect_customer' =>
                $side === 'customer'
                    ? (float) $opening
                        ->amount
                    : 0.0,
            'effect_supplier' =>
                $side === 'supplier'
                    ? (float) $opening
                        ->amount
                    : 0.0,
            'url' => null,
            'status' => 'opening',
            'method' => null,
            'sort_key' =>
                '0-'
                .str_pad(
                    (string) $opening->id,
                    12,
                    '0',
                    STR_PAD_LEFT,
                ),
        ];
    }

    private function documentEntry(
        FinancialDocument $document,
        string $side,
    ): array {
        return [
            'id' =>
                'document-'
                .$document->id,
            'source_id' =>
                $document->id,
            'side' => $side,
            'type' => 'invoice',
            'date' =>
                $document
                    ->issue_date
                    ->format(
                        'Y-m-d',
                    ),
            'reference' =>
                $document->number,
            'description' =>
                $side === 'customer'
                    ? 'Sales invoice'
                    : 'Purchase invoice',
            'amount' =>
                $document->total,
            'currency' =>
                $document->currency,
            'effect_customer' =>
                $side === 'customer'
                    ? (float) $document
                        ->total
                    : 0.0,
            'effect_supplier' =>
                $side === 'supplier'
                    ? (float) $document
                        ->total
                    : 0.0,
            'url' =>
                $side === 'customer'
                    ? '/app/invoices/sales/'
                        .$document->id
                    : '/app/invoices/purchases/'
                        .$document->id,
            'status' =>
                $document->status,
            'method' => null,
            'sort_key' =>
                '1-'
                .str_pad(
                    (string) $document->id,
                    12,
                    '0',
                    STR_PAD_LEFT,
                ),
        ];
    }

    private function cashEntry(
        CashMovement $movement,
        string $side,
    ): array {
        $customerEffect =
            $side === 'customer'
                ? (
                    $movement->direction
                    === 'incoming'
                        ? -(
                            (float) $movement
                                ->amount
                        )
                        : (float) $movement
                            ->amount
                )
                : 0.0;

        $supplierEffect =
            $side === 'supplier'
                ? (
                    $movement->direction
                    === 'outgoing'
                        ? -(
                            (float) $movement
                                ->amount
                        )
                        : (float) $movement
                            ->amount
                )
                : 0.0;

        return [
            'id' =>
                'cash-'
                .$movement->id,
            'source_id' =>
                $movement->id,
            'side' => $side,
            'type' => 'cash',
            'date' =>
                $movement
                    ->movement_date
                    ->format(
                        'Y-m-d',
                    ),
            'reference' =>
                $movement->number,
            'description' =>
                $movement->reference
                ?: $movement->category,
            'amount' =>
                $movement->amount,
            'currency' =>
                $movement->currency,
            'effect_customer' =>
                $customerEffect,
            'effect_supplier' =>
                $supplierEffect,
            'url' =>
                $movement->direction
                    === 'incoming'
                    ? '/app/receipts/'
                        .$movement->id
                    : '/app/payments/'
                        .$movement->id,
            'status' =>
                $movement->status,
            'method' =>
                $movement->method,
            'allocated' =>
                number_format(
                    (float) (
                        $movement
                            ->allocated_total
                        ?? 0
                    ),
                    4,
                    '.',
                    '',
                ),
            'unallocated' =>
                number_format(
                    max(
                        (float) $movement
                            ->amount
                        - (float) (
                            $movement
                                ->allocated_total
                            ?? 0
                        ),
                        0,
                    ),
                    4,
                    '.',
                    '',
                ),
            'sort_key' =>
                '2-'
                .str_pad(
                    (string) $movement->id,
                    12,
                    '0',
                    STR_PAD_LEFT,
                ),
        ];
    }

    private function movementSide(
        CashMovement $movement,
    ): ?string {
        if (
            $movement->category
            === 'customer_receipt'
        ) {
            return 'customer';
        }

        if (
            $movement->category
            === 'supplier_payment'
        ) {
            return 'supplier';
        }

        if (
            $movement->category
            === 'refund'
        ) {
            return $movement->direction
                === 'outgoing'
                    ? 'customer'
                    : 'supplier';
        }

        return null;
    }

    private function scopeEffect(
        array $entry,
        string $scope,
    ): float {
        $customer =
            (float) (
                $entry[
                    'effect_customer'
                ]
                ?? 0
            );

        $supplier =
            (float) (
                $entry[
                    'effect_supplier'
                ]
                ?? 0
            );

        return match ($scope) {
            'customer' => $customer,
            'supplier' => $supplier,
            default =>
                $customer
                - $supplier,
        };
    }

    private function positionAt(
        Collection $entries,
        Carbon $date,
        string $scope,
    ): float {
        return (float) $entries
            ->filter(
                fn (
                    array $entry,
                ): bool =>
                    Carbon::parse(
                        $entry['date'],
                    )->lte($date),
            )
            ->sum(
                fn (
                    array $entry,
                ): float =>
                    $this->scopeEffect(
                        $entry,
                        $scope,
                    ),
            );
    }

    private function availableAdvance(
        int $partyId,
        string $side,
        Carbon $dateTo,
    ): float {
        $direction =
            $side === 'customer'
                ? 'incoming'
                : 'outgoing';

        $category =
            $side === 'customer'
                ? 'customer_receipt'
                : 'supplier_payment';

        return (float) CashMovement::query()
            ->where(
                'party_id',
                $partyId,
            )
            ->where(
                'direction',
                $direction,
            )
            ->where(
                'category',
                $category,
            )
            ->where(
                'status',
                'posted',
            )
            ->whereDate(
                'movement_date',
                '<=',
                $dateTo
                    ->toDateString(),
            )
            ->where(function ($query): void {
                $query
                    ->where(
                        'method',
                        '!=',
                        'check',
                    )
                    ->orWhereNull(
                        'check_status',
                    )
                    ->orWhereNotIn(
                        'check_status',
                        [
                            'bounced',
                            'cancelled',
                        ],
                    );
            })
            ->withSum(
                'allocations as allocated_total',
                'amount',
            )
            ->get()
            ->sum(
                fn (
                    CashMovement $movement,
                ): float =>
                    max(
                        (float) $movement
                            ->amount
                        - (float) (
                            $movement
                                ->allocated_total
                            ?? 0
                        ),
                        0,
                    ),
            );
    }

    private function aging(
        int $partyId,
        string $scope,
        bool $canSales,
        bool $canPurchases,
        Carbon $asOf,
    ): array {
        $buckets = [
            'current' => 0.0,
            'days_1_30' => 0.0,
            'days_31_60' => 0.0,
            'days_61_90' => 0.0,
            'over_90' => 0.0,
        ];

        $kinds = [];

        if (
            $scope !== 'supplier'
            && $canSales
        ) {
            $kinds[] =
                'sale_invoice';
        }

        if (
            $scope !== 'customer'
            && $canPurchases
        ) {
            $kinds[] =
                'purchase_invoice';
        }

        if ($kinds === []) {
            return array_map(
                fn (): string =>
                    number_format(
                        0,
                        4,
                        '.',
                        '',
                    ),
                $buckets,
            );
        }

        FinancialDocument::query()
            ->where(
                'party_id',
                $partyId,
            )
            ->whereIn(
                'kind',
                $kinds,
            )
            ->whereIn(
                'status',
                [
                    'issued',
                    'partially_paid',
                ],
            )
            ->where(
                'balance_due',
                '>',
                0,
            )
            ->get()
            ->each(function (
                FinancialDocument $document,
            ) use (
                &$buckets,
                $asOf,
            ): void {
                $due =
                    $document->due_date
                    ?: $document->issue_date;

                $days =
                    $due->gt($asOf)
                        ? -1
                        : $due->diffInDays(
                            $asOf,
                        );

                $key =
                    match (true) {
                        $days <= 0 =>
                            'current',
                        $days <= 30 =>
                            'days_1_30',
                        $days <= 60 =>
                            'days_31_60',
                        $days <= 90 =>
                            'days_61_90',
                        default =>
                            'over_90',
                    };

                $buckets[$key] +=
                    (float) $document
                        ->balance_due;
            });

        return collect($buckets)
            ->map(
                fn (
                    float $value,
                ): string =>
                    number_format(
                        $value,
                        4,
                        '.',
                        '',
                    ),
            )
            ->all();
    }

    private function openingPayload(
        ?PartyOpeningBalance $opening,
    ): ?array {
        if (! $opening) {
            return null;
        }

        return [
            'id' =>
                $opening->id,
            'amount' =>
                $opening->amount,
            'as_of_date' =>
                $opening
                    ->as_of_date
                    ->format(
                        'Y-m-d',
                    ),
            'notes' =>
                $opening->notes,
        ];
    }
}
