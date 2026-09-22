<?php

namespace App\Http\Controllers;

use App\Models\CashMovement;
use App\Models\Party;
use App\Models\Product;
use App\Models\Warehouse;
use App\Services\CashMovementService;
use App\Services\FinanceAuthorization;
use App\Services\WorkspaceFeaturePermissions;
use App\Services\FinanceDocumentService;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CommercialOperationsController extends Controller
{
    private const TRADE_KINDS = [
        'quotations' => 'quotation',
        'proformas' => 'proforma',
        'sales-orders' => 'sales_order',
        'purchase-orders' => 'purchase_order',
    ];

    public function index(Request $request, string $feature): JsonResponse
    {
        $this->authorizeFeature($request, $feature, false);

        $organizationId = app(TenantContext::class)->id();

        $data = match ($feature) {
            'unallocated' => $this->unallocated(
                $request,
                $organizationId,
            ),
            'collections' => $this->collections($organizationId),
            'ar-aging' => $this->aging($organizationId, 'sale_invoice'),
            'ap-aging' => $this->aging($organizationId, 'purchase_invoice'),
            'promises' => $this->promises($request, $organizationId),
            'pipeline' => $this->pipeline($organizationId),
            'backorders' => $this->backorders($organizationId),
            'returns' => $this->returns($organizationId),
            'warranties' => $this->warranties($organizationId),
            'serials' => $this->serials($organizationId),
            'batches' => $this->batches($organizationId),
            'quotations', 'proformas', 'sales-orders', 'purchase-orders' =>
                $this->tradeDocuments(
                    $organizationId,
                    self::TRADE_KINDS[$feature],
                ),
            default => abort(404),
        };

        return response()->json([
            'data' => $data,
        ]);
    }

    public function store(Request $request, string $feature): JsonResponse
    {
        $this->authorizeFeature($request, $feature, true);

        $organizationId = app(TenantContext::class)->id();

        $record = match ($feature) {
            'promises' => $this->storePromise($request, $organizationId),
            'pipeline' => $this->storeOpportunity($request, $organizationId),
            'returns' => $this->storeReturn($request, $organizationId),
            'warranties' => $this->storeWarranty($request, $organizationId),
            'serials' => $this->storeSerial($request, $organizationId),
            'batches' => $this->storeBatch($request, $organizationId),
            'quotations', 'proformas', 'sales-orders', 'purchase-orders' =>
                $this->storeTradeDocument(
                    $request,
                    $organizationId,
                    self::TRADE_KINDS[$feature],
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
        $this->authorizeFeature($request, $feature, true);

        $organizationId = app(TenantContext::class)->id();

        $result = match ($feature) {
            'promises' => $this->updatePromise(
                $request,
                $organizationId,
                (int) $record,
            ),
            'pipeline' => $this->updateOpportunity(
                $request,
                $organizationId,
                (int) $record,
            ),
            'returns' => $this->updateReturn(
                $request,
                $organizationId,
                (int) $record,
            ),
            'warranties' => $this->updateSimpleStatus(
                $request,
                $organizationId,
                'warranty_records',
                (int) $record,
                ['active', 'expired', 'void'],
            ),
            'serials' => $this->updateSerial(
                $request,
                $organizationId,
                (int) $record,
            ),
            'batches' => $this->updateBatch(
                $request,
                $organizationId,
                (int) $record,
            ),
            'quotations', 'proformas', 'sales-orders', 'purchase-orders' =>
                $this->updateTradeDocument(
                    $request,
                    $organizationId,
                    (int) $record,
                    self::TRADE_KINDS[$feature],
                ),
            default => abort(404),
        };

        return response()->json([
            'data' => $result,
        ]);
    }

    public function convert(
        Request $request,
        string $feature,
        string $record,
        FinanceDocumentService $financeDocuments,
    ): JsonResponse {
        abort_unless(
            array_key_exists($feature, self::TRADE_KINDS),
            404,
        );

        $this->authorizeFeature($request, $feature, true);

        $organizationId = app(TenantContext::class)->id();
        $kind = self::TRADE_KINDS[$feature];

        $document = DB::table('trade_documents')
            ->where('organization_id', $organizationId)
            ->where('id', (int) $record)
            ->where('kind', $kind)
            ->first();

        abort_unless($document, 404);

        $isOrder = in_array(
            $kind,
            ['sales_order', 'purchase_order'],
            true,
        );

        if (
            (
                ! $isOrder
                && in_array(
                    $document->status,
                    ['rejected', 'expired', 'cancelled'],
                    true,
                )
            )
            || (
                $isOrder
                && $document->status === 'cancelled'
            )
        ) {
            throw ValidationException::withMessages([
                'status' => [
                    'Rejected, expired or cancelled documents cannot be converted.',
                ],
            ]);
        }

        $lines = DB::table('trade_document_lines')
            ->where('organization_id', $organizationId)
            ->where('trade_document_id', $document->id)
            ->orderBy('id')
            ->get();

        if ($lines->isEmpty()) {
            throw ValidationException::withMessages([
                'lines' => ['At least one document line is required.'],
            ]);
        }

        if (! $isOrder && $document->converted_financial_document_id) {
            throw ValidationException::withMessages([
                'status' => ['This document was already converted.'],
            ]);
        }

        $convertible = $lines
            ->map(function ($line) use ($isOrder): array {
                $quantity = $isOrder
                    ? max(
                        (float) $line->fulfilled_quantity
                        - (float) $line->invoiced_quantity,
                        0,
                    )
                    : (float) $line->quantity;

                return [
                    'line' => $line,
                    'quantity' => $quantity,
                ];
            })
            ->filter(
                fn (array $item): bool =>
                    $item['quantity'] > 0.00005,
            )
            ->values();

        if ($convertible->isEmpty()) {
            throw ValidationException::withMessages([
                'status' => [
                    $isOrder
                        ? 'Record delivered or received quantities before creating an invoice.'
                        : 'Nothing is available to convert.',
                ],
            ]);
        }

        $invoiceKind =
            $kind === 'purchase_order'
                ? 'purchase_invoice'
                : 'sale_invoice';

        $invoice = $financeDocuments->createDraft([
            'kind' => $invoiceKind,
            'party_id' => (int) $document->party_id,
            'warehouse_id' => null,
            'department_id' => null,
            'external_number' => $document->number,
            'issue_date' => now()->toDateString(),
            'due_date' => null,
            'activity_type' => null,
            'market_type' => null,
            'branch_label' => null,
            'currency' => $document->currency,
            'exchange_rate' => '1',
            'shipping_total' => '0',
            'payment_terms' => null,
            'notes' => 'Converted from '.$document->number,
            'internal_notes' => null,
            'lines' => $convertible
                ->map(fn (array $item): array => [
                    'product_id' => $item['line']->product_id,
                    'warehouse_id' => $item['line']->warehouse_id,
                    'tax_rule_id' => null,
                    'description' => $item['line']->description,
                    'unit' => null,
                    'quantity' => (string) $item['quantity'],
                    'unit_price' => (string) $item['line']->unit_price,
                    'price_status' => 'final',
                    'discount_percent' => '0',
                    'discount_type' => 'percent',
                    'discount_value' => '0',
                    'tax_rate' => '0',
                    'affects_inventory' => (bool) $item['line']->affects_inventory,
                ])
                ->all(),
        ], $request->user()->id);

        DB::transaction(function () use (
            $organizationId,
            $document,
            $invoice,
            $convertible,
            $isOrder,
        ): void {
            DB::table('trade_document_conversions')
                ->insert([
                    'organization_id' => $organizationId,
                    'trade_document_id' => $document->id,
                    'financial_document_id' => $invoice->id,
                    'converted_quantity' => number_format(
                        (float) $convertible->sum(
                            fn (array $item): float =>
                                (float) $item['quantity'],
                        ),
                        4,
                        '.',
                        '',
                    ),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

            if ($isOrder) {
                foreach ($convertible as $item) {
                    DB::table('trade_document_lines')
                        ->where('organization_id', $organizationId)
                        ->where('id', $item['line']->id)
                        ->update([
                            'invoiced_quantity' =>
                                (float) $item['line']->invoiced_quantity
                                + $item['quantity'],
                            'updated_at' => now(),
                        ]);
                }
            }

            $lineState = DB::table('trade_document_lines')
                ->where('organization_id', $organizationId)
                ->where('trade_document_id', $document->id)
                ->selectRaw(
                    'SUM(quantity) as ordered,
                     SUM(fulfilled_quantity) as fulfilled,
                     SUM(invoiced_quantity) as invoiced',
                )
                ->first();

            $orderStatus = 'invoiced';

            if ($isOrder) {
                $ordered = (float) ($lineState?->ordered ?? 0);
                $fulfilled = (float) ($lineState?->fulfilled ?? 0);
                $invoiced = (float) ($lineState?->invoiced ?? 0);

                $orderStatus = (
                    $fulfilled + 0.00005 >= $ordered
                    && $invoiced + 0.00005 >= $fulfilled
                )
                    ? 'invoiced'
                    : 'partial_invoiced';
            }

            DB::table('trade_documents')
                ->where('organization_id', $organizationId)
                ->where('id', $document->id)
                ->update([
                    'converted_financial_document_id' => $invoice->id,
                    'status' => $isOrder
                        ? $orderStatus
                        : 'converted',
                    'updated_at' => now(),
                ]);
        });

        return response()->json([
            'data' => [
                'financial_document_id' => $invoice->id,
                'kind' => $invoice->kind,
                'url' => $invoice->kind === 'sale_invoice'
                    ? '/app/invoices/sales/'.$invoice->id
                    : '/app/invoices/purchases/'.$invoice->id,
            ],
        ], 201);
    }

    public function claim(
        Request $request,
        string $record,
    ): JsonResponse {
        $this->authorizeFeature($request, 'warranties', true);

        $organizationId = app(TenantContext::class)->id();

        $warranty = DB::table('warranty_records')
            ->where('organization_id', $organizationId)
            ->where('id', (int) $record)
            ->first();

        abort_unless($warranty, 404);

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:180'],
            'claimed_on' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $claimedOn =
            $data['claimed_on']
            ?? now()->toDateString();

        if (
            $warranty->status === 'void'
            || $claimedOn < $warranty->starts_on
            || $claimedOn > $warranty->ends_on
        ) {
            throw ValidationException::withMessages([
                'claimed_on' => [
                    'The warranty claim date must fall inside an active warranty period.',
                ],
            ]);
        }

        $id = DB::table('warranty_claims')->insertGetId([
            'organization_id' => $organizationId,
            'warranty_record_id' => (int) $record,
            'claimed_on' => $claimedOn,
            'status' => 'open',
            'reason' => $data['reason'],
            'resolution' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'data' => DB::table('warranty_claims')
                ->where('organization_id', $organizationId)
                ->where('id', $id)
                ->first(),
        ], 201);
    }

    public function updateClaim(
        Request $request,
        string $record,
        string $claim,
    ): JsonResponse {
        $this->authorizeFeature(
            $request,
            'warranties',
            true,
        );

        $organizationId =
            app(TenantContext::class)->id();

        $warranty = DB::table('warranty_records')
            ->where('organization_id', $organizationId)
            ->where('id', (int) $record)
            ->first();

        abort_unless($warranty, 404);

        $claimRecord = DB::table('warranty_claims')
            ->where('organization_id', $organizationId)
            ->where('warranty_record_id', $warranty->id)
            ->where('id', (int) $claim)
            ->first();

        abort_unless($claimRecord, 404);

        $data = $request->validate([
            'status' => [
                'required',
                Rule::in([
                    'open',
                    'in_progress',
                    'resolved',
                    'rejected',
                ]),
            ],
            'resolution' => [
                'nullable',
                'string',
                'max:5000',
                'required_if:status,resolved',
            ],
        ]);

        $claimTransitions = [
            'open' => [
                'in_progress',
                'resolved',
                'rejected',
            ],
            'in_progress' => [
                'resolved',
                'rejected',
            ],
            'resolved' => [],
            'rejected' => [],
        ];

        if (
            $data['status'] !== $claimRecord->status
            && ! in_array(
                $data['status'],
                $claimTransitions[
                    $claimRecord->status
                ] ?? [],
                true,
            )
        ) {
            throw ValidationException::withMessages([
                'status' => [
                    'This warranty claim status transition is not allowed.',
                ],
            ]);
        }

        DB::table('warranty_claims')
            ->where('organization_id', $organizationId)
            ->where('id', $claimRecord->id)
            ->update([
                'status' => $data['status'],
                'resolution' =>
                    $data['resolution'] ?? null,
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' => DB::table('warranty_claims')
                ->where('organization_id', $organizationId)
                ->where('id', $claimRecord->id)
                ->first(),
        ]);
    }

    public function prepareAllocation(
        Request $request,
        string $record,
        CashMovementService $cashMovements,
    ): JsonResponse {
        FinanceAuthorization::authorize(
            $request->user(),
            'finance.cash.correct',
        );

        $movement = CashMovement::query()
            ->with('allocations')
            ->findOrFail((int) $record);

        if (
            $movement->status !== 'posted'
            || $movement->direction !== 'incoming'
            || $movement->category !== 'customer_receipt'
            || ! $movement->party_id
            || $movement->reversal_of_id
        ) {
            throw ValidationException::withMessages([
                'movement' => [
                    'Only posted customer receipts can be prepared for allocation.',
                ],
            ]);
        }

        $allocated = (float) $movement
            ->allocations
            ->sum(
                fn ($allocation): float =>
                    (float) $allocation->amount,
            );

        if (
            (float) $movement->amount
            - $allocated
            <= 0.00005
        ) {
            throw ValidationException::withMessages([
                'movement' => [
                    'This receipt is already fully allocated.',
                ],
            ]);
        }

        $replacement = $cashMovements->startCorrection(
            $movement,
            'Allocate previously unallocated receipt to customer invoice',
            $request->user()->id,
        );

        return response()->json([
            'data' => [
                'id' => $replacement->id,
                'url' => '/app/receipts/'.$replacement->id,
            ],
        ], 201);
    }

    private function unallocated(
        Request $request,
        int $organizationId,
    ): array
    {
        $allocations = DB::table('cash_allocations')
            ->selectRaw(
                'cash_movement_id, SUM(amount) as allocated',
            )
            ->groupBy('cash_movement_id');

        return DB::table('cash_movements as movement')
            ->leftJoinSub(
                $allocations,
                'allocation_totals',
                'allocation_totals.cash_movement_id',
                '=',
                'movement.id',
            )
            ->leftJoin(
                'parties as party',
                'party.id',
                '=',
                'movement.party_id',
            )
            ->where('movement.organization_id', $organizationId)
            ->where('movement.status', 'posted')
            ->where('movement.direction', 'incoming')
            ->where('movement.category', 'customer_receipt')
            ->whereNotNull('movement.party_id')
            ->whereNull('movement.reversal_of_id')
            ->where(function ($query): void {
                $query
                    ->where('movement.method', '!=', 'check')
                    ->orWhereNull('movement.check_status')
                    ->orWhereNotIn(
                        'movement.check_status',
                        ['bounced', 'cancelled'],
                    );
            })
            ->orderByDesc('movement.movement_date')
            ->get([
                'movement.id',
                'movement.number',
                'movement.direction',
                'movement.movement_date',
                'movement.amount',
                'movement.currency',
                'movement.method',
                'party.name',
                'party.company_name',
                DB::raw('COALESCE(allocation_totals.allocated, 0) as allocated'),
            ])
            ->map(function ($row) use ($request): ?array {
                $unallocated =
                    (float) $row->amount
                    - (float) $row->allocated;

                if ($unallocated <= 0.00005) {
                    return null;
                }

                return [
                    'id' => $row->id,
                    'number' => $row->number,
                    'direction' => $row->direction,
                    'date' => $row->movement_date,
                    'party' => $row->company_name ?: $row->name,
                    'amount' => (string) $row->amount,
                    'allocated' => (string) $row->allocated,
                    'unallocated' => number_format(
                        $unallocated,
                        4,
                        '.',
                        '',
                    ),
                    'currency' => $row->currency,
                    'method' => $row->method,
                    'can_allocate' =>
                        FinanceAuthorization::allows(
                            $request->user(),
                            'finance.cash.correct',
                        ),
                    'url' => '/app/receipts/'.$row->id,
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    private function collections(int $organizationId): array
    {
        $rows = DB::table('financial_documents as document')
            ->leftJoin(
                'parties as party',
                'party.id',
                '=',
                'document.party_id',
            )
            ->where('document.organization_id', $organizationId)
            ->where('document.kind', 'sale_invoice')
            ->whereIn(
                'document.status',
                ['issued', 'partially_paid'],
            )
            ->where('document.balance_due', '>', 0)
            ->orderBy('document.due_date')
            ->get([
                'document.id',
                'document.party_id',
                'document.number',
                'document.due_date',
                'document.balance_due',
                'document.currency',
                'party.name',
                'party.company_name',
                'party.phone',
                'party.email',
            ]);

        $workspaceCurrency = strtoupper(
            (string) (
                app(TenantContext::class)
                    ->organization()
                    ->preferences['currency']
                ?? 'ILS'
            ),
        );

        $promiseRows = DB::table(
            'payment_promises as promise',
        )
            ->leftJoin(
                'financial_documents as promise_document',
                'promise_document.id',
                '=',
                'promise.financial_document_id',
            )
            ->where(
                'promise.organization_id',
                $organizationId,
            )
            ->whereIn(
                'promise.status',
                ['open', 'missed'],
            )
            ->orderBy('promise.promised_on')
            ->get([
                'promise.*',
                'promise_document.currency as promise_currency',
            ])
            ->groupBy('party_id');

        return $rows
            ->groupBy(
                fn ($row): string =>
                    (string) $row->party_id
                    .'|'
                    .$row->currency,
            )
            ->map(function ($partyRows) use (
                $promiseRows,
                $workspaceCurrency,
            ): array {
                $first = $partyRows->first();
                $partyId =
                    (int) $first->party_id;
                $promises = $promiseRows->get(
                    $partyId,
                    collect(),
                )->filter(
                    fn ($promise): bool =>
                        $promise->promise_currency
                            ? $promise->promise_currency
                                === $first->currency
                            : $first->currency
                                === $workspaceCurrency,
                );
                $nextPromise = $promises->first();
                $oldestDue = $partyRows
                    ->pluck('due_date')
                    ->filter()
                    ->min();

                $overdueDays = $oldestDue
                    ? max(
                        0,
                        CarbonImmutable::parse($oldestDue)
                            ->diffInDays(
                                CarbonImmutable::today(),
                                false,
                            ),
                    )
                    : 0;

                $needsContact =
                    $overdueDays > 0
                    || (
                        $nextPromise
                        && $nextPromise->promised_on
                            <= now()->toDateString()
                    );

                return [
                    'party_id' => (int) $partyId,
                    'party' => $first->company_name ?: $first->name,
                    'phone' => $first->phone,
                    'email' => $first->email,
                    'invoice_count' => $partyRows->count(),
                    'outstanding' => number_format(
                        (float) $partyRows->sum(
                            fn ($row): float =>
                                (float) $row->balance_due,
                        ),
                        4,
                        '.',
                        '',
                    ),
                    'currency' => $first->currency,
                    'oldest_due' => $oldestDue,
                    'overdue_days' => $overdueDays,
                    'promise_on' => $nextPromise?->promised_on,
                    'promise_amount' => $nextPromise?->amount,
                    'promise_status' => $nextPromise?->status,
                    'expected_collection' => number_format(
                        min(
                            (float) $partyRows->sum(
                                fn ($row): float =>
                                    (float) $row->balance_due,
                            ),
                            $nextPromise
                                ? (float) $nextPromise->amount
                                : (float) $partyRows->sum(
                                    fn ($row): float =>
                                        (float) $row->balance_due,
                                ),
                        ),
                        4,
                        '.',
                        '',
                    ),
                    'contact_today' => $needsContact,
                    'url' => '/app/parties?focus='.$partyId,
                ];
            })
            ->sort(function (array $left, array $right): int {
                return [
                    $right['contact_today'] ? 1 : 0,
                    $right['overdue_days'],
                    (float) $right['outstanding'],
                ] <=> [
                    $left['contact_today'] ? 1 : 0,
                    $left['overdue_days'],
                    (float) $left['outstanding'],
                ];
            })
            ->values()
            ->all();
    }

    private function aging(
        int $organizationId,
        string $kind,
    ): array {
        $rows = DB::table('financial_documents as document')
            ->leftJoin(
                'parties as party',
                'party.id',
                '=',
                'document.party_id',
            )
            ->where('document.organization_id', $organizationId)
            ->where('document.kind', $kind)
            ->whereIn(
                'document.status',
                ['issued', 'partially_paid'],
            )
            ->where('document.balance_due', '>', 0)
            ->get([
                'document.party_id',
                'document.due_date',
                'document.balance_due',
                'document.currency',
                'party.name',
                'party.company_name',
            ]);

        return $rows
            ->groupBy(
                fn ($row): string =>
                    (string) $row->party_id
                    .'|'
                    .$row->currency,
            )
            ->map(function ($partyRows): array {
                $first = $partyRows->first();
                $partyId =
                    (int) $first->party_id;
                $buckets = [
                    'current' => 0.0,
                    '0_30' => 0.0,
                    '31_60' => 0.0,
                    '61_90' => 0.0,
                    '90_plus' => 0.0,
                ];

                foreach ($partyRows as $row) {
                    $days = $row->due_date
                        ? CarbonImmutable::parse(
                            $row->due_date,
                        )->diffInDays(
                            CarbonImmutable::today(),
                            false,
                        )
                        : 0;

                    $bucket = match (true) {
                        $days <= 0 => 'current',
                        $days <= 30 => '0_30',
                        $days <= 60 => '31_60',
                        $days <= 90 => '61_90',
                        default => '90_plus',
                    };

                    $buckets[$bucket] +=
                        (float) $row->balance_due;
                }

                return [
                    'party_id' => (int) $partyId,
                    'party' => $first->company_name ?: $first->name,
                    'currency' => $first->currency,
                    'current' => number_format(
                        $buckets['current'],
                        4,
                        '.',
                        '',
                    ),
                    '0_30' => number_format($buckets['0_30'], 4, '.', ''),
                    '31_60' => number_format($buckets['31_60'], 4, '.', ''),
                    '61_90' => number_format($buckets['61_90'], 4, '.', ''),
                    '90_plus' => number_format($buckets['90_plus'], 4, '.', ''),
                    'total' => number_format(
                        array_sum($buckets),
                        4,
                        '.',
                        '',
                    ),
                    'url' => '/app/parties?focus='.$partyId,
                ];
            })
            ->sortByDesc(
                fn (array $row): float =>
                    (float) $row['total'],
            )
            ->values()
            ->all();
    }

    private function promises(
        Request $request,
        int $organizationId,
    ): array {
        $workspaceCurrency = strtoupper(
            (string) (
                app(TenantContext::class)
                    ->organization()
                    ->preferences['currency']
                ?? 'ILS'
            ),
        );

        $openPromises = DB::table(
            'payment_promises',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where('status', 'open')
            ->get();

        foreach ($openPromises as $promise) {
            $currentReceived =
                $promise->financial_document_id
                    ? $this->activeInvoiceReceiptTotal(
                        $organizationId,
                        (int) $promise->financial_document_id,
                    )
                    : $this->activePartyReceiptTotal(
                        $organizationId,
                        (int) $promise->party_id,
                        $workspaceCurrency,
                    );

            $baseline =
                $promise->baseline_received_total;

            if ($baseline === null) {
                DB::table('payment_promises')
                    ->where(
                        'organization_id',
                        $organizationId,
                    )
                    ->where('id', $promise->id)
                    ->update([
                        'baseline_received_total' =>
                            number_format(
                                $currentReceived,
                                4,
                                '.',
                                '',
                            ),
                        'updated_at' => now(),
                    ]);

                continue;
            }

            if (
                $currentReceived
                - (float) $baseline
                + 0.00005
                >= (float) $promise->amount
            ) {
                DB::table('payment_promises')
                    ->where(
                        'organization_id',
                        $organizationId,
                    )
                    ->where('id', $promise->id)
                    ->update([
                        'status' => 'fulfilled',
                        'fulfilled_at' => now(),
                        'updated_at' => now(),
                    ]);
            }
        }

        DB::table('payment_promises')
            ->where('organization_id', $organizationId)
            ->where('status', 'open')
            ->whereDate(
                'promised_on',
                '<',
                now()->toDateString(),
            )
            ->update([
                'status' => 'missed',
                'updated_at' => now(),
            ]);

        $query = DB::table('payment_promises as promise')
            ->leftJoin(
                'parties as party',
                'party.id',
                '=',
                'promise.party_id',
            )
            ->leftJoin(
                'financial_documents as document',
                'document.id',
                '=',
                'promise.financial_document_id',
            )
            ->where('promise.organization_id', $organizationId)
            ->orderBy('promise.promised_on')
            ->orderByDesc('promise.id');

        if ($request->filled('party_id')) {
            $query->where(
                'promise.party_id',
                (int) $request->input('party_id'),
            );
        }

        return $query
            ->get([
                'promise.id',
                'promise.party_id',
                'promise.financial_document_id',
                'promise.amount',
                'promise.baseline_received_total',
                'promise.promised_on',
                'promise.status',
                'promise.note',
                'promise.fulfilled_at',
                'party.name',
                'party.company_name',
                'document.number as document_number',
                'document.currency as document_currency',
            ])
            ->map(function ($row) use (
                $organizationId,
                $workspaceCurrency,
            ): array {
                $currentReceived =
                    $row->financial_document_id
                        ? $this->activeInvoiceReceiptTotal(
                            $organizationId,
                            (int) $row->financial_document_id,
                        )
                        : $this->activePartyReceiptTotal(
                            $organizationId,
                            (int) $row->party_id,
                            $workspaceCurrency,
                        );

                $receivedSincePromise = max(
                    $currentReceived
                    - (float) (
                        $row->baseline_received_total
                        ?? $currentReceived
                    ),
                    0,
                );

                return [
                    'id' => $row->id,
                    'party_id' => $row->party_id,
                    'party' =>
                        $row->company_name
                        ?: $row->name,
                    'financial_document_id' =>
                        $row->financial_document_id,
                    'document_number' =>
                        $row->document_number,
                    'amount' =>
                        (string) $row->amount,
                    'currency' =>
                        $row->document_currency
                        ?: $workspaceCurrency,
                    'received_since_promise' =>
                        number_format(
                            $receivedSincePromise,
                            4,
                            '.',
                            '',
                        ),
                    'promise_remaining' =>
                        number_format(
                            max(
                                (float) $row->amount
                                - $receivedSincePromise,
                                0,
                            ),
                            4,
                            '.',
                            '',
                        ),
                    'promised_on' =>
                        $row->promised_on,
                    'status' =>
                        $row->status,
                    'note' =>
                        $row->note,
                    'fulfilled_at' =>
                        $row->fulfilled_at,
                ];
            })
            ->all();
    }

    private function pipeline(int $organizationId): array
    {
        $stageOrder = [
            'prospect' => 1,
            'contacted' => 2,
            'quoted' => 3,
            'negotiating' => 4,
            'won' => 5,
            'lost' => 6,
        ];

        return DB::table('sales_opportunities as opportunity')
            ->leftJoin(
                'parties as party',
                'party.id',
                '=',
                'opportunity.party_id',
            )
            ->where('opportunity.organization_id', $organizationId)
            ->orderBy('opportunity.next_action_on')
            ->orderByDesc('opportunity.id')
            ->get([
                'opportunity.id',
                'opportunity.party_id',
                'opportunity.title',
                'opportunity.stage',
                'opportunity.expected_value',
                'opportunity.probability',
                'opportunity.expected_close_on',
                'opportunity.next_action_on',
                'opportunity.notes',
                'opportunity.lost_reason',
                'party.name',
                'party.company_name',
            ])
            ->map(fn ($row): array => [
                ...((array) $row),
                'party' => $row->company_name ?: $row->name,
            ])
            ->sort(function (array $left, array $right) use ($stageOrder): int {
                return [
                    $stageOrder[$left['stage']] ?? 99,
                    $left['next_action_on'] ?? '9999-12-31',
                    -((int) $left['id']),
                ] <=> [
                    $stageOrder[$right['stage']] ?? 99,
                    $right['next_action_on'] ?? '9999-12-31',
                    -((int) $right['id']),
                ];
            })
            ->values()
            ->all();
    }

    private function tradeDocuments(
        int $organizationId,
        string $kind,
    ): array {
        $conversionTotals = DB::table(
            'trade_document_conversions',
        )
            ->where('organization_id', $organizationId)
            ->selectRaw(
                'trade_document_id,
                 COUNT(*) as invoice_count',
            )
            ->groupBy('trade_document_id');

        $conversionsByDocument = DB::table(
            'trade_document_conversions as conversion',
        )
            ->join(
                'financial_documents as invoice',
                'invoice.id',
                '=',
                'conversion.financial_document_id',
            )
            ->where(
                'conversion.organization_id',
                $organizationId,
            )
            ->orderByDesc('conversion.id')
            ->get([
                'conversion.trade_document_id',
                'conversion.converted_quantity',
                'conversion.created_at',
                'invoice.id',
                'invoice.number',
                'invoice.kind',
                'invoice.status',
                'invoice.total',
                'invoice.currency',
            ])
            ->groupBy('trade_document_id');

        $lineTotals = DB::table('trade_document_lines')
            ->selectRaw(
                'trade_document_id,
                 SUM(quantity) as quantity,
                 SUM(fulfilled_quantity) as fulfilled_quantity,
                 SUM(invoiced_quantity) as invoiced_quantity,
                 MIN(id) as first_line_id',
            )
            ->where('organization_id', $organizationId)
            ->groupBy('trade_document_id');

        $linesByDocument = DB::table(
            'trade_document_lines as line',
        )
            ->leftJoin(
                'products as product',
                'product.id',
                '=',
                'line.product_id',
            )
            ->leftJoin(
                'warehouses as warehouse',
                'warehouse.id',
                '=',
                'line.warehouse_id',
            )
            ->where(
                'line.organization_id',
                $organizationId,
            )
            ->orderBy('line.id')
            ->get([
                'line.id',
                'line.trade_document_id',
                'line.product_id',
                'line.warehouse_id',
                'line.description',
                'line.quantity',
                'line.unit_price',
                'line.fulfilled_quantity',
                'line.invoiced_quantity',
                'line.affects_inventory',
                'product.name as product_name',
                'warehouse.name as warehouse_name',
            ])
            ->groupBy('trade_document_id');

        return DB::table('trade_documents as document')
            ->leftJoinSub(
                $lineTotals,
                'line_totals',
                'line_totals.trade_document_id',
                '=',
                'document.id',
            )
            ->leftJoinSub(
                $conversionTotals,
                'conversion_totals',
                'conversion_totals.trade_document_id',
                '=',
                'document.id',
            )
            ->leftJoin(
                'parties as party',
                'party.id',
                '=',
                'document.party_id',
            )
            ->where('document.organization_id', $organizationId)
            ->where('document.kind', $kind)
            ->orderByDesc('document.issue_date')
            ->orderByDesc('document.id')
            ->get([
                'document.id',
                'document.number',
                'document.party_id',
                'document.status',
                'document.issue_date',
                'document.valid_until',
                'document.expected_on',
                'document.currency',
                'document.total',
                'document.notes',
                'document.converted_financial_document_id',
                'party.name',
                'party.company_name',
                DB::raw('COALESCE(line_totals.quantity, 0) as quantity'),
                DB::raw('COALESCE(line_totals.fulfilled_quantity, 0) as fulfilled_quantity'),
                DB::raw('COALESCE(line_totals.invoiced_quantity, 0) as invoiced_quantity'),
                DB::raw('COALESCE(conversion_totals.invoice_count, 0) as invoice_count'),
                'line_totals.first_line_id',
            ])
            ->map(function ($row) use (
                $linesByDocument,
                $conversionsByDocument,
            ): array {
                $invoices = $conversionsByDocument
                    ->get($row->id, collect())
                    ->map(fn ($invoice): array => [
                        'id' => $invoice->id,
                        'number' => $invoice->number,
                        'kind' => $invoice->kind,
                        'status' => $invoice->status,
                        'total' => (string) $invoice->total,
                        'currency' => $invoice->currency,
                        'converted_quantity' =>
                            (string) $invoice->converted_quantity,
                        'created_at' => $invoice->created_at,
                        'url' =>
                            $invoice->kind === 'sale_invoice'
                                ? '/app/invoices/sales/'.$invoice->id
                                : '/app/invoices/purchases/'.$invoice->id,
                    ])
                    ->values()
                    ->all();

                $lines = $linesByDocument
                    ->get($row->id, collect())
                    ->map(fn ($line): array => [
                        'id' => $line->id,
                        'product_id' => $line->product_id,
                        'product' =>
                            $line->product_name
                            ?: $line->description,
                        'warehouse_id' => $line->warehouse_id,
                        'warehouse' => $line->warehouse_name,
                        'description' => $line->description,
                        'quantity' => (string) $line->quantity,
                        'unit_price' => (string) $line->unit_price,
                        'fulfilled_quantity' =>
                            (string) $line->fulfilled_quantity,
                        'invoiced_quantity' =>
                            (string) $line->invoiced_quantity,
                        'remaining_quantity' => number_format(
                            max(
                                (float) $line->quantity
                                - (float) $line->fulfilled_quantity,
                                0,
                            ),
                            4,
                            '.',
                            '',
                        ),
                        'affects_inventory' =>
                            (bool) $line->affects_inventory,
                    ])
                    ->values()
                    ->all();

                return [
                    'id' => $row->id,
                    'number' => $row->number,
                    'party_id' => $row->party_id,
                    'party' =>
                        $row->company_name
                        ?: $row->name,
                    'status' => $row->status,
                    'issue_date' => $row->issue_date,
                    'valid_until' => $row->valid_until,
                    'expected_on' => $row->expected_on,
                    'currency' => $row->currency,
                    'total' => (string) $row->total,
                    'notes' => $row->notes,
                    'converted_financial_document_id' =>
                        $row->converted_financial_document_id,
                    'quantity' => (string) $row->quantity,
                    'fulfilled_quantity' =>
                        (string) $row->fulfilled_quantity,
                    'invoiced_quantity' =>
                        (string) $row->invoiced_quantity,
                    'invoice_count' =>
                        (int) $row->invoice_count,
                    'remaining_quantity' => number_format(
                        max(
                            (float) $row->quantity
                            - (float) $row->fulfilled_quantity,
                            0,
                        ),
                        4,
                        '.',
                        '',
                    ),
                    'first_line_id' =>
                        $row->first_line_id,
                    'lines' => $lines,
                    'invoices' => $invoices,
                ];
            })
            ->all();
    }

    private function backorders(int $organizationId): array
    {
        return DB::table('trade_document_lines as line')
            ->join(
                'trade_documents as document',
                'document.id',
                '=',
                'line.trade_document_id',
            )
            ->leftJoin(
                'parties as party',
                'party.id',
                '=',
                'document.party_id',
            )
            ->leftJoin(
                'products as product',
                'product.id',
                '=',
                'line.product_id',
            )
            ->where('document.organization_id', $organizationId)
            ->where('line.organization_id', $organizationId)
            ->where('document.kind', 'sales_order')
            ->whereNotIn(
                'document.status',
                ['cancelled', 'converted', 'invoiced'],
            )
            ->whereRaw(
                'line.quantity > line.fulfilled_quantity',
            )
            ->orderBy('document.expected_on')
            ->get([
                'document.id as order_id',
                'document.number',
                'document.expected_on',
                'document.currency',
                'line.id as line_id',
                'line.product_id',
                'line.description',
                'line.quantity',
                'line.fulfilled_quantity',
                'party.name',
                'party.company_name',
                'product.name as product_name',
            ])
            ->map(fn ($row): array => [
                'order_id' => $row->order_id,
                'number' => $row->number,
                'party' => $row->company_name ?: $row->name,
                'product' => $row->product_name ?: $row->description,
                'ordered' => (string) $row->quantity,
                'fulfilled' => (string) $row->fulfilled_quantity,
                'backorder' => number_format(
                    max(
                        (float) $row->quantity
                        - (float) $row->fulfilled_quantity,
                        0,
                    ),
                    4,
                    '.',
                    '',
                ),
                'expected_on' => $row->expected_on,
                'currency' => $row->currency,
            ])
            ->all();
    }

    private function returns(int $organizationId): array
    {
        return DB::table('return_requests as request')
            ->leftJoin(
                'financial_documents as document',
                'document.id',
                '=',
                'request.financial_document_id',
            )
            ->leftJoin(
                'parties as party',
                'party.id',
                '=',
                'request.party_id',
            )
            ->where('request.organization_id', $organizationId)
            ->orderByDesc('request.id')
            ->get([
                'request.id',
                'request.kind',
                'request.status',
                'request.reason',
                'request.total_quantity',
                'request.notes',
                'request.created_at',
                'document.number as document_number',
                'party.name',
                'party.company_name',
            ])
            ->map(fn ($row): array => [
                ...((array) $row),
                'party' => $row->company_name ?: $row->name,
            ])
            ->all();
    }

    private function warranties(int $organizationId): array
    {
        DB::table('warranty_records')
            ->where('organization_id', $organizationId)
            ->where('status', 'active')
            ->whereDate(
                'ends_on',
                '<',
                now()->toDateString(),
            )
            ->update([
                'status' => 'expired',
                'updated_at' => now(),
            ]);

        $claimStats = DB::table('warranty_claims')
            ->where('organization_id', $organizationId)
            ->selectRaw(
                "warranty_record_id,
                 COUNT(*) as claim_count,
                 SUM(CASE WHEN status IN ('open', 'in_progress') THEN 1 ELSE 0 END) as open_claim_count,
                 MAX(id) as last_claim_id",
            )
            ->groupBy('warranty_record_id');

        $claims = DB::table('warranty_claims')
            ->where('organization_id', $organizationId)
            ->orderByDesc('claimed_on')
            ->orderByDesc('id')
            ->get()
            ->groupBy('warranty_record_id');

        return DB::table('warranty_records as warranty')
            ->leftJoin(
                'products as product',
                'product.id',
                '=',
                'warranty.product_id',
            )
            ->leftJoin(
                'parties as party',
                'party.id',
                '=',
                'warranty.party_id',
            )
            ->leftJoin(
                'financial_documents as document',
                'document.id',
                '=',
                'warranty.financial_document_id',
            )
            ->leftJoinSub(
                $claimStats,
                'claim_stats',
                'claim_stats.warranty_record_id',
                '=',
                'warranty.id',
            )
            ->leftJoin(
                'warranty_claims as last_claim',
                'last_claim.id',
                '=',
                'claim_stats.last_claim_id',
            )
            ->where('warranty.organization_id', $organizationId)
            ->orderBy('warranty.ends_on')
            ->get([
                'warranty.id',
                'warranty.party_id',
                'warranty.product_id',
                'warranty.financial_document_id',
                'warranty.serial_number',
                'warranty.starts_on',
                'warranty.ends_on',
                'warranty.status',
                'warranty.notes',
                'product.name as product',
                'party.name',
                'party.company_name',
                'document.number as document_number',
                DB::raw('COALESCE(claim_stats.claim_count, 0) as claim_count'),
                DB::raw('COALESCE(claim_stats.open_claim_count, 0) as open_claim_count'),
                'last_claim.status as last_claim_status',
                'last_claim.reason as last_claim_reason',
                'last_claim.resolution as last_claim_resolution',
            ])
            ->map(function ($row) use ($claims): array {
                $history = $claims
                    ->get($row->id, collect())
                    ->take(12)
                    ->map(fn ($claim): array => [
                        'id' => $claim->id,
                        'claimed_on' => $claim->claimed_on,
                        'status' => $claim->status,
                        'reason' => $claim->reason,
                        'resolution' => $claim->resolution,
                    ])
                    ->values()
                    ->all();

                return [
                    ...((array) $row),
                    'party' =>
                        $row->company_name
                        ?: $row->name,
                    'expired' =>
                        $row->ends_on
                        < now()->toDateString(),
                    'claims' => $history,
                ];
            })
            ->all();
    }

    private function serials(int $organizationId): array
    {
        return DB::table('inventory_serials as serial')
            ->leftJoin(
                'products as product',
                'product.id',
                '=',
                'serial.product_id',
            )
            ->leftJoin(
                'warehouses as warehouse',
                'warehouse.id',
                '=',
                'serial.warehouse_id',
            )
            ->leftJoin(
                'parties as customer',
                'customer.id',
                '=',
                'serial.customer_party_id',
            )
            ->where('serial.organization_id', $organizationId)
            ->orderByDesc('serial.id')
            ->get([
                'serial.id',
                'serial.product_id',
                'serial.serial_number',
                'serial.status',
                'serial.received_on',
                'serial.sold_on',
                'serial.customer_party_id',
                'serial.notes',
                'product.name as product',
                'warehouse.name as warehouse',
                'customer.name as customer_name',
                'customer.company_name as customer_company',
            ])
            ->map(fn ($row): array => [
                ...((array) $row),
                'customer' =>
                    $row->customer_company
                    ?: $row->customer_name,
            ])
            ->all();
    }

    private function batches(int $organizationId): array
    {
        DB::table('inventory_batches')
            ->where('organization_id', $organizationId)
            ->whereIn(
                'status',
                ['available', 'quarantine'],
            )
            ->whereNotNull('expiry_date')
            ->whereDate(
                'expiry_date',
                '<',
                now()->toDateString(),
            )
            ->update([
                'status' => 'expired',
                'updated_at' => now(),
            ]);

        return DB::table('inventory_batches as batch')
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
            ->where('batch.organization_id', $organizationId)
            ->orderBy('batch.expiry_date')
            ->orderByDesc('batch.id')
            ->get([
                'batch.id',
                'batch.product_id',
                'batch.lot_code',
                'batch.quantity',
                'batch.manufactured_on',
                'batch.expiry_date',
                'batch.status',
                'batch.notes',
                'product.name as product',
                'warehouse.name as warehouse',
            ])
            ->map(fn ($row): array => [
                ...((array) $row),
                'expired' =>
                    $row->expiry_date !== null
                    && $row->expiry_date < now()->toDateString(),
            ])
            ->all();
    }

    private function storePromise(
        Request $request,
        int $organizationId,
    ): object {
        $data = $request->validate([
            'party_id' => ['required', 'integer'],
            'financial_document_id' => ['nullable', 'integer'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'promised_on' => ['required', 'date_format:Y-m-d'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        $this->assertPartyRole(
            (int) $data['party_id'],
            'customer',
        );

        $document = null;

        if (! empty($data['financial_document_id'])) {
            $document = DB::table('financial_documents')
                ->where('organization_id', $organizationId)
                ->where('id', (int) $data['financial_document_id'])
                ->where('party_id', (int) $data['party_id'])
                ->where('kind', 'sale_invoice')
                ->whereIn(
                    'status',
                    ['issued', 'partially_paid'],
                )
                ->where('balance_due', '>', 0)
                ->first();

            if (! $document) {
                throw ValidationException::withMessages([
                    'financial_document_id' => [
                        'Choose an open sales invoice belonging to this customer.',
                    ],
                ]);
            }

            if ((float) $data['amount'] > (float) $document->balance_due + 0.00005) {
                throw ValidationException::withMessages([
                    'amount' => [
                        'The promised amount cannot exceed the selected invoice balance.',
                    ],
                ]);
            }
        }

        $workspaceCurrency = strtoupper(
            (string) (
                app(TenantContext::class)
                    ->organization()
                    ->preferences['currency']
                ?? 'ILS'
            ),
        );

        $baselineReceived = $document
            ? $this->activeInvoiceReceiptTotal(
                $organizationId,
                (int) $document->id,
            )
            : $this->activePartyReceiptTotal(
                $organizationId,
                (int) $data['party_id'],
                $workspaceCurrency,
            );

        $id = DB::table('payment_promises')->insertGetId([
            'organization_id' => $organizationId,
            ...$data,
            'baseline_balance' => $document
                ? $document->balance_due
                : null,
            'baseline_received_total' => number_format(
                $baselineReceived,
                4,
                '.',
                '',
            ),
            'status' => 'open',
            'fulfilled_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return DB::table('payment_promises')
            ->where('organization_id', $organizationId)
            ->where('id', $id)
            ->first();
    }

    private function storeOpportunity(
        Request $request,
        int $organizationId,
    ): object {
        $data = $request->validate([
            'party_id' => ['nullable', 'integer'],
            'title' => ['required', 'string', 'max:180'],
            'stage' => [
                'nullable',
                Rule::in([
                    'prospect',
                    'contacted',
                    'quoted',
                    'negotiating',
                    'won',
                    'lost',
                ]),
            ],
            'expected_value' => ['nullable', 'numeric', 'min:0'],
            'probability' => ['nullable', 'integer', 'between:0,100'],
            'expected_close_on' => ['nullable', 'date_format:Y-m-d'],
            'next_action_on' => ['nullable', 'date_format:Y-m-d'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        if (! empty($data['party_id'])) {
            $this->assertTenantRecord(
                'parties',
                (int) $data['party_id'],
                $organizationId,
            );
        }

        $stage = $data['stage'] ?? 'prospect';

        $id = DB::table('sales_opportunities')->insertGetId([
            'organization_id' => $organizationId,
            'party_id' => $data['party_id'] ?? null,
            'title' => $data['title'],
            'stage' => $stage,
            'expected_value' => $data['expected_value'] ?? 0,
            'probability' => $data['probability']
                ?? $this->stageProbability($stage),
            'expected_close_on' => $data['expected_close_on'] ?? null,
            'next_action_on' => $data['next_action_on'] ?? null,
            'notes' => $data['notes'] ?? null,
            'lost_reason' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return DB::table('sales_opportunities')
            ->where('organization_id', $organizationId)
            ->where('id', $id)
            ->first();
    }

    private function storeTradeDocument(
        Request $request,
        int $organizationId,
        string $kind,
    ): object {
        $data = $request->validate([
            'party_id' => ['required', 'integer'],
            'issue_date' => ['nullable', 'date_format:Y-m-d'],
            'valid_until' => ['nullable', 'date_format:Y-m-d'],
            'expected_on' => ['nullable', 'date_format:Y-m-d'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'lines' => ['required', 'array', 'min:1', 'max:250'],
            'lines.*.product_id' => ['nullable', 'integer'],
            'lines.*.warehouse_id' => ['nullable', 'integer'],
            'lines.*.description' => ['required', 'string', 'max:255'],
            'lines.*.quantity' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
            'lines.*.affects_inventory' => ['sometimes', 'boolean'],
        ]);

        $this->assertPartyRole(
            (int) $data['party_id'],
            $kind === 'purchase_order'
                ? 'supplier'
                : 'customer',
        );

        foreach ($data['lines'] as $index => $line) {
            $product = null;

            if (! empty($line['product_id'])) {
                $this->assertTenantRecord(
                    'products',
                    (int) $line['product_id'],
                    $organizationId,
                );

                $product = Product::query()
                    ->find((int) $line['product_id']);
            }

            if (! empty($line['warehouse_id'])) {
                $this->assertTenantRecord(
                    'warehouses',
                    (int) $line['warehouse_id'],
                    $organizationId,
                );
            }

            $affectsInventory =
                (bool) (
                    $line['affects_inventory']
                    ?? false
                );

            if (
                $affectsInventory
                && (
                    ! $product
                    || ! $product->tracksInventory()
                    || empty($line['warehouse_id'])
                )
            ) {
                throw ValidationException::withMessages([
                    "lines.$index.affects_inventory" => [
                        'Inventory impact requires a tracked product and warehouse.',
                    ],
                ]);
            }
        }

        $currency = strtoupper(
            (string) (
                app(TenantContext::class)
                    ->organization()
                    ->preferences['currency']
                ?? 'ILS'
            ),
        );

        $total = collect($data['lines'])
            ->sum(
                fn (array $line): float =>
                    (float) $line['quantity']
                    * (float) $line['unit_price'],
            );

        return DB::transaction(function () use (
            $data,
            $organizationId,
            $kind,
            $currency,
            $total,
        ): object {
            $id = DB::table('trade_documents')->insertGetId([
                'organization_id' => $organizationId,
                'party_id' => (int) $data['party_id'],
                'kind' => $kind,
                'number' => 'PENDING-'.uniqid(),
                'status' => 'draft',
                'issue_date' => $data['issue_date']
                    ?? now()->toDateString(),
                'valid_until' => $data['valid_until'] ?? null,
                'expected_on' => $data['expected_on'] ?? null,
                'currency' => $currency,
                'total' => number_format($total, 4, '.', ''),
                'notes' => $data['notes'] ?? null,
                'converted_financial_document_id' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $prefix = match ($kind) {
                'quotation' => 'QUO',
                'proforma' => 'PRO',
                'sales_order' => 'SO',
                'purchase_order' => 'PO',
                default => 'DOC',
            };

            DB::table('trade_documents')
                ->where('id', $id)
                ->where('organization_id', $organizationId)
                ->update([
                    'number' => $prefix
                        .'-'
                        .now()->format('Y')
                        .'-'
                        .str_pad((string) $id, 5, '0', STR_PAD_LEFT),
                ]);

            foreach ($data['lines'] as $line) {
                DB::table('trade_document_lines')->insert([
                    'organization_id' => $organizationId,
                    'trade_document_id' => $id,
                    'product_id' => $line['product_id'] ?? null,
                    'warehouse_id' => $line['warehouse_id'] ?? null,
                    'description' => $line['description'],
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'fulfilled_quantity' => 0,
                    'invoiced_quantity' => 0,
                    'affects_inventory' =>
                        (bool) ($line['affects_inventory'] ?? false),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            return DB::table('trade_documents')
                ->where('organization_id', $organizationId)
                ->where('id', $id)
                ->first();
        });
    }

    private function storeReturn(
        Request $request,
        int $organizationId,
    ): object {
        $data = $request->validate([
            'financial_document_id' => ['required', 'integer'],
            'reason' => ['required', 'string', 'max:160'],
            'total_quantity' => ['required', 'numeric', 'gt:0'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $document = DB::table('financial_documents')
            ->where('organization_id', $organizationId)
            ->where('id', (int) $data['financial_document_id'])
            ->whereIn(
                'kind',
                ['sale_invoice', 'purchase_invoice'],
            )
            ->whereIn(
                'status',
                ['issued', 'partially_paid', 'paid', 'overpaid'],
            )
            ->first();

        abort_unless($document, 404);

        $documentQuantity = (float) DB::table(
            'financial_document_lines',
        )
            ->where(
                'financial_document_id',
                $document->id,
            )
            ->sum('quantity');

        $reservedReturnQuantity = (float) DB::table(
            'return_requests',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'financial_document_id',
                $document->id,
            )
            ->whereNotIn(
                'status',
                ['rejected', 'cancelled'],
            )
            ->sum('total_quantity');

        $returnableQuantity = max(
            $documentQuantity
            - $reservedReturnQuantity,
            0,
        );

        if (
            (float) $data['total_quantity']
            > $returnableQuantity + 0.00005
        ) {
            throw ValidationException::withMessages([
                'total_quantity' => [
                    'Return quantity exceeds the quantity still available to return on the original invoice.',
                ],
            ]);
        }

        $id = DB::table('return_requests')->insertGetId([
            'organization_id' => $organizationId,
            'financial_document_id' => $document->id,
            'party_id' => $document->party_id,
            'kind' => $document->kind === 'sale_invoice'
                ? 'sale_return'
                : 'purchase_return',
            'status' => 'requested',
            'reason' => $data['reason'],
            'total_quantity' => $data['total_quantity'],
            'items' => null,
            'notes' => $data['notes'] ?? null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return DB::table('return_requests')
            ->where('organization_id', $organizationId)
            ->where('id', $id)
            ->first();
    }

    private function storeWarranty(
        Request $request,
        int $organizationId,
    ): object {
        $data = $request->validate([
            'party_id' => ['nullable', 'integer'],
            'product_id' => ['required', 'integer'],
            'financial_document_id' => ['nullable', 'integer'],
            'serial_number' => ['nullable', 'string', 'max:160'],
            'starts_on' => ['required', 'date_format:Y-m-d'],
            'ends_on' => ['required', 'date_format:Y-m-d', 'after_or_equal:starts_on'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $this->assertTenantRecord(
            'products',
            (int) $data['product_id'],
            $organizationId,
        );

        if (! empty($data['party_id'])) {
            $this->assertPartyRole(
                (int) $data['party_id'],
                'customer',
            );
        }

        if (! empty($data['financial_document_id'])) {
            $document = $this->financialDocument(
                (int) $data['financial_document_id'],
                $organizationId,
                'sale_invoice',
            );

            $this->assertTraceableDocumentStatus(
                $document,
                'financial_document_id',
            );

            if (
                ! empty($data['party_id'])
                && (int) $document->party_id
                    !== (int) $data['party_id']
            ) {
                throw ValidationException::withMessages([
                    'financial_document_id' => [
                        'The warranty invoice must belong to the selected customer.',
                    ],
                ]);
            }

            $this->assertDocumentContainsProduct(
                (int) $document->id,
                (int) $data['product_id'],
                'financial_document_id',
                'The warranty product must appear on the selected sales invoice.',
            );
        }

        $id = DB::table('warranty_records')->insertGetId([
            'organization_id' => $organizationId,
            ...$data,
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return DB::table('warranty_records')
            ->where('organization_id', $organizationId)
            ->where('id', $id)
            ->first();
    }

    private function storeSerial(
        Request $request,
        int $organizationId,
    ): object {
        $data = $request->validate([
            'product_id' => ['required', 'integer'],
            'warehouse_id' => ['nullable', 'integer'],
            'supplier_party_id' => ['nullable', 'integer'],
            'customer_party_id' => ['nullable', 'integer'],
            'source_purchase_document_id' => ['nullable', 'integer'],
            'source_sale_document_id' => ['nullable', 'integer'],
            'serial_number' => [
                'required',
                'string',
                'max:180',
                Rule::unique('inventory_serials', 'serial_number')
                    ->where(
                        'organization_id',
                        $organizationId,
                    ),
            ],
            'status' => [
                'nullable',
                Rule::in([
                    'in_stock',
                    'reserved',
                    'sold',
                    'returned',
                    'service',
                    'scrapped',
                ]),
            ],
            'received_on' => ['nullable', 'date_format:Y-m-d'],
            'sold_on' => ['nullable', 'date_format:Y-m-d'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $this->assertTenantRecord(
            'products',
            (int) $data['product_id'],
            $organizationId,
        );

        $serialProduct = Product::query()
            ->findOrFail(
                (int) $data['product_id'],
            );

        if (! $serialProduct->isInventoryEligible()) {
            throw ValidationException::withMessages([
                'product_id' => [
                    'Serial numbers can only be assigned to physical inventory products.',
                ],
            ]);
        }

        if (! empty($data['supplier_party_id'])) {
            $this->assertPartyRole(
                (int) $data['supplier_party_id'],
                'supplier',
            );
        }

        if (! empty($data['customer_party_id'])) {
            $this->assertPartyRole(
                (int) $data['customer_party_id'],
                'customer',
            );
        }

        if (! empty($data['warehouse_id'])) {
            $this->assertTenantRecord(
                'warehouses',
                (int) $data['warehouse_id'],
                $organizationId,
            );
        }

        if (! empty($data['source_purchase_document_id'])) {
            $purchase = $this->financialDocument(
                (int) $data['source_purchase_document_id'],
                $organizationId,
                'purchase_invoice',
            );

            $this->assertTraceableDocumentStatus(
                $purchase,
                'source_purchase_document_id',
            );

            if (
                ! empty($data['supplier_party_id'])
                && (int) $purchase->party_id
                    !== (int) $data['supplier_party_id']
            ) {
                throw ValidationException::withMessages([
                    'source_purchase_document_id' => [
                        'The purchase invoice must belong to the selected supplier.',
                    ],
                ]);
            }

            $this->assertDocumentContainsProduct(
                (int) $purchase->id,
                (int) $data['product_id'],
                'source_purchase_document_id',
                'The serial product must appear on the selected purchase invoice.',
            );
        }

        if (! empty($data['source_sale_document_id'])) {
            $sale = $this->financialDocument(
                (int) $data['source_sale_document_id'],
                $organizationId,
                'sale_invoice',
            );

            $this->assertTraceableDocumentStatus(
                $sale,
                'source_sale_document_id',
            );

            if (
                ! empty($data['customer_party_id'])
                && (int) $sale->party_id
                    !== (int) $data['customer_party_id']
            ) {
                throw ValidationException::withMessages([
                    'source_sale_document_id' => [
                        'The sales invoice must belong to the selected customer.',
                    ],
                ]);
            }

            $this->assertDocumentContainsProduct(
                (int) $sale->id,
                (int) $data['product_id'],
                'source_sale_document_id',
                'The serial product must appear on the selected sales invoice.',
            );
        }

        if (
            ($data['status'] ?? 'in_stock') === 'sold'
            && empty($data['customer_party_id'])
        ) {
            throw ValidationException::withMessages([
                'customer_party_id' => [
                    'A customer is required when a serial number is marked as sold.',
                ],
            ]);
        }

        $id = DB::table('inventory_serials')->insertGetId([
            'organization_id' => $organizationId,
            ...$data,
            'status' => $data['status'] ?? 'in_stock',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return DB::table('inventory_serials')
            ->where('organization_id', $organizationId)
            ->where('id', $id)
            ->first();
    }

    private function storeBatch(
        Request $request,
        int $organizationId,
    ): object {
        $data = $request->validate([
            'product_id' => ['required', 'integer'],
            'warehouse_id' => ['nullable', 'integer'],
            'supplier_party_id' => ['nullable', 'integer'],
            'lot_code' => ['required', 'string', 'max:160'],
            'quantity' => ['required', 'numeric', 'gt:0'],
            'manufactured_on' => ['nullable', 'date_format:Y-m-d'],
            'expiry_date' => [
                'nullable',
                'date_format:Y-m-d',
            ],
            'status' => [
                'nullable',
                Rule::in([
                    'available',
                    'quarantine',
                    'depleted',
                    'expired',
                    'recalled',
                ]),
            ],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $this->assertTenantRecord(
            'products',
            (int) $data['product_id'],
            $organizationId,
        );

        $batchProduct = Product::query()
            ->findOrFail(
                (int) $data['product_id'],
            );

        if (! $batchProduct->isInventoryEligible()) {
            throw ValidationException::withMessages([
                'product_id' => [
                    'Batch tracking can only be used with physical inventory products.',
                ],
            ]);
        }

        if (
            ! empty($data['manufactured_on'])
            && ! empty($data['expiry_date'])
            && $data['expiry_date']
                < $data['manufactured_on']
        ) {
            throw ValidationException::withMessages([
                'expiry_date' => [
                    'Expiry date cannot be before the manufacturing date.',
                ],
            ]);
        }

        if (! empty($data['warehouse_id'])) {
            $this->assertTenantRecord(
                'warehouses',
                (int) $data['warehouse_id'],
                $organizationId,
            );
        }

        if (! empty($data['supplier_party_id'])) {
            $this->assertPartyRole(
                (int) $data['supplier_party_id'],
                'supplier',
            );
        }

        $duplicate = DB::table('inventory_batches')
            ->where('organization_id', $organizationId)
            ->where('product_id', (int) $data['product_id'])
            ->where('lot_code', $data['lot_code'])
            ->exists();

        if ($duplicate) {
            throw ValidationException::withMessages([
                'lot_code' => [
                    'This lot code already exists for the selected product.',
                ],
            ]);
        }

        $id = DB::table('inventory_batches')->insertGetId([
            'organization_id' => $organizationId,
            ...$data,
            'status' => $data['status'] ?? 'available',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return DB::table('inventory_batches')
            ->where('organization_id', $organizationId)
            ->where('id', $id)
            ->first();
    }

    private function updatePromise(
        Request $request,
        int $organizationId,
        int $record,
    ): object {
        $data = $request->validate([
            'status' => [
                'required',
                Rule::in([
                    'open',
                    'fulfilled',
                    'missed',
                    'cancelled',
                ]),
            ],
        ]);

        $current = DB::table('payment_promises')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->first();

        abort_unless($current, 404);

        $transitions = [
            'open' => [
                'fulfilled',
                'missed',
                'cancelled',
            ],
            'missed' => [
                'open',
                'fulfilled',
                'cancelled',
            ],
            'fulfilled' => [],
            'cancelled' => [],
        ];

        if (
            $data['status'] !== $current->status
            && ! in_array(
                $data['status'],
                $transitions[
                    $current->status
                ] ?? [],
                true,
            )
        ) {
            throw ValidationException::withMessages([
                'status' => [
                    'This payment promise status transition is not allowed.',
                ],
            ]);
        }

        DB::table('payment_promises')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->update([
                'status' => $data['status'],
                'fulfilled_at' =>
                    $data['status'] === 'fulfilled'
                        ? ($current->fulfilled_at ?? now())
                        : null,
                'updated_at' => now(),
            ]);

        return DB::table('payment_promises')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->first();
    }

    private function updateOpportunity(
        Request $request,
        int $organizationId,
        int $record,
    ): object {
        $data = $request->validate([
            'stage' => [
                'required',
                Rule::in([
                    'prospect',
                    'contacted',
                    'quoted',
                    'negotiating',
                    'won',
                    'lost',
                ]),
            ],
            'lost_reason' => ['nullable', 'string', 'max:2000'],
        ]);

        $this->assertTenantRecord(
            'sales_opportunities',
            $record,
            $organizationId,
        );

        DB::table('sales_opportunities')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->update([
                'stage' => $data['stage'],
                'probability' => $this->stageProbability(
                    $data['stage'],
                ),
                'lost_reason' => $data['stage'] === 'lost'
                    ? ($data['lost_reason'] ?? null)
                    : null,
                'updated_at' => now(),
            ]);

        return DB::table('sales_opportunities')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->first();
    }

    private function updateTradeDocument(
        Request $request,
        int $organizationId,
        int $record,
        string $kind,
    ): object {
        $document = DB::table('trade_documents')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->where('kind', $kind)
            ->first();

        abort_unless($document, 404);

        if (
            in_array(
                $kind,
                ['sales_order', 'purchase_order'],
                true,
            )
            && $request->has('fulfilled_quantity')
        ) {
            if (
                in_array(
                    $document->status,
                    ['cancelled', 'invoiced'],
                    true,
                )
            ) {
                throw ValidationException::withMessages([
                    'status' => [
                        'Cancelled or fully invoiced orders cannot be fulfilled again.',
                    ],
                ]);
            }

            $data = $request->validate([
                'line_id' => ['required', 'integer'],
                'fulfilled_quantity' => [
                    'required',
                    'numeric',
                    'min:0',
                ],
            ]);

            $line = DB::table('trade_document_lines')
                ->where('organization_id', $organizationId)
                ->where('trade_document_id', $record)
                ->where('id', (int) $data['line_id'])
                ->first();

            abort_unless($line, 404);

            if (
                (float) $data['fulfilled_quantity']
                > (float) $line->quantity
            ) {
                throw ValidationException::withMessages([
                    'fulfilled_quantity' => [
                        'Fulfilled quantity cannot exceed ordered quantity.',
                    ],
                ]);
            }

            if (
                (float) $data['fulfilled_quantity']
                + 0.00005
                < (float) $line->invoiced_quantity
            ) {
                throw ValidationException::withMessages([
                    'fulfilled_quantity' => [
                        'Fulfilled quantity cannot be lower than the quantity already invoiced.',
                    ],
                ]);
            }

            DB::table('trade_document_lines')
                ->where('organization_id', $organizationId)
                ->where('id', $line->id)
                ->update([
                    'fulfilled_quantity' =>
                        $data['fulfilled_quantity'],
                    'updated_at' => now(),
                ]);

            $totals = DB::table('trade_document_lines')
                ->where('organization_id', $organizationId)
                ->where('trade_document_id', $record)
                ->selectRaw(
                    'SUM(quantity) as quantity,
                     SUM(fulfilled_quantity) as fulfilled,
                     SUM(invoiced_quantity) as invoiced',
                )
                ->first();

            $ordered =
                (float) ($totals->quantity ?? 0);
            $fulfilled =
                (float) ($totals->fulfilled ?? 0);
            $invoiced =
                (float) ($totals->invoiced ?? 0);

            $status = match (true) {
                $fulfilled <= 0.00005 =>
                    $document->status === 'confirmed'
                        ? 'confirmed'
                        : 'draft',
                $fulfilled + 0.00005 >= $ordered
                    && $invoiced + 0.00005 >= $fulfilled =>
                    'invoiced',
                $invoiced > 0.00005 =>
                    'partial_invoiced',
                $fulfilled + 0.00005 >= $ordered =>
                    'fulfilled',
                default => 'partial',
            };

            DB::table('trade_documents')
                ->where('organization_id', $organizationId)
                ->where('id', $record)
                ->update([
                    'status' => $status,
                    'updated_at' => now(),
                ]);
        } else {
            $allowed = match ($kind) {
                'quotation' => [
                    'draft',
                    'sent',
                    'accepted',
                    'rejected',
                    'expired',
                    'converted',
                ],
                'proforma' => [
                    'draft',
                    'sent',
                    'accepted',
                    'cancelled',
                    'converted',
                ],
                'sales_order', 'purchase_order' => [
                    'confirmed',
                    'cancelled',
                ],
                default => [],
            };

            $data = $request->validate([
                'status' => [
                    'required',
                    Rule::in($allowed),
                ],
            ]);

            if (
                in_array(
                    $kind,
                    ['sales_order', 'purchase_order'],
                    true,
                )
            ) {
                if (
                    $data['status'] === 'confirmed'
                    && $document->status !== 'draft'
                ) {
                    throw ValidationException::withMessages([
                        'status' => [
                            'Only a draft order can be confirmed.',
                        ],
                    ]);
                }

                if (
                    $data['status'] === 'cancelled'
                    && in_array(
                        $document->status,
                        ['cancelled', 'invoiced'],
                        true,
                    )
                ) {
                    throw ValidationException::withMessages([
                        'status' => [
                            'This order can no longer be cancelled.',
                        ],
                    ]);
                }

                if ($data['status'] === 'cancelled') {
                    $lineState = DB::table(
                        'trade_document_lines',
                    )
                        ->where(
                            'organization_id',
                            $organizationId,
                        )
                        ->where(
                            'trade_document_id',
                            $record,
                        )
                        ->selectRaw(
                            'SUM(fulfilled_quantity) as fulfilled,
                             SUM(invoiced_quantity) as invoiced',
                        )
                        ->first();

                    if (
                        (float) ($lineState?->fulfilled ?? 0)
                        >
                        (float) ($lineState?->invoiced ?? 0)
                            + 0.00005
                    ) {
                        throw ValidationException::withMessages([
                            'status' => [
                                'Invoice fulfilled quantities before cancelling the remaining order.',
                            ],
                        ]);
                    }
                }
            }

            DB::table('trade_documents')
                ->where('organization_id', $organizationId)
                ->where('id', $record)
                ->update([
                    'status' => $data['status'],
                    'updated_at' => now(),
                ]);
        }

        return DB::table('trade_documents')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->first();
    }

    private function updateReturn(
        Request $request,
        int $organizationId,
        int $record,
    ): object {
        $current = DB::table('return_requests')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->first();

        abort_unless($current, 404);

        $data = $request->validate([
            'status' => [
                'required',
                Rule::in([
                    'requested',
                    'approved',
                    'received',
                    'completed',
                    'rejected',
                    'cancelled',
                ]),
            ],
        ]);

        $transitions = [
            'requested' => [
                'approved',
                'rejected',
                'cancelled',
            ],
            'approved' => [
                'received',
                'cancelled',
            ],
            'received' => [
                'completed',
            ],
            'completed' => [],
            'rejected' => [],
            'cancelled' => [],
        ];

        $allowed =
            $transitions[$current->status]
            ?? [];

        if (
            $data['status'] !== $current->status
            && ! in_array(
                $data['status'],
                $allowed,
                true,
            )
        ) {
            throw ValidationException::withMessages([
                'status' => [
                    'This return status transition is not allowed.',
                ],
            ]);
        }

        DB::table('return_requests')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->update([
                'status' => $data['status'],
                'updated_at' => now(),
            ]);

        return DB::table('return_requests')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->first();
    }

    private function updateSimpleStatus(
        Request $request,
        int $organizationId,
        string $table,
        int $record,
        array $allowed,
    ): object {
        $data = $request->validate([
            'status' => [
                'required',
                Rule::in($allowed),
            ],
        ]);

        $this->assertTenantRecord(
            $table,
            $record,
            $organizationId,
        );

        DB::table($table)
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->update([
                'status' => $data['status'],
                'updated_at' => now(),
            ]);

        return DB::table($table)
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->first();
    }

    private function updateSerial(
        Request $request,
        int $organizationId,
        int $record,
    ): object {
        $data = $request->validate([
            'status' => [
                'required',
                Rule::in([
                    'in_stock',
                    'reserved',
                    'sold',
                    'returned',
                    'service',
                    'scrapped',
                ]),
            ],
            'customer_party_id' => ['nullable', 'integer'],
            'source_sale_document_id' => ['nullable', 'integer'],
            'sold_on' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $current = DB::table('inventory_serials')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->first();

        abort_unless($current, 404);

        $serialTransitions = [
            'in_stock' => [
                'reserved',
                'sold',
                'service',
                'scrapped',
            ],
            'reserved' => [
                'in_stock',
                'sold',
                'service',
                'scrapped',
            ],
            'sold' => [
                'returned',
                'service',
            ],
            'returned' => [
                'in_stock',
                'service',
                'scrapped',
            ],
            'service' => [
                'in_stock',
                'returned',
                'scrapped',
            ],
            'scrapped' => [],
        ];

        if (
            $data['status'] !== $current->status
            && ! in_array(
                $data['status'],
                $serialTransitions[
                    $current->status
                ] ?? [],
                true,
            )
        ) {
            throw ValidationException::withMessages([
                'status' => [
                    'This serial number status transition is not allowed.',
                ],
            ]);
        }

        foreach (
            [
                ['parties', 'customer_party_id'],
                ['financial_documents', 'source_sale_document_id'],
            ] as [$table, $field]
        ) {
            if (! empty($data[$field])) {
                $this->assertTenantRecord(
                    $table,
                    (int) $data[$field],
                    $organizationId,
                );
            }
        }

        $customerPartyId = array_key_exists(
            'customer_party_id',
            $data,
        )
            ? $data['customer_party_id']
            : $current->customer_party_id;

        $saleDocumentId = array_key_exists(
            'source_sale_document_id',
            $data,
        )
            ? $data['source_sale_document_id']
            : $current->source_sale_document_id;

        if (
            $data['status'] === 'sold'
            && empty($customerPartyId)
        ) {
            throw ValidationException::withMessages([
                'customer_party_id' => [
                    'A customer is required when a serial number is marked as sold.',
                ],
            ]);
        }

        if (! empty($customerPartyId)) {
            $this->assertPartyRole(
                (int) $customerPartyId,
                'customer',
            );
        }

        if (! empty($saleDocumentId)) {
            $sale = $this->financialDocument(
                (int) $saleDocumentId,
                $organizationId,
                'sale_invoice',
            );

            $this->assertTraceableDocumentStatus(
                $sale,
                'source_sale_document_id',
            );

            $this->assertDocumentContainsProduct(
                (int) $sale->id,
                (int) $current->product_id,
                'source_sale_document_id',
                'The serial product must appear on the selected sales invoice.',
            );

            if (
                ! empty($customerPartyId)
                && (int) $sale->party_id
                    !== (int) $customerPartyId
            ) {
                throw ValidationException::withMessages([
                    'source_sale_document_id' => [
                        'The sales invoice must belong to the selected customer.',
                    ],
                ]);
            }
        }

        DB::table('inventory_serials')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->update([
                'status' => $data['status'],
                'customer_party_id' => $customerPartyId,
                'source_sale_document_id' => $saleDocumentId,
                'sold_on' => $data['status'] === 'sold'
                    ? (
                        $data['sold_on']
                        ?? $current->sold_on
                        ?? now()->toDateString()
                    )
                    : $current->sold_on,
                'updated_at' => now(),
            ]);

        return DB::table('inventory_serials')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->first();
    }

    private function updateBatch(
        Request $request,
        int $organizationId,
        int $record,
    ): object {
        $data = $request->validate([
            'status' => [
                'required',
                Rule::in([
                    'available',
                    'quarantine',
                    'depleted',
                    'expired',
                    'recalled',
                ]),
            ],
            'quantity' => ['nullable', 'numeric', 'min:0'],
        ]);

        $current = DB::table('inventory_batches')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->first();

        abort_unless($current, 404);

        $batchTransitions = [
            'available' => [
                'quarantine',
                'depleted',
                'expired',
                'recalled',
            ],
            'quarantine' => [
                'available',
                'depleted',
                'expired',
                'recalled',
            ],
            'recalled' => [
                'available',
                'quarantine',
                'depleted',
                'expired',
            ],
            'depleted' => [
                'available',
                'quarantine',
            ],
            'expired' => [],
        ];

        if (
            $data['status'] !== $current->status
            && ! in_array(
                $data['status'],
                $batchTransitions[
                    $current->status
                ] ?? [],
                true,
            )
        ) {
            throw ValidationException::withMessages([
                'status' => [
                    'This batch status transition is not allowed.',
                ],
            ]);
        }

        $quantity = array_key_exists(
            'quantity',
            $data,
        )
            ? (float) $data['quantity']
            : (float) $current->quantity;

        if (
            $data['status'] === 'available'
            && $current->expiry_date
            && $current->expiry_date
                < now()->toDateString()
        ) {
            throw ValidationException::withMessages([
                'status' => [
                    'An expired batch cannot be made available.',
                ],
            ]);
        }

        if (
            $current->status === 'depleted'
            && $data['status'] === 'available'
            && $quantity <= 0.00005
        ) {
            throw ValidationException::withMessages([
                'quantity' => [
                    'Increase the batch quantity before making a depleted batch available again.',
                ],
            ]);
        }

        $status =
            $data['status'] === 'available'
            && $quantity <= 0.00005
                ? 'depleted'
                : $data['status'];

        DB::table('inventory_batches')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->update([
                'status' => $status,
                ...(
                    array_key_exists('quantity', $data)
                        ? [
                            'quantity' =>
                                $data['quantity'],
                        ]
                        : []
                ),
                'updated_at' => now(),
            ]);

        return DB::table('inventory_batches')
            ->where('organization_id', $organizationId)
            ->where('id', $record)
            ->first();
    }

    private function activeInvoiceReceiptTotal(
        int $organizationId,
        int $documentId,
    ): float {
        return (float) DB::table(
            'cash_allocations as allocation',
        )
            ->join(
                'cash_movements as movement',
                'movement.id',
                '=',
                'allocation.cash_movement_id',
            )
            ->where(
                'movement.organization_id',
                $organizationId,
            )
            ->where(
                'allocation.financial_document_id',
                $documentId,
            )
            ->where('movement.status', 'posted')
            ->where('movement.direction', 'incoming')
            ->where(
                'movement.category',
                'customer_receipt',
            )
            ->whereNull('movement.reversal_of_id')
            ->where(function ($query): void {
                $query
                    ->where('movement.method', '!=', 'check')
                    ->orWhereNull('movement.check_status')
                    ->orWhereNotIn(
                        'movement.check_status',
                        ['bounced', 'cancelled'],
                    );
            })
            ->sum('allocation.amount');
    }

    private function activePartyReceiptTotal(
        int $organizationId,
        int $partyId,
        string $currency,
    ): float {
        return (float) DB::table('cash_movements')
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where('party_id', $partyId)
            ->where('currency', $currency)
            ->where('status', 'posted')
            ->where('direction', 'incoming')
            ->where('category', 'customer_receipt')
            ->whereNull('reversal_of_id')
            ->where(function ($query): void {
                $query
                    ->where('method', '!=', 'check')
                    ->orWhereNull('check_status')
                    ->orWhereNotIn(
                        'check_status',
                        ['bounced', 'cancelled'],
                    );
            })
            ->sum('amount');
    }

    private function stageProbability(string $stage): int
    {
        return match ($stage) {
            'prospect' => 10,
            'contacted' => 25,
            'quoted' => 50,
            'negotiating' => 75,
            'won' => 100,
            'lost' => 0,
            default => 10,
        };
    }

    private function assertTenantRecord(
        string $table,
        int $id,
        int $organizationId,
    ): void {
        abort_unless(
            DB::table($table)
                ->where('organization_id', $organizationId)
                ->where('id', $id)
                ->exists(),
            404,
        );
    }

    private function financialDocument(
        int $documentId,
        int $organizationId,
        string $kind,
    ): object {
        $document = DB::table('financial_documents')
            ->where('organization_id', $organizationId)
            ->where('id', $documentId)
            ->where('kind', $kind)
            ->first();

        if (! $document) {
            throw ValidationException::withMessages([
                'financial_document_id' => [
                    $kind === 'sale_invoice'
                        ? 'Choose a sales invoice from this workspace.'
                        : 'Choose a purchase invoice from this workspace.',
                ],
            ]);
        }

        return $document;
    }

    private function assertTraceableDocumentStatus(
        object $document,
        string $field,
    ): void {
        if (
            ! in_array(
                $document->status,
                [
                    'issued',
                    'partially_paid',
                    'paid',
                    'overpaid',
                ],
                true,
            )
        ) {
            throw ValidationException::withMessages([
                $field => [
                    'Choose an issued, paid or partially paid invoice for traceability.',
                ],
            ]);
        }
    }

    private function assertDocumentContainsProduct(
        int $documentId,
        int $productId,
        string $field,
        string $message,
    ): void {
        $exists = DB::table(
            'financial_document_lines',
        )
            ->where(
                'financial_document_id',
                $documentId,
            )
            ->where('product_id', $productId)
            ->exists();

        if (! $exists) {
            throw ValidationException::withMessages([
                $field => [$message],
            ]);
        }
    }

    private function assertPartyRole(
        int $partyId,
        string $role,
    ): void {
        $exists = Party::query()
            ->usableForNewBusiness()
            ->whereKey($partyId)
            ->whereHas(
                'roles',
                fn ($query) =>
                    $query->where('role', $role),
            )
            ->exists();

        if (! $exists) {
            throw ValidationException::withMessages([
                'party_id' => [
                    $role === 'customer'
                        ? 'Choose an active customer.'
                        : 'Choose an active supplier.',
                ],
            ]);
        }
    }

    private function authorizeFeature(
        Request $request,
        string $feature,
        bool $manage,
    ): void {
        $slug = [
            'ar-aging' => 'ar_aging',
            'ap-aging' => 'ap_aging',
            'sales-orders' => 'sales_orders',
            'purchase-orders' => 'purchase_orders',
        ][$feature] ?? $feature;

        $permission =
            'operations.'
            .$slug
            .(
                $manage
                    ? '.manage'
                    : '.view'
            );

        if (
            WorkspaceFeaturePermissions::allows(
                $request->user(),
                $permission,
            )
        ) {
            return;
        }

        if (
            in_array(
                $feature,
                [
                    'collections',
                    'ar-aging',
                    'promises',
                    'quotations',
                    'proformas',
                    'sales-orders',
                    'backorders',
                ],
                true,
            )
        ) {
            FinanceAuthorization::authorize(
                $request->user(),
                $manage
                    ? 'finance.sales.manage'
                    : 'finance.sales.view',
            );

            return;
        }

        if (
            in_array(
                $feature,
                [
                    'ap-aging',
                    'purchase-orders',
                ],
                true,
            )
        ) {
            FinanceAuthorization::authorize(
                $request->user(),
                $manage
                    ? 'finance.purchases.manage'
                    : 'finance.purchases.view',
            );

            return;
        }

        if ($feature === 'unallocated') {
            FinanceAuthorization::authorize(
                $request->user(),
                'finance.cash.view',
            );

            return;
        }

        if ($feature === 'returns') {
            abort_unless(
                FinanceAuthorization::allows(
                    $request->user(),
                    $manage
                        ? 'finance.sales.manage'
                        : 'finance.sales.view',
                )
                || FinanceAuthorization::allows(
                    $request->user(),
                    $manage
                        ? 'finance.purchases.manage'
                        : 'finance.purchases.view',
                ),
                403,
            );

            return;
        }

        if ($feature === 'pipeline') {
            abort_unless(
                $request->user()?->can(
                    $manage ? 'create' : 'viewAny',
                    Party::class,
                ),
                403,
            );

            return;
        }

        if ($feature === 'warranties') {
            abort_unless(
                $request->user()?->can(
                    $manage ? 'create' : 'viewAny',
                    Product::class,
                ),
                403,
            );

            return;
        }

        if (
            in_array(
                $feature,
                ['serials', 'batches'],
                true,
            )
        ) {
            abort_unless(
                $request->user()?->can(
                    $manage ? 'create' : 'viewAny',
                    Warehouse::class,
                ),
                403,
            );

            return;
        }

        abort(404);
    }
}
