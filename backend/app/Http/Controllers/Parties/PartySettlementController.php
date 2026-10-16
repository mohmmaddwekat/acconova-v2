<?php

namespace App\Http\Controllers\Parties;

use App\Http\Controllers\Controller;
use App\Models\Party;
use App\Models\PartySettlement;
use App\Services\Finance\FinanceAuthorization;
use App\Services\Parties\PartySettlementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Agreed settlements between the customer and supplier sides of one Party.
 * Requesting needs both sales and purchases management; approving, rejecting
 * and reversing need finance approval rights.
 */
class PartySettlementController extends Controller
{
    public function index(Request $request, int $party, PartySettlementService $service): JsonResponse
    {
        $record = $this->party($request, $party);

        abort_unless(
            FinanceAuthorization::allows($request->user(), 'finance.sales.view')
            && FinanceAuthorization::allows($request->user(), 'finance.purchases.view'),
            403,
        );

        return response()->json([
            'data' => PartySettlement::query()->where('party_id', $record->id)->latest('id')->limit(50)->get()
                ->map(fn (PartySettlement $settlement): array => $this->payload($settlement))
                ->values(),
            'meta' => [
                'available' => number_format($service->available($record), 4, '.', ''),
                'auto_netting' => false,
            ],
        ]);
    }

    public function store(Request $request, int $party, PartySettlementService $service): JsonResponse
    {
        $record = $this->party($request, $party);

        abort_unless(
            FinanceAuthorization::allows($request->user(), 'finance.sales.manage')
            && FinanceAuthorization::allows($request->user(), 'finance.purchases.manage'),
            403,
        );

        $settlement = $service->request($record, $request->only([
            'amount', 'settlement_date', 'agreement_reference', 'agreement_date', 'agreement_notes',
        ]), $request->user());

        return response()->json(['data' => $this->payload($settlement)], 201);
    }

    public function approve(Request $request, int $party, int $settlement, PartySettlementService $service): JsonResponse
    {
        $this->reviewer($request);

        return response()->json(['data' => $this->payload(
            $service->approve($this->settlement($party, $settlement), $request->user()),
        )]);
    }

    public function reject(Request $request, int $party, int $settlement, PartySettlementService $service): JsonResponse
    {
        $this->reviewer($request);

        return response()->json(['data' => $this->payload(
            $service->reject($this->settlement($party, $settlement), $request->user(), (string) $request->input('reason')),
        )]);
    }

    public function reverse(Request $request, int $party, int $settlement, PartySettlementService $service): JsonResponse
    {
        $this->reviewer($request);

        return response()->json(['data' => $this->payload(
            $service->reverse($this->settlement($party, $settlement), $request->user(), (string) $request->input('reason')),
        )]);
    }

    private function party(Request $request, int $party): Party
    {
        $record = Party::withTrashed()->findOrFail($party);

        abort_unless($request->user()?->can('view', $record), 403);

        return $record;
    }

    private function settlement(int $party, int $settlement): PartySettlement
    {
        return PartySettlement::query()->where('party_id', $party)->findOrFail($settlement);
    }

    private function reviewer(Request $request): void
    {
        abort_unless(FinanceAuthorization::allows($request->user(), 'finance.approvals.review'), 403);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(PartySettlement $settlement): array
    {
        return [
            'id' => $settlement->id,
            'party_id' => $settlement->party_id,
            'amount' => $settlement->amount,
            'currency' => $settlement->currency,
            'settlement_date' => $settlement->settlement_date->toDateString(),
            'agreement_reference' => $settlement->agreement_reference,
            'agreement_date' => $settlement->agreement_date->toDateString(),
            'agreement_notes' => $settlement->agreement_notes,
            'status' => $settlement->status,
            'requested_by' => $settlement->requested_by,
            'approved_by' => $settlement->approved_by,
            'approved_at' => $settlement->approved_at?->toIso8601String(),
            'rejection_reason' => $settlement->rejection_reason,
            'reversal_reason' => $settlement->reversal_reason,
        ];
    }
}
