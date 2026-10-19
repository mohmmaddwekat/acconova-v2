<?php

namespace App\Services\Parties;

use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\PartyAdjustment;
use App\Services\Finance\FinanceAuditService;
use App\Services\Finance\FinanceDocumentService;
use App\Services\Finance\FinanceNumberService;
use App\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Records and voids balance differences with a Party ("قيد فروقات").
 */
class PartyAdjustmentService
{
    public function __construct(
        private readonly FinanceNumberService $numbers,
        private readonly FinanceAuditService $audit,
        private readonly FinanceDocumentService $documents,
    ) {}

    /**
     * Pick the account side: the only role the Party has, or the one asked for
     * when it is both a customer and a supplier.
     *
     * @param  list<string>  $roles
     */
    public static function resolveSide(array $roles, ?string $requested): ?string
    {
        $isCustomer = in_array('customer', $roles, true);
        $isSupplier = in_array('supplier', $roles, true);

        if ($requested && (($requested === 'customer' && $isCustomer) || ($requested === 'supplier' && $isSupplier))) {
            return $requested;
        }

        if ($isCustomer && ! $isSupplier) {
            return 'customer';
        }

        if ($isSupplier && ! $isCustomer) {
            return 'supplier';
        }

        return null;
    }

    /**
     * @param  array{side: string, direction: string, amount: numeric-string|float, adjustment_date: string, reason: string, notes?: string|null}  $data
     */
    public function create(Party $party, array $data, int $actorId): PartyAdjustment
    {
        return DB::transaction(function () use ($party, $data, $actorId): PartyAdjustment {
            $document = null;

            if (! empty($data['financial_document_id'])) {
                $document = $this->discountTarget($party, (int) $data['financial_document_id'], (float) $data['amount']);
                $data['side'] = $document->isSale() ? 'customer' : 'supplier';
                $data['direction'] = $document->isSale() ? PartyAdjustment::DIRECTION_WE_OWE : PartyAdjustment::DIRECTION_OWED_TO_US;
            }

            $existing = $document ? null : PartyAdjustment::query()
                ->where('party_id', $party->id)
                ->where('side', $data['side'])
                ->whereNull('financial_document_id')
                ->where('status', PartyAdjustment::STATUS_POSTED)
                ->whereDate('adjustment_date', $data['adjustment_date'])
                ->lockForUpdate()
                ->first(['id', 'number']);

            if ($existing) {
                throw ValidationException::withMessages([
                    'adjustment_date' => [$this->message(
                        'يوجد قيد فروقات لنفس الطرف بنفس التاريخ ('.$existing->number.'). ألغِه وسجّل قيداً واحداً بالمبلغ الصحيح.',
                        'This party already has a difference entry on this date ('.$existing->number.'). Void it and record one entry with the right amount.',
                    )],
                ]);
            }

            $currency = strtoupper((string) (app(TenantContext::class)->organization()->preferences['currency'] ?? 'ILS'));

            $adjustment = PartyAdjustment::create([
                'party_id' => $party->id,
                'financial_document_id' => $document?->id,
                'number' => $this->numbers->next('party_adjustments', 'ADJ'),
                'side' => $data['side'],
                'direction' => $data['direction'],
                'amount' => number_format((float) $data['amount'], 4, '.', ''),
                'currency' => $currency,
                'adjustment_date' => $data['adjustment_date'],
                'reason' => trim($data['reason']),
                'notes' => isset($data['notes']) ? (trim((string) $data['notes']) ?: null) : null,
                'status' => PartyAdjustment::STATUS_POSTED,
                'created_by' => $actorId,
            ]);

            $this->audit->record($adjustment, 'posted', $actorId, $adjustment->reason, null, $adjustment->only([
                'number', 'side', 'direction', 'amount', 'adjustment_date', 'reason',
            ]));

            if ($document) {
                $this->documents->recalculatePaymentState($document);
            }

            return $adjustment;
        }, 3);
    }

    private function discountTarget(Party $party, int $documentId, float $amount): FinancialDocument
    {
        $document = FinancialDocument::query()->lockForUpdate()->find($documentId);

        if (
            ! $document
            || (int) $document->party_id !== (int) $party->id
            || ! in_array($document->kind, ['sale_invoice', 'purchase_invoice'], true)
            || ! in_array($document->status, ['issued', 'partially_paid'], true)
        ) {
            throw ValidationException::withMessages([
                'financial_document_id' => [$this->message(
                    'اختر فاتورة مفتوحة تخص هذا الطرف.',
                    'Choose an open invoice that belongs to this party.',
                )],
            ]);
        }

        if ($amount > (float) $document->balance_due + 0.00005) {
            throw ValidationException::withMessages([
                'amount' => [$this->message(
                    'الخصم أكبر من المتبقي على الفاتورة ('.$document->balance_due.').',
                    'The discount is more than the invoice outstanding balance ('.$document->balance_due.').',
                )],
            ]);
        }

        return $document;
    }

    public function void(PartyAdjustment $adjustment, string $reason, int $actorId): PartyAdjustment
    {
        return DB::transaction(function () use ($adjustment, $reason, $actorId): PartyAdjustment {
            $locked = PartyAdjustment::query()->lockForUpdate()->findOrFail($adjustment->id);

            if ($locked->status !== PartyAdjustment::STATUS_POSTED) {
                throw ValidationException::withMessages([
                    'status' => [$this->message('هذا القيد ملغى من قبل.', 'This entry is already voided.')],
                ]);
            }

            $locked->status = PartyAdjustment::STATUS_VOIDED;
            $locked->voided_by = $actorId;
            $locked->voided_at = now();
            $locked->void_reason = $reason;
            $locked->save();

            $this->audit->record($locked, 'voided', $actorId, $reason, ['status' => PartyAdjustment::STATUS_POSTED], ['status' => PartyAdjustment::STATUS_VOIDED]);

            if ($locked->financial_document_id && $locked->document) {
                $this->documents->recalculatePaymentState($locked->document);
            }

            return $locked;
        }, 3);
    }

    private function message(string $arabic, string $english): string
    {
        return app()->getLocale() === 'ar' ? $arabic : $english;
    }
}
