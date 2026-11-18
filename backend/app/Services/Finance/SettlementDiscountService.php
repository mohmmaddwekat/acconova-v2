<?php

namespace App\Services\Finance;

use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\User;
use App\Services\Parties\PartyAdjustmentService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A manual discount on what is still open after a payment ("خصم على الباقي"):
 * spread over the party's open invoices from the oldest so those invoices close.
 * It exists only when a user types an amount; nothing here runs on its own.
 */
class SettlementDiscountService
{
    private const EPSILON = 0.00005;

    public function __construct(
        private readonly PartyAdjustmentService $adjustments,
    ) {}

    /**
     * Customer side (sales invoices) or supplier side (purchase invoices).
     */
    public function apply(Party $party, bool $customerSide, string $date, float $amount, ?string $reference, User $user): float
    {
        $discount = round($amount, 4);

        if ($discount <= 0) {
            return 0.0;
        }

        $permission = $customerSide ? 'finance.sales.manage' : 'finance.purchases.manage';

        if (! FinanceAuthorization::allows($user, $permission)) {
            throw ValidationException::withMessages(['permission' => ['ليس لديك صلاحية تسجيل خصم على هذا النوع من الفواتير.']]);
        }

        return DB::transaction(function () use ($party, $customerSide, $date, $discount, $reference, $user): float {
            $open = FinancialDocument::query()
                ->where('party_id', $party->id)
                ->where('kind', $customerSide ? 'sale_invoice' : 'purchase_invoice')
                ->whereIn('status', ['issued', 'partially_paid'])
                ->where('balance_due', '>', 0)
                ->whereDate('issue_date', '<=', $date)
                ->orderBy('issue_date')
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            $remainingTotal = round((float) $open->sum(fn (FinancialDocument $document): float => (float) $document->balance_due), 4);

            if ($discount > $remainingTotal + self::EPSILON) {
                throw ValidationException::withMessages([
                    'discount' => ['الخصم ('.number_format($discount, 2, '.', '').') أكبر من المتبقي على فواتير الطرف بعد الدفعة ('.number_format($remainingTotal, 2, '.', '').').'],
                ]);
            }

            $left = $discount;

            foreach ($open as $document) {
                if ($left <= self::EPSILON) {
                    break;
                }

                $part = round(min($left, (float) $document->balance_due), 4);

                $this->adjustments->create($party, [
                    'financial_document_id' => $document->id,
                    'amount' => number_format($part, 4, '.', ''),
                    'adjustment_date' => $date,
                    'reason' => 'خصم عند التسوية',
                    'notes' => filled($reference) ? $reference : null,
                ], $user->id);

                $left = round($left - $part, 4);
            }

            return $discount;
        });
    }
}
