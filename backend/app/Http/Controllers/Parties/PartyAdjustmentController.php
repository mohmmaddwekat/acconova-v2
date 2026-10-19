<?php

namespace App\Http\Controllers\Parties;

use App\Http\Controllers\Controller;
use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\PartyAdjustment;
use App\Services\Finance\FinanceAuthorization;
use App\Services\Parties\PartyAdjustmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Balance difference entries ("قيد فروقات") on one Party account. The customer
 * side needs sales management, the supplier side purchases management.
 */
class PartyAdjustmentController extends Controller
{
    public function store(Request $request, int $party, PartyAdjustmentService $service): JsonResponse
    {
        $record = $this->party($request, $party);

        $validated = $request->validate([
            'side' => ['nullable', Rule::in(['customer', 'supplier'])],
            'direction' => ['required', Rule::in([PartyAdjustment::DIRECTION_OWED_TO_US, PartyAdjustment::DIRECTION_WE_OWE])],
            'amount' => ['required', 'numeric', 'gt:0', 'max:999999999999'],
            'adjustment_date' => ['required', 'date', 'before_or_equal:today'],
            'reason' => ['required', 'string', 'max:160'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'financial_document_id' => ['nullable', 'integer'],
        ]);

        $roles = $record->roles->pluck('role')
            ->map(fn ($role): string => is_object($role) && property_exists($role, 'value') ? $role->value : (string) $role)
            ->all();
        $side = PartyAdjustmentService::resolveSide($roles, $validated['side'] ?? null);

        if (! empty($validated['financial_document_id'])) {
            $kind = FinancialDocument::query()->whereKey($validated['financial_document_id'])->value('kind');
            $side = $kind === 'purchase_invoice' ? 'supplier' : 'customer';
        }

        if ($side === null) {
            throw ValidationException::withMessages([
                'side' => [app()->getLocale() === 'ar'
                    ? 'هذا الطرف زبون ومورد. اختر الحساب: حساب الزبون أو حساب المورد.'
                    : 'This party is both a customer and a supplier. Choose the customer or supplier account.'],
            ]);
        }

        $this->authorizeSide($request, $side);

        $adjustment = $service->create($record, [...$validated, 'side' => $side], (int) $request->user()->id);

        return response()->json(['data' => $this->payload($adjustment)], 201);
    }

    public function void(Request $request, int $party, int $adjustment, PartyAdjustmentService $service): JsonResponse
    {
        $this->party($request, $party);
        $record = PartyAdjustment::query()->where('party_id', $party)->findOrFail($adjustment);

        $this->authorizeSide($request, $record->side);

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        return response()->json(['data' => $this->payload(
            $service->void($record, $validated['reason'], (int) $request->user()->id),
        )]);
    }

    private function party(Request $request, int $party): Party
    {
        $record = Party::withTrashed()->with('roles')->findOrFail($party);

        abort_unless($request->user()?->can('view', $record), 403);

        return $record;
    }

    private function authorizeSide(Request $request, string $side): void
    {
        abort_unless(FinanceAuthorization::allows(
            $request->user(),
            $side === 'supplier' ? 'finance.purchases.manage' : 'finance.sales.manage',
        ), 403);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(PartyAdjustment $adjustment): array
    {
        return [
            'id' => $adjustment->id,
            'party_id' => $adjustment->party_id,
            'financial_document_id' => $adjustment->financial_document_id,
            'number' => $adjustment->number,
            'side' => $adjustment->side,
            'direction' => $adjustment->direction,
            'amount' => $adjustment->amount,
            'currency' => $adjustment->currency,
            'adjustment_date' => $adjustment->adjustment_date->toDateString(),
            'reason' => $adjustment->reason,
            'notes' => $adjustment->notes,
            'status' => $adjustment->status,
            'void_reason' => $adjustment->void_reason,
        ];
    }
}
