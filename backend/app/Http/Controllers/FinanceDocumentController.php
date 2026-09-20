<?php

namespace App\Http\Controllers;

use App\Models\CashMovement;
use App\Models\FinanceAuditEvent;
use App\Models\FinancialDocument;
use App\Services\CashMovementService;
use App\Services\FinanceAuthorization;
use App\Services\FinanceDocumentService;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class FinanceDocumentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'kind' => ['required', Rule::in(['sale_invoice', 'purchase_invoice'])],
            'status' => ['nullable', Rule::in(['draft', 'issued', 'partially_paid', 'paid', 'overpaid', 'superseded', 'voided'])],
            'party_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string', 'max:120'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'between:10,100'],
        ]);

        $this->authorizeKind($request, $data['kind'], false);

        $query = FinancialDocument::query()
            ->with('party:id,name,company_name')
            ->where('kind', $data['kind'])
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['party_id'] ?? null, fn ($query, $partyId) => $query->where('party_id', $partyId))
            ->when($data['search'] ?? null, function ($query, $search): void {
                $query->where(function ($inner) use ($search): void {
                    $inner
                        ->where('number', 'like', '%'.$search.'%')
                        ->orWhere('external_number', 'like', '%'.$search.'%')
                        ->orWhereHas('party', fn ($party) => $party
                            ->where('name', 'like', '%'.$search.'%')
                            ->orWhere('company_name', 'like', '%'.$search.'%'));
                });
            })
            ->latest('issue_date')
            ->latest('id');

        $summaryQuery = clone $query;
        $summaryRows = $summaryQuery->get(['status', 'total', 'paid_total', 'balance_due', 'due_date']);

        $paginator = $query->paginate($data['per_page'] ?? 20);

        return response()->json([
            'data' => collect($paginator->items())->map(fn (FinancialDocument $document) => $this->row($document))->values(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
            'summary' => [
                'count' => $summaryRows->count(),
                'total' => number_format((float) $summaryRows->sum(fn ($row) => (float) $row->total), 4, '.', ''),
                'paid' => number_format((float) $summaryRows->sum(fn ($row) => (float) $row->paid_total), 4, '.', ''),
                'outstanding' => number_format((float) $summaryRows->sum(fn ($row) => (float) $row->balance_due), 4, '.', ''),
                'overdue' => $summaryRows
                    ->whereIn('status', ['issued', 'partially_paid'])
                    ->filter(fn (FinancialDocument $row): bool => $row->due_date !== null && $row->due_date->lt(today()))
                    ->count(),
            ],
        ]);
    }

    public function show(Request $request, string $document, FinanceDocumentService $service): JsonResponse
    {
        $document = FinancialDocument::query()->findOrFail($document);
        $this->authorizeKind($request, $document->kind, false);

        $document->load([
            'party.roles',
            'warehouse',
            'department',
            'lines.product',
            'lines.warehouse',
            'lines.taxRule',
            'allocations.movement',
        ]);

        return response()->json([
            'data' => $this->detail($document, $service),
            'audit' => FinanceAuditEvent::query()
                ->where('auditable_type', 'FinancialDocument')
                ->where('auditable_id', $document->id)
                ->latest('id')
                ->limit(100)
                ->get()
                ->map(fn (FinanceAuditEvent $event) => [
                    'id' => $event->id,
                    'action' => $event->action,
                    'reason' => $event->reason,
                    'created_by' => $event->created_by,
                    'created_at' => $event->created_at?->toIso8601String(),
                ]),
        ]);
    }

    public function availableCredits(Request $request, string $document): JsonResponse
    {
        $document = FinancialDocument::query()->findOrFail($document);
        $this->authorizeKind($request, $document->kind, false);
        FinanceAuthorization::authorize($request->user(), 'finance.cash.view');

        if (! $document->party_id || ! in_array($document->status, ['issued', 'partially_paid'], true)) {
            return response()->json(['data' => []]);
        }

        $direction = $document->isSale() ? 'incoming' : 'outgoing';
        $category = $document->isSale() ? 'customer_receipt' : 'supplier_payment';

        $credits = CashMovement::query()
            ->with('allocations:id,cash_movement_id,financial_document_id,amount')
            ->where('party_id', $document->party_id)
            ->where('direction', $direction)
            ->where('category', $category)
            ->where('currency', $document->currency)
            ->where('status', 'posted')
            ->whereNull('reversal_of_id')
            ->where(function ($query): void {
                $query
                    ->where('method', '!=', 'check')
                    ->orWhereNull('check_status')
                    ->orWhereNotIn('check_status', ['bounced', 'cancelled']);
            })
            ->latest('movement_date')
            ->latest('id')
            ->limit(100)
            ->get()
            ->map(function (CashMovement $movement): ?array {
                $allocated = (float) $movement->allocations
                    ->sum(fn ($allocation): float => (float) $allocation->amount);
                $available = max((float) $movement->amount - $allocated, 0);

                if ($available <= 0.00005) {
                    return null;
                }

                return [
                    'id' => $movement->id,
                    'number' => $movement->number,
                    'movement_date' => $movement->movement_date->format('Y-m-d'),
                    'method' => $movement->method,
                    'amount' => $movement->amount,
                    'allocated' => number_format($allocated, 4, '.', ''),
                    'available' => number_format($available, 4, '.', ''),
                    'currency' => $movement->currency,
                ];
            })
            ->filter()
            ->values();

        return response()->json(['data' => $credits]);
    }

    public function applyCredit(
        Request $request,
        string $document,
        CashMovementService $cashService,
        FinanceDocumentService $documentService,
    ): JsonResponse {
        $document = FinancialDocument::query()->findOrFail($document);
        $this->authorizeKind($request, $document->kind, true);
        FinanceAuthorization::authorize(
            $request->user(),
            $document->isSale() ? 'finance.cash.receive' : 'finance.cash.pay',
        );

        $data = $request->validate([
            'movement_id' => ['required', 'integer'],
            'amount' => ['required', 'numeric', 'gt:0', 'max:999999999999'],
        ]);

        $movement = CashMovement::query()->findOrFail((int) $data['movement_id']);

        $cashService->applyAvailableCredit(
            $movement,
            $document,
            (string) $data['amount'],
            $request->user()->id,
        );

        $document = FinancialDocument::query()->findOrFail($document->id);
        $document->load([
            'party.roles',
            'warehouse',
            'department',
            'lines.product',
            'lines.warehouse',
            'lines.taxRule',
            'allocations.movement',
        ]);

        return response()->json([
            'data' => $this->detail($document, $documentService),
        ]);
    }

    public function store(Request $request, FinanceDocumentService $service): JsonResponse
    {
        abort_unless(
            FinanceAuthorization::allows($request->user(), 'finance.sales.manage')
            || FinanceAuthorization::allows($request->user(), 'finance.purchases.manage'),
            403,
        );

        $data = $this->validatedDocument($request);
        $this->authorizeKind($request, $data['kind'], true);

        $document = $service->createDraft($data, $request->user()->id);

        return response()->json(['data' => $this->detail($document, $service)], 201);
    }

    public function update(Request $request, string $document, FinanceDocumentService $service): JsonResponse
    {
        $document = FinancialDocument::query()->findOrFail($document);
        $this->authorizeKind($request, $document->kind, true);
        $data = $this->validatedDocument($request, $document->kind);
        $document = $service->updateDraft($document, $data, $request->user()->id);

        return response()->json(['data' => $this->detail($document, $service)]);
    }

    public function destroy(Request $request, string $document, FinanceDocumentService $service): \Illuminate\Http\Response
    {
        $document = FinancialDocument::query()->findOrFail($document);
        $this->authorizeKind($request, $document->kind, true);
        $service->deleteDraft($document, $request->user()->id);

        return response()->noContent();
    }

    public function issue(Request $request, string $document, FinanceDocumentService $service): JsonResponse
    {
        $document = FinancialDocument::query()->findOrFail($document);
        $this->authorizeKind($request, $document->kind, true);
        $data = $request->validate([
            'acknowledge_warnings' => ['sometimes', 'boolean'],
        ]);

        $document = $service->issue(
            $document,
            $request->user()->id,
            (bool) ($data['acknowledge_warnings'] ?? false),
        );

        return response()->json(['data' => $this->detail($document, $service)]);
    }

    public function correct(Request $request, string $document, FinanceDocumentService $service): JsonResponse
    {
        $document = FinancialDocument::query()->findOrFail($document);
        $this->authorizeKind($request, $document->kind, true);
        FinanceAuthorization::authorize($request->user(), 'finance.documents.correct');
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:5', 'max:1000'],
        ]);

        $replacement = $service->startCorrection(
            $document,
            $data['reason'],
            $request->user()->id,
        );

        return response()->json(['data' => $this->detail($replacement, $service)], 201);
    }

    public function void(Request $request, string $document, FinanceDocumentService $service): JsonResponse
    {
        $document = FinancialDocument::query()->findOrFail($document);
        $this->authorizeKind($request, $document->kind, true);
        FinanceAuthorization::authorize($request->user(), 'finance.documents.correct');
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:5', 'max:1000'],
        ]);

        $document = $service->void($document, $data['reason'], $request->user()->id);

        return response()->json(['data' => $this->detail($document, $service)]);
    }

    /** @return array<string, mixed> */
    private function validatedDocument(Request $request, ?string $forcedKind = null): array
    {
        $data = $request->validate([
            'kind' => [$forcedKind ? 'sometimes' : 'required', Rule::in(['sale_invoice', 'purchase_invoice'])],
            'party_id' => ['required', 'integer'],
            'warehouse_id' => ['nullable', 'integer'],
            'department_id' => ['nullable', 'integer'],
            'external_number' => ['nullable', 'string', 'max:96'],
            'issue_date' => ['required', 'date_format:Y-m-d'],
            'due_date' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:issue_date'],
            'activity_type' => ['nullable', Rule::in(['trade', 'import_distribution', 'manufacturing', 'packaging', 'services', 'other'])],
            'market_type' => ['nullable', Rule::in(['local', 'import', 'export'])],
            'branch_label' => ['nullable', 'string', 'max:120'],
            'currency' => ['required', 'regex:/^[A-Z]{3}$/'],
            'exchange_rate' => ['nullable', 'numeric', 'gt:0', 'max:999999999'],
            'shipping_total' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'payment_terms' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'internal_notes' => ['nullable', 'string', 'max:5000'],
            'lines' => ['required', 'array', 'min:1', 'max:250'],
            'lines.*.product_id' => ['nullable', 'integer'],
            'lines.*.warehouse_id' => ['nullable', 'integer'],
            'lines.*.tax_rule_id' => ['nullable', 'integer'],
            'lines.*.description' => ['nullable', 'string', 'max:255'],
            'lines.*.unit' => ['nullable', 'string', 'max:80'],
            'lines.*.quantity' => ['required', 'numeric', 'gt:0', 'max:999999999'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0', 'max:999999999999'],
            'lines.*.price_status' => ['nullable', Rule::in(['estimated', 'final'])],
            'lines.*.discount_percent' => ['nullable', 'numeric', 'between:0,100'],
            'lines.*.tax_rate' => ['nullable', 'numeric', 'between:0,100'],
            'lines.*.affects_inventory' => ['sometimes', 'boolean'],
        ]);

        if ($forcedKind) {
            $data['kind'] = $forcedKind;
        }

        $organization = app(TenantContext::class)->organization();
        $data['currency'] = strtoupper((string) ($organization->preferences['currency'] ?? 'ILS'));
        $data['exchange_rate'] = '1';

        return $data;
    }

    private function authorizeKind(Request $request, string $kind, bool $manage): void
    {
        FinanceAuthorization::authorize(
            $request->user(),
            $kind === 'sale_invoice'
                ? ($manage ? 'finance.sales.manage' : 'finance.sales.view')
                : ($manage ? 'finance.purchases.manage' : 'finance.purchases.view'),
        );
    }

    /** @return array<string, mixed> */
    private function row(FinancialDocument $document): array
    {
        return [
            'id' => $document->id,
            'number' => $document->number,
            'external_number' => $document->external_number,
            'kind' => $document->kind,
            'status' => $document->status,
            'revision' => $document->revision,
            'party' => $document->party ? [
                'id' => $document->party->id,
                'name' => $document->party->company_name ?: $document->party->name,
            ] : null,
            'issue_date' => $document->issue_date->format('Y-m-d'),
            'due_date' => $document->due_date?->format('Y-m-d'),
            'activity_type' => $document->activity_type,
            'market_type' => $document->market_type,
            'currency' => $document->currency,
            'total' => $document->total,
            'paid_total' => $document->paid_total,
            'balance_due' => $document->balance_due,
            'credit_total' => $document->credit_total,
        ];
    }

    /** @return array<string, mixed> */
    private function detail(FinancialDocument $document, FinanceDocumentService $service): array
    {
        return [
            ...$this->row($document),
            'root_document_id' => $document->root_document_id,
            'corrected_from_id' => $document->corrected_from_id,
            'warehouse_id' => $document->warehouse_id,
            'department_id' => $document->department_id,
            'branch_label' => $document->branch_label,
            'exchange_rate' => $document->exchange_rate,
            'subtotal' => $document->subtotal,
            'discount_total' => $document->discount_total,
            'tax_total' => $document->tax_total,
            'shipping_total' => $document->shipping_total,
            'payment_terms' => $document->payment_terms,
            'notes' => $document->notes,
            'internal_notes' => $document->internal_notes,
            'correction_reason' => $document->correction_reason,
            'issued_at' => $document->issued_at?->toIso8601String(),
            'warnings' => $service->warnings($document),
            'party_detail' => $document->party ? [
                'id' => $document->party->id,
                'name' => $document->party->company_name ?: $document->party->name,
                'email' => $document->party->email,
                'phone' => $document->party->phone,
                'tax_number' => $document->party->tax_number,
                'country_code' => $document->party->country_code,
                'region_code' => $document->party->state,
            ] : null,
            'lines' => $document->lines->map(fn ($line) => [
                'id' => $line->id,
                'product_id' => $line->product_id,
                'warehouse_id' => $line->warehouse_id,
                'tax_rule_id' => $line->tax_rule_id,
                'description' => $line->description,
                'sku' => $line->sku_snapshot,
                'unit' => $line->unit_snapshot,
                'quantity' => $line->quantity,
                'unit_price' => $line->unit_price,
                'price_status' => $line->price_status,
                'discount_percent' => $line->discount_percent,
                'tax_name' => $line->tax_name_snapshot,
                'tax_rate' => $line->tax_rate,
                'line_subtotal' => $line->line_subtotal,
                'line_discount' => $line->line_discount,
                'line_tax' => $line->line_tax,
                'line_total' => $line->line_total,
                'affects_inventory' => (bool) $line->affects_inventory,
            ])->values(),
            'allocations' => $document->allocations->map(fn ($allocation) => [
                'id' => $allocation->id,
                'cash_movement_id' => $allocation->cash_movement_id,
                'cash_number' => $allocation->movement?->number,
                'amount' => $allocation->amount,
                'movement_date' => $allocation->movement?->movement_date?->format('Y-m-d'),
                'method' => $allocation->movement?->method,
                'status' => $allocation->movement?->status,
            ])->values(),
        ];
    }
}
