<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\PartyAdjustment;
use App\Services\Finance\FinanceArchiveService;
use App\Services\Finance\FinanceAuthorization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FinanceArchiveController extends Controller
{
    /**
     * List archived invoices and cash movements the viewer may see.
     */
    public function index(Request $request, FinanceArchiveService $archive): JsonResponse
    {
        $user = $request->user();
        $canSales = FinanceAuthorization::allows($user, 'finance.sales.view');
        $canPurchases = FinanceAuthorization::allows($user, 'finance.purchases.view');
        $canCash = FinanceAuthorization::allows($user, 'finance.cash.view');

        abort_unless($canSales || $canPurchases || $canCash, 403);

        $documents = array_values(array_filter(
            $archive->documents(),
            fn (array $row): bool => $row['kind'] === 'sale_invoice' ? $canSales : $canPurchases,
        ));

        $adjustments = array_values(array_filter(
            $archive->adjustments(),
            fn (array $row): bool => $row['side'] === 'customer' ? $canSales : $canPurchases,
        ));

        return response()->json([
            'data' => [
                'documents' => $documents,
                'movements' => $canCash ? $archive->movements() : [],
                'adjustments' => $adjustments,
            ],
            'auto_purge' => $archive->autoPurgeEnabled(),
            'can_delete' => FinanceAuthorization::allows($user, 'finance.documents.correct')
                || FinanceAuthorization::allows($user, 'finance.cash.correct')
                || ($adjustments !== [] && (FinanceAuthorization::allows($user, 'finance.sales.manage') || FinanceAuthorization::allows($user, 'finance.purchases.manage'))),
        ]);
    }

    /**
     * Permanently delete the selected archived records.
     */
    public function destroy(Request $request, FinanceArchiveService $archive): JsonResponse
    {
        $data = $request->validate([
            'documents' => ['array', 'max:500'],
            'documents.*' => ['integer'],
            'movements' => ['array', 'max:500'],
            'movements.*' => ['integer'],
            'adjustments' => ['array', 'max:500'],
            'adjustments.*' => ['integer'],
        ]);

        $adjustmentIds = array_map('intval', $data['adjustments'] ?? []);

        foreach (PartyAdjustment::query()->whereIn('id', $adjustmentIds)->distinct()->pluck('side') as $side) {
            FinanceAuthorization::authorize($request->user(), $side === 'supplier' ? 'finance.purchases.manage' : 'finance.sales.manage');
        }

        if (! empty($data['documents'])) {
            FinanceAuthorization::authorize($request->user(), 'finance.documents.correct');
        }

        if (! empty($data['movements'])) {
            FinanceAuthorization::authorize($request->user(), 'finance.cash.correct');
        }

        $deleted = $archive->delete(
            array_map('intval', $data['documents'] ?? []),
            array_map('intval', $data['movements'] ?? []),
            $request->user()->id,
            $adjustmentIds,
        );

        return response()->json(['data' => $deleted]);
    }

    /**
     * Turn the monthly automatic clean-up of the archive on or off.
     */
    public function settings(Request $request, FinanceArchiveService $archive): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.documents.correct');

        $data = $request->validate([
            'auto_purge' => ['required', 'boolean'],
        ]);

        $archive->setAutoPurge((bool) $data['auto_purge']);

        return response()->json(['auto_purge' => $archive->autoPurgeEnabled()]);
    }
}
