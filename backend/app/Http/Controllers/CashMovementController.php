<?php

namespace App\Http\Controllers;

use App\Models\CashMovement;
use App\Models\FinanceAuditEvent;
use App\Services\CashMovementService;
use App\Services\FinanceAuthorization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CashMovementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.cash.view');

        $data = $request->validate([
            'direction' => ['nullable', Rule::in(['incoming', 'outgoing'])],
            'status' => ['nullable', Rule::in(['draft', 'posted', 'reversed'])],
            'category' => ['nullable', 'string', 'max:48'],
            'party_id' => ['nullable', 'integer'],
            'method' => ['nullable', 'string', 'max:32'],
            'search' => ['nullable', 'string', 'max:120'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'between:10,100'],
        ]);

        $query = CashMovement::query()
            ->with('party:id,name,company_name')
            ->when($data['direction'] ?? null, fn ($query, $direction) => $query->where('direction', $direction))
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['category'] ?? null, fn ($query, $category) => $query->where('category', $category))
            ->when($data['party_id'] ?? null, fn ($query, $partyId) => $query->where('party_id', $partyId))
            ->when($data['method'] ?? null, fn ($query, $method) => $query->where('method', $method))
            ->when($data['search'] ?? null, function ($query, $search): void {
                $query->where(function ($inner) use ($search): void {
                    $inner
                        ->where('number', 'like', '%'.$search.'%')
                        ->orWhere('reference', 'like', '%'.$search.'%')
                        ->orWhere('notes', 'like', '%'.$search.'%')
                        ->orWhereHas('party', fn ($party) => $party
                            ->where('name', 'like', '%'.$search.'%')
                            ->orWhere('company_name', 'like', '%'.$search.'%'));
                });
            })
            ->latest('movement_date')
            ->latest('id');

        $summaryRows = (clone $query)->get(['direction', 'status', 'amount']);
        $paginator = $query->paginate($data['per_page'] ?? 20);

        return response()->json([
            'data' => collect($paginator->items())->map(fn (CashMovement $movement) => $this->row($movement))->values(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
            'summary' => [
                'count' => $summaryRows->count(),
                'posted_incoming' => number_format((float) $summaryRows->where('direction', 'incoming')->where('status', 'posted')->sum(fn ($row) => (float) $row->amount), 4, '.', ''),
                'posted_outgoing' => number_format((float) $summaryRows->where('direction', 'outgoing')->where('status', 'posted')->sum(fn ($row) => (float) $row->amount), 4, '.', ''),
                'drafts' => $summaryRows->where('status', 'draft')->count(),
                'reversed' => $summaryRows->where('status', 'reversed')->count(),
            ],
        ]);
    }

    public function show(Request $request, CashMovement $movement): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.cash.view');
        $movement->load([
            'party.roles',
            'governmentObligation.taxRule',
            'department',
            'allocations.document.party',
        ]);

        return response()->json([
            'data' => $this->detail($movement),
            'audit' => FinanceAuditEvent::query()
                ->where('auditable_type', 'CashMovement')
                ->where('auditable_id', $movement->id)
                ->latest('id')
                ->limit(100)
                ->get()
                ->map(fn (FinanceAuditEvent $event) => [
                    'id' => $event->id,
                    'action' => $event->action,
                    'reason' => $event->reason,
                    'created_at' => $event->created_at?->toIso8601String(),
                ]),
        ]);
    }

    public function store(Request $request, CashMovementService $service): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.cash.view');

        $data = $this->validatedMovement($request);
        $this->authorizeDirection($request, $data['direction']);
        $movement = $service->createDraft($data, $request->user()->id);

        return response()->json(['data' => $this->detail($movement)], 201);
    }

    public function update(Request $request, CashMovement $movement, CashMovementService $service): JsonResponse
    {
        $this->authorizeDirection($request, $movement->direction);
        $data = $this->validatedMovement($request, $movement->direction);
        $movement = $service->updateDraft($movement, $data, $request->user()->id);

        return response()->json(['data' => $this->detail($movement)]);
    }

    public function post(Request $request, CashMovement $movement, CashMovementService $service): JsonResponse
    {
        $this->authorizeDirection($request, $movement->direction);
        $movement = $service->post($movement, $request->user()->id);

        return response()->json(['data' => $this->detail($movement)]);
    }

    public function reverse(Request $request, CashMovement $movement, CashMovementService $service): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.cash.correct');
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:5', 'max:1000'],
        ]);

        $reversal = $service->reverse($movement, $data['reason'], $request->user()->id);

        return response()->json(['data' => $this->detail($reversal)], 201);
    }

    public function correct(Request $request, CashMovement $movement, CashMovementService $service): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.cash.correct');
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:5', 'max:1000'],
        ]);

        $replacement = $service->startCorrection($movement, $data['reason'], $request->user()->id);

        return response()->json(['data' => $this->detail($replacement)], 201);
    }

    public function checkStatus(Request $request, CashMovement $movement, CashMovementService $service): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.cash.correct');
        $data = $request->validate([
            'status' => ['required', Rule::in(['pending', 'cleared', 'bounced', 'cancelled'])],
        ]);

        $movement = $service->updateCheckStatus($movement, $data['status'], $request->user()->id);

        return response()->json(['data' => $this->detail($movement)]);
    }

    /** @return array<string, mixed> */
    private function validatedMovement(Request $request, ?string $forcedDirection = null): array
    {
        $data = $request->validate([
            'direction' => [$forcedDirection ? 'sometimes' : 'required', Rule::in(['incoming', 'outgoing'])],
            'party_id' => ['nullable', 'integer'],
            'government_obligation_id' => ['nullable', 'integer'],
            'department_id' => ['nullable', 'integer'],
            'category' => ['required', Rule::in([
                'customer_receipt',
                'supplier_payment',
                'raw_material',
                'goods_for_resale',
                'packaging',
                'operating_expense',
                'payroll',
                'rent',
                'utilities',
                'shipping_customs',
                'maintenance',
                'marketing',
                'tax_payment',
                'government_fee',
                'loan',
                'capital',
                'asset_purchase',
                'asset_sale',
                'refund',
                'other_income',
                'other_expense',
                'other',
            ])],
            'amount' => ['required', 'numeric', 'gt:0', 'max:999999999999'],
            'currency' => ['required', 'regex:/^[A-Z]{3}$/'],
            'movement_date' => ['required', 'date_format:Y-m-d'],
            'method' => ['required', Rule::in(['cash', 'bank_transfer', 'check', 'card', 'electronic_wallet', 'direct_debit', 'other'])],
            'account_label' => ['nullable', 'string', 'max:160'],
            'branch_label' => ['nullable', 'string', 'max:120'],
            'cost_center' => ['nullable', 'string', 'max:120'],
            'reference' => ['nullable', 'string', 'max:160'],
            'check_number' => ['nullable', 'required_if:method,check', 'string', 'max:120'],
            'check_bank' => ['nullable', 'required_if:method,check', 'string', 'max:160'],
            'check_due_date' => ['nullable', 'required_if:method,check', 'date_format:Y-m-d'],
            'check_status' => ['nullable', Rule::in(['pending', 'cleared', 'bounced', 'cancelled'])],
            'method_details' => ['nullable', 'array'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'allocations' => ['sometimes', 'array', 'max:250'],
            'allocations.*.financial_document_id' => ['required', 'integer'],
            'allocations.*.amount' => ['required', 'numeric', 'gt:0', 'max:999999999999'],
        ]);

        if ($forcedDirection) {
            $data['direction'] = $forcedDirection;
        }

        return $data;
    }

    private function authorizeDirection(Request $request, string $direction): void
    {
        FinanceAuthorization::authorize(
            $request->user(),
            $direction === 'incoming' ? 'finance.cash.receive' : 'finance.cash.pay',
        );
    }

    /** @return array<string, mixed> */
    private function row(CashMovement $movement): array
    {
        return [
            'id' => $movement->id,
            'number' => $movement->number,
            'direction' => $movement->direction,
            'status' => $movement->status,
            'category' => $movement->category,
            'party' => $movement->party ? [
                'id' => $movement->party->id,
                'name' => $movement->party->company_name ?: $movement->party->name,
            ] : null,
            'amount' => $movement->amount,
            'currency' => $movement->currency,
            'movement_date' => $movement->movement_date->format('Y-m-d'),
            'method' => $movement->method,
            'reference' => $movement->reference,
            'check_number' => $movement->check_number,
            'check_due_date' => $movement->check_due_date?->format('Y-m-d'),
            'check_status' => $movement->check_status,
        ];
    }

    /** @return array<string, mixed> */
    private function detail(CashMovement $movement): array
    {
        return [
            ...$this->row($movement),
            'party_id' => $movement->party_id,
            'government_obligation_id' => $movement->government_obligation_id,
            'department_id' => $movement->department_id,
            'corrected_from_id' => $movement->corrected_from_id,
            'reversal_of_id' => $movement->reversal_of_id,
            'account_label' => $movement->account_label,
            'branch_label' => $movement->branch_label,
            'cost_center' => $movement->cost_center,
            'check_bank' => $movement->check_bank,
            'method_details' => $movement->method_details,
            'notes' => $movement->notes,
            'correction_reason' => $movement->correction_reason,
            'posted_at' => $movement->posted_at?->toIso8601String(),
            'allocations' => $movement->allocations->map(fn ($allocation) => [
                'id' => $allocation->id,
                'financial_document_id' => $allocation->financial_document_id,
                'document_number' => $allocation->document?->number,
                'document_total' => $allocation->document?->total,
                'document_balance_due' => $allocation->document?->balance_due,
                'amount' => $allocation->amount,
            ])->values(),
            'government_obligation' => $movement->governmentObligation ? [
                'id' => $movement->governmentObligation->id,
                'title' => $movement->governmentObligation->title,
                'authority_name' => $movement->governmentObligation->authority_name,
                'balance_due' => $movement->governmentObligation->balance_due,
            ] : null,
        ];
    }
}
