<?php

namespace App\Http\Controllers\Parties;

use App\Http\Controllers\Controller;
use App\Models\Party;
use App\Services\Finance\FinanceAuthorization;
use App\Services\Parties\PartyCollectionsStatement;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Overdue balance, aging, promises, follow-ups and pending cheques of one
 * Party on one side. The side's finance view permission is required, and the
 * cheque and last-payment details also need cash view.
 */
class PartyCollectionsController extends Controller
{
    public function __invoke(Request $request, int $party, PartyCollectionsStatement $statement): JsonResponse
    {
        $record = Party::withTrashed()->findOrFail($party);

        abort_unless($request->user()?->can('view', $record), 403);

        $data = $request->validate([
            'side' => ['sometimes', Rule::in(PartyCollectionsStatement::SIDES)],
            'as_of' => ['sometimes', 'date_format:Y-m-d'],
        ]);

        $side = $data['side'] ?? 'customer';

        abort_unless(
            FinanceAuthorization::allows($request->user(), $side === 'customer' ? 'finance.sales.view' : 'finance.purchases.view'),
            403,
        );

        $result = $statement->forParty(
            $record,
            $side,
            isset($data['as_of']) ? CarbonImmutable::parse($data['as_of']) : null,
        );

        if (! FinanceAuthorization::allows($request->user(), 'finance.cash.view')) {
            $result['cheques'] = null;
            $result['summary']['last_payment'] = null;
            $result['summary']['days_since_last_payment'] = null;
        }

        return response()->json(['data' => $result]);
    }
}
