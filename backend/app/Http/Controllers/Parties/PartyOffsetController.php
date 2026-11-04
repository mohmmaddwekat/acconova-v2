<?php

namespace App\Http\Controllers\Parties;

use App\Http\Controllers\Controller;
use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\PartyAdjustment;
use App\Services\Finance\FinanceAuthorization;
use App\Services\Parties\PartyOffsetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Offsets ("مقاصة") of a customer-and-supplier Party's open sales invoices
 * against its open purchase invoices. Needs both sales and purchases management.
 */
class PartyOffsetController extends Controller
{
    public function index(Request $request, PartyOffsetService $service): JsonResponse
    {
        $this->authorizeBoth($request);

        $parties = Party::query()
            ->whereHas('roles', fn ($query) => $query->where('role', 'customer'))
            ->whereHas('roles', fn ($query) => $query->where('role', 'supplier'))
            ->whereIn('id', FinancialDocument::query()->where('kind', 'sale_invoice')->whereIn('status', ['issued', 'partially_paid'])->where('balance_due', '>', 0)->select('party_id'))
            ->whereIn('id', FinancialDocument::query()->where('kind', 'purchase_invoice')->whereIn('status', ['issued', 'partially_paid'])->where('balance_due', '>', 0)->select('party_id'))
            ->orderBy('name')
            ->limit(500)
            ->get();

        $rows = $parties->map(function (Party $party) use ($service): array {
            $plan = $service->plan($party);

            return [
                'party_id' => $party->id,
                'name' => $party->name,
                'sales_open' => $plan['sales_open'],
                'purchases_open' => $plan['purchases_open'],
                'available' => $plan['available'],
            ];
        })->filter(fn (array $row): bool => $row['available'] > 0)->values();

        return response()->json(['data' => $rows]);
    }

    public function preview(Request $request, int $party, PartyOffsetService $service): JsonResponse
    {
        $this->authorizeBoth($request);
        $record = $this->party($request, $party);

        $validated = $request->validate([
            'amount' => ['nullable', 'numeric', 'gt:0', 'max:999999999999'],
        ]);

        return response()->json(['data' => $service->plan($record, isset($validated['amount']) ? (float) $validated['amount'] : null)]);
    }

    public function store(Request $request, int $party, PartyOffsetService $service): JsonResponse
    {
        $this->authorizeBoth($request);
        $record = $this->party($request, $party);

        $validated = $request->validate([
            'amount' => ['nullable', 'numeric', 'gt:0', 'max:999999999999'],
            'date' => ['nullable', 'date', 'before_or_equal:today'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $result = $service->apply(
            $record,
            isset($validated['amount']) ? (float) $validated['amount'] : null,
            $validated['date'] ?? null,
            (string) ($validated['notes'] ?? ''),
            (int) $request->user()->id,
        );

        return response()->json(['data' => $result], 201);
    }

    public function void(Request $request, string $group, PartyOffsetService $service): JsonResponse
    {
        $this->authorizeBoth($request);

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        abort_unless(PartyAdjustment::query()->where('offset_group', $group)->exists(), 404);

        return response()->json(['data' => [
            'voided' => $service->voidGroup($group, $validated['reason'], (int) $request->user()->id),
        ]]);
    }

    private function party(Request $request, int $party): Party
    {
        $record = Party::with('roles')->findOrFail($party);

        abort_unless($request->user()?->can('view', $record), 403);

        return $record;
    }

    private function authorizeBoth(Request $request): void
    {
        abort_unless(
            FinanceAuthorization::allows($request->user(), 'finance.sales.manage')
            && FinanceAuthorization::allows($request->user(), 'finance.purchases.manage'),
            403,
        );
    }
}
