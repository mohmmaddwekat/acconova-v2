<?php

namespace App\Services\Finance;

use App\Models\CashAllocation;
use App\Models\CashMovement;
use App\Models\Department;
use App\Models\FinancialDocument;
use App\Models\GovernmentObligation;
use App\Models\Party;
use App\Tenancy\TenantContext;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CashMovementService
{
    public function __construct(
        private readonly FinanceNumberService $numbers,
        private readonly FinanceAuditService $audit,
        private readonly FinanceDocumentService $documents,
    ) {}

    public function createDraft(array $data, int $actorId): CashMovement
    {
        return DB::transaction(function () use ($data, $actorId): CashMovement {
            $this->assertReferences($data);
            $data = $this->applyEndorsedCheque($data);
            $this->assertUniqueCheque(
                (string) $data['direction'],
                $data['method'] ?? null,
                $data['check_number'] ?? null,
                $data['check_bank'] ?? null,
            );

            $movement = CashMovement::create([
                ...$this->payload($data),
                'number' => $this->numbers->next(
                    $data['direction'] === 'incoming' ? 'cash_receipts' : 'cash_payments',
                    $data['direction'] === 'incoming'
                        ? (string) (app(TenantContext::class)->organization()->preferences['receipt_prefix'] ?? 'RCV')
                        : (string) (app(TenantContext::class)->organization()->preferences['payment_prefix'] ?? 'PAY'),
                ),
                'status' => 'draft',
                'created_by' => $actorId,
                'updated_by' => $actorId,
            ]);

            $this->syncAllocations($movement, $data['allocations'] ?? []);
            $this->audit->record(
                $movement,
                'draft_created',
                $actorId,
                null,
                null,
                $this->snapshot($movement),
            );

            return $movement->fresh($this->relations());
        }, 3);
    }

    public function updateDraft(CashMovement $movement, array $data, int $actorId): CashMovement
    {
        return DB::transaction(function () use ($movement, $data, $actorId): CashMovement {
            $locked = CashMovement::query()->lockForUpdate()->findOrFail($movement->id);

            if ($locked->status !== 'draft') {
                throw ValidationException::withMessages([
                    'status' => ['Posted cash movements are immutable. Start a correction instead.'],
                ]);
            }

            $before = $this->snapshot($locked);
            $direction = $locked->direction;

            $data['direction'] = $direction;
            $this->assertReferences($data);
            $data = $this->applyEndorsedCheque($data, $locked);
            $this->assertUniqueCheque(
                $direction,
                $data['method'] ?? null,
                $data['check_number'] ?? null,
                $data['check_bank'] ?? null,
                $locked,
            );

            $locked->fill([
                ...$this->payload([
                    ...$data,
                    'direction' => $direction,
                ]),
                'direction' => $direction,
                'updated_by' => $actorId,
            ]);
            $locked->save();

            $this->syncAllocations($locked, $data['allocations'] ?? []);

            $this->audit->record(
                $locked,
                'draft_updated',
                $actorId,
                null,
                $before,
                $this->snapshot($locked),
            );

            return $locked->fresh($this->relations());
        }, 3);
    }

    public function post(CashMovement $movement, int $actorId): CashMovement
    {
        return DB::transaction(function () use ($movement, $actorId): CashMovement {
            $locked = CashMovement::query()
                ->with('allocations')
                ->lockForUpdate()
                ->findOrFail($movement->id);

            if ($locked->status !== 'draft') {
                throw ValidationException::withMessages([
                    'status' => ['Only draft cash movements can be posted.'],
                ]);
            }

            $this->validateAllocations($locked);

            $this->assertUniqueCheque(
                $locked->direction,
                $locked->method,
                $locked->check_number,
                $locked->check_bank,
                $locked,
            );

            if (! $locked->corrected_from_id && ! $locked->reversal_of_id) {
                $sameDay = $this->sameDayCashMovement($locked);

                if ($sameDay) {
                    $this->mergeIntoSameDay($locked, $sameDay);
                }
            }

            $source = null;

            if ($locked->corrected_from_id) {
                $source = CashMovement::query()
                    ->with('allocations')
                    ->lockForUpdate()
                    ->findOrFail($locked->corrected_from_id);

                if ($source->status !== 'posted') {
                    throw ValidationException::withMessages([
                        'correction' => ['The source cash movement can no longer be corrected.'],
                    ]);
                }

                if ($source->direction !== $locked->direction) {
                    throw ValidationException::withMessages([
                        'direction' => ['A correction must keep the original cash direction.'],
                    ]);
                }

                $sourceBefore = $this->snapshot($source);

                $reversal = $this->createReversal(
                    $source,
                    $locked->correction_reason ?: 'Corrected cash movement',
                    $actorId,
                    'Correction reversal of ',
                );

                $source->status = 'reversed';
                $source->correction_reason = $locked->correction_reason;
                $source->updated_by = $actorId;
                $source->save();

                $this->refreshLinkedBalances($source);

                $this->audit->record(
                    $source,
                    'correction_superseded',
                    $actorId,
                    $locked->correction_reason,
                    $sourceBefore,
                    [
                        'replacement_movement_id' => $locked->id,
                        'reversal_movement_id' => $reversal->id,
                    ],
                );

                $this->audit->record(
                    $reversal,
                    'reversal_created',
                    $actorId,
                    $locked->correction_reason,
                    null,
                    $this->snapshot($reversal),
                );
            }

            $this->assertDepartmentSpendingLimit(
                $locked,
            );

            $before = $this->snapshot($locked);
            $locked->status = 'posted';
            $locked->posted_at = now();
            $locked->updated_by = $actorId;
            $locked->save();

            $this->refreshLinkedBalances($locked);

            $this->audit->record(
                $locked,
                $source ? 'correction_posted' : 'posted',
                $actorId,
                $locked->correction_reason,
                $before,
                $this->snapshot($locked),
            );

            return $locked->fresh($this->relations());
        }, 3);
    }

    public function reverse(CashMovement $movement, string $reason, int $actorId): CashMovement
    {
        return DB::transaction(function () use ($movement, $reason, $actorId): CashMovement {
            $locked = CashMovement::query()
                ->with('allocations')
                ->lockForUpdate()
                ->findOrFail($movement->id);

            if ($locked->status !== 'posted') {
                throw ValidationException::withMessages([
                    'status' => ['Only posted cash movements can be reversed.'],
                ]);
            }

            $before = $this->snapshot($locked);

            $reversal = $this->createReversal(
                $locked,
                $reason,
                $actorId,
            );

            $locked->status = 'reversed';
            $locked->correction_reason = $reason;
            $locked->updated_by = $actorId;
            $locked->save();

            $this->refreshLinkedBalances($locked);

            $this->audit->record(
                $locked,
                'reversed',
                $actorId,
                $reason,
                $before,
                $this->snapshot($locked),
            );

            $this->audit->record(
                $reversal,
                'reversal_created',
                $actorId,
                $reason,
                null,
                $this->snapshot($reversal),
            );

            return $reversal->fresh($this->relations());
        }, 3);
    }

    public function startCorrection(CashMovement $movement, string $reason, int $actorId): CashMovement
    {
        return DB::transaction(function () use ($movement, $reason, $actorId): CashMovement {
            $locked = CashMovement::query()
                ->with('allocations')
                ->lockForUpdate()
                ->findOrFail($movement->id);

            if ($locked->status !== 'posted') {
                throw ValidationException::withMessages([
                    'status' => ['Only posted cash movements can be corrected.'],
                ]);
            }

            $existing = CashMovement::query()
                ->where('corrected_from_id', $locked->id)
                ->where('status', 'draft')
                ->first();

            if ($existing) {
                return $existing->fresh($this->relations());
            }

            $before = $this->snapshot($locked);

            $replacement = CashMovement::create([
                'party_id' => $locked->party_id,
                'government_obligation_id' => $locked->government_obligation_id,
                'department_id' => $locked->department_id,
                'corrected_from_id' => $locked->id,
                'number' => $this->numbers->next(
                    $locked->direction === 'incoming' ? 'cash_receipts' : 'cash_payments',
                    $locked->direction === 'incoming'
                        ? (string) (app(TenantContext::class)->organization()->preferences['receipt_prefix'] ?? 'RCV')
                        : (string) (app(TenantContext::class)->organization()->preferences['payment_prefix'] ?? 'PAY'),
                ),
                'direction' => $locked->direction,
                'status' => 'draft',
                'category' => $locked->category,
                'amount' => $locked->amount,
                'currency' => $locked->currency,
                'movement_date' => $locked->movement_date?->format('Y-m-d') ?? now()->toDateString(),
                'method' => $locked->method,
                'account_label' => $locked->account_label,
                'branch_label' => $locked->branch_label,
                'cost_center' => $locked->cost_center,
                'reference' => $locked->reference,
                'check_number' => $locked->check_number,
                'check_bank' => $locked->check_bank,
                'check_due_date' => $locked->check_due_date?->format('Y-m-d'),
                'check_status' => $locked->check_status,
                'method_details' => $locked->method_details,
                'notes' => $locked->notes,
                'correction_reason' => $reason,
                'created_by' => $actorId,
                'updated_by' => $actorId,
            ]);

            foreach ($locked->allocations as $allocation) {
                CashAllocation::create([
                    'cash_movement_id' => $replacement->id,
                    'financial_document_id' => $allocation->financial_document_id,
                    'amount' => $allocation->amount,
                ]);
            }

            $this->audit->record(
                $locked,
                'correction_started',
                $actorId,
                $reason,
                $before,
                ['replacement_movement_id' => $replacement->id],
            );

            return $replacement->fresh($this->relations());
        }, 3);
    }

    public function applyAvailableCredit(
        CashMovement $movement,
        FinancialDocument $document,
        string $amount,
        int $actorId,
    ): CashMovement {
        return DB::transaction(function () use ($movement, $document, $amount, $actorId): CashMovement {
            $lockedMovement = CashMovement::query()
                ->lockForUpdate()
                ->findOrFail($movement->id);

            $lockedDocument = FinancialDocument::query()
                ->lockForUpdate()
                ->findOrFail($document->id);

            $allocations = CashAllocation::query()
                ->where('cash_movement_id', $lockedMovement->id)
                ->lockForUpdate()
                ->get();

            if ($lockedMovement->status !== 'posted' || $lockedMovement->reversal_of_id !== null) {
                throw ValidationException::withMessages([
                    'movement_id' => ['Only an active posted cash movement can provide advance credit.'],
                ]);
            }

            if (
                $lockedMovement->method === 'check'
                && in_array($lockedMovement->check_status, ['bounced', 'cancelled'], true)
            ) {
                throw ValidationException::withMessages([
                    'movement_id' => ['A bounced or cancelled check cannot be used as credit.'],
                ]);
            }

            if (! in_array($lockedDocument->status, ['issued', 'partially_paid'], true)) {
                throw ValidationException::withMessages([
                    'document' => ['Advance credit can only be applied to an open issued invoice.'],
                ]);
            }

            $requiredDirection = $lockedDocument->isSale() ? 'incoming' : 'outgoing';
            $requiredCategory = $lockedDocument->isSale() ? 'customer_receipt' : 'supplier_payment';

            if (
                $lockedMovement->direction !== $requiredDirection
                || $lockedMovement->category !== $requiredCategory
            ) {
                throw ValidationException::withMessages([
                    'movement_id' => ['The selected advance does not match this invoice type.'],
                ]);
            }

            if (
                ! $lockedDocument->party_id
                || (int) $lockedMovement->party_id !== (int) $lockedDocument->party_id
            ) {
                throw ValidationException::withMessages([
                    'movement_id' => ['The advance must belong to the same customer or supplier as the invoice.'],
                ]);
            }

            if ($lockedMovement->currency !== $lockedDocument->currency) {
                throw ValidationException::withMessages([
                    'movement_id' => ['The advance currency must match the invoice currency.'],
                ]);
            }

            $requested = round((float) $amount, 4);
            $allocated = (float) $allocations->sum(fn (CashAllocation $allocation): float => (float) $allocation->amount);
            $available = max((float) $lockedMovement->amount - $allocated, 0);
            $outstanding = max((float) $lockedDocument->balance_due, 0);

            if ($requested <= 0) {
                throw ValidationException::withMessages([
                    'amount' => ['Enter a credit amount greater than zero.'],
                ]);
            }

            if ($requested > $available + 0.00005) {
                throw ValidationException::withMessages([
                    'amount' => ['The requested amount exceeds the available advance credit.'],
                ]);
            }

            if ($requested > $outstanding + 0.00005) {
                throw ValidationException::withMessages([
                    'amount' => ['Advance credit cannot exceed the invoice outstanding balance.'],
                ]);
            }

            $before = $this->snapshot($lockedMovement);
            $existing = $allocations->firstWhere('financial_document_id', $lockedDocument->id);

            if ($existing) {
                $existing->amount = number_format(
                    (float) $existing->amount + $requested,
                    4,
                    '.',
                    '',
                );
                $existing->save();
            } else {
                CashAllocation::create([
                    'cash_movement_id' => $lockedMovement->id,
                    'financial_document_id' => $lockedDocument->id,
                    'amount' => number_format($requested, 4, '.', ''),
                ]);
            }

            $this->documents->recalculatePaymentState($lockedDocument);
            $lockedMovement->load('allocations');

            $reason = sprintf(
                'Applied advance credit %s to invoice %s.',
                number_format($requested, 4, '.', ''),
                $lockedDocument->number,
            );

            $this->audit->record(
                $lockedMovement,
                'advance_credit_applied',
                $actorId,
                $reason,
                $before,
                $this->snapshot($lockedMovement),
            );

            $this->audit->record(
                $lockedDocument,
                'advance_credit_applied',
                $actorId,
                $reason,
                [
                    'balance_due' => number_format($outstanding, 4, '.', ''),
                ],
                [
                    'cash_movement_id' => $lockedMovement->id,
                    'amount' => number_format($requested, 4, '.', ''),
                    'balance_due' => $lockedDocument->fresh()->balance_due,
                ],
            );

            return $lockedMovement->fresh($this->relations());
        }, 3);
    }

    public function updateCheckStatus(
        CashMovement $movement,
        string $status,
        int $actorId,
    ): CashMovement {
        return DB::transaction(function () use ($movement, $status, $actorId): CashMovement {
            $locked = CashMovement::query()->lockForUpdate()->findOrFail($movement->id);

            if ($locked->method !== 'check') {
                throw ValidationException::withMessages([
                    'method' => ['This cash movement is not a check.'],
                ]);
            }

            if ($locked->status !== 'posted') {
                throw ValidationException::withMessages([
                    'status' => ['Check status can only be updated after the cash movement is posted.'],
                ]);
            }

            $before = $this->snapshot($locked);
            $locked->check_status = $status;
            $locked->updated_by = $actorId;
            $locked->save();

            $this->refreshLinkedBalances($locked);

            $this->audit->record(
                $locked,
                'check_status_changed',
                $actorId,
                null,
                $before,
                $this->snapshot($locked),
            );

            return $locked->fresh($this->relations());
        }, 3);
    }

    private function createReversal(
        CashMovement $source,
        string $reason,
        int $actorId,
        string $referencePrefix = 'Reversal of ',
    ): CashMovement {
        return CashMovement::create([
            'party_id' => $source->party_id,
            'government_obligation_id' => null,
            'department_id' => $source->department_id,
            'reversal_of_id' => $source->id,
            'number' => $this->numbers->next('cash_reversals', 'REV'),
            'direction' => $source->direction === 'incoming' ? 'outgoing' : 'incoming',
            'status' => 'posted',
            'category' => 'correction',
            'amount' => $source->amount,
            'currency' => $source->currency,
            'movement_date' => now()->toDateString(),
            'method' => $source->method,
            'account_label' => $source->account_label,
            'branch_label' => $source->branch_label,
            'cost_center' => $source->cost_center,
            'reference' => $referencePrefix.$source->number,
            'method_details' => $source->method_details,
            'notes' => $reason,
            'correction_reason' => $reason,
            'posted_at' => now(),
            'created_by' => $actorId,
            'updated_by' => $actorId,
        ]);
    }

    /**
     * Received cheques still held by the business that can be endorsed to a payee:
     * posted, pending incoming cheques not already used by a live outgoing cheque movement.
     *
     * @return Collection<int, CashMovement>
     */
    public function chequesOnHand(?int $excludeMovementId = null): Collection
    {
        $usedKeys = CashMovement::query()
            ->where('method', 'check')
            ->where('direction', 'outgoing')
            ->whereIn('status', ['draft', 'posted'])
            ->whereNull('reversal_of_id')
            ->whereNotNull('check_number')
            ->when($excludeMovementId, fn ($query, $id) => $query->where('id', '!=', $id))
            ->get(['check_number', 'check_bank'])
            ->map(fn (CashMovement $movement): string => $this->chequeKey($movement->check_number, $movement->check_bank));

        return CashMovement::query()
            ->with('party:id,name,company_name')
            ->where('method', 'check')
            ->where('direction', 'incoming')
            ->where('status', 'posted')
            ->whereNull('reversal_of_id')
            ->where('check_status', 'pending')
            ->whereNotNull('check_number')
            ->orderBy('check_due_date')
            ->orderBy('id')
            ->get()
            ->reject(fn (CashMovement $movement): bool => $usedKeys->contains(
                $this->chequeKey($movement->check_number, $movement->check_bank),
            ))
            ->values();
    }

    /**
     * An outgoing cheque payment that endorses a held cheque takes its details from that cheque.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function applyEndorsedCheque(array $data, ?CashMovement $self = null): array
    {
        $endorsedId = $data['method_details']['endorsed_movement_id'] ?? null;

        if (($data['method'] ?? null) !== 'check' || $data['direction'] !== 'outgoing' || ! $endorsedId) {
            if (is_array($data['method_details'] ?? null)) {
                unset($data['method_details']['endorsed_movement_id']);
            }

            return $data;
        }

        $cheque = $this->chequesOnHand($self?->id)->firstWhere('id', (int) $endorsedId);

        if (! $cheque) {
            throw ValidationException::withMessages([
                'method_details.endorsed_movement_id' => [$this->message(
                    'الشيك المختار غير متوفر للتجيير (ربما تم تحصيله أو استخدامه في دفعة أخرى).',
                    'The selected cheque is no longer available to endorse (it may be cleared or already used).',
                )],
            ]);
        }

        if (abs((float) $cheque->amount - (float) $data['amount']) > 0.0001 || $cheque->currency !== $data['currency']) {
            throw ValidationException::withMessages([
                'amount' => [$this->message(
                    'مبلغ وعملة الدفعة يجب أن تطابق الشيك المجيّر.',
                    'The payment amount and currency must match the endorsed cheque.',
                )],
            ]);
        }

        $data['check_number'] = $cheque->check_number;
        $data['check_bank'] = $cheque->check_bank;
        $data['check_due_date'] = $cheque->check_due_date?->format('Y-m-d');
        $data['method_details']['endorsed_movement_id'] = $cheque->id;

        return $data;
    }

    private function chequeKey(?string $checkNumber, ?string $checkBank): string
    {
        return $this->normalizeChequeNumber($checkNumber).'|'.$this->normalizeBank($checkBank);
    }

    /**
     * The same cheque (number and bank) can only be recorded once per direction.
     * An endorsed cheque legitimately appears once incoming and once outgoing.
     */
    private function assertUniqueCheque(
        string $direction,
        ?string $method,
        ?string $checkNumber,
        ?string $checkBank,
        ?CashMovement $self = null,
    ): void {
        $number = $this->normalizeChequeNumber($checkNumber);

        if ($method !== 'check' || $number === '') {
            return;
        }

        $bank = $this->normalizeBank($checkBank);

        $duplicate = CashMovement::query()
            ->where('method', 'check')
            ->where('direction', $direction)
            ->whereIn('status', ['draft', 'posted'])
            ->whereNull('reversal_of_id')
            ->whereNotNull('check_number')
            ->when($self, function ($query) use ($self): void {
                $query
                    ->where('id', '!=', $self->id)
                    ->where(fn ($chain) => $chain->whereNull('corrected_from_id')->orWhere('corrected_from_id', '!=', $self->id));

                if ($self->corrected_from_id) {
                    $query->where('id', '!=', $self->corrected_from_id);
                }
            })
            ->get(['id', 'number', 'check_number', 'check_bank'])
            ->first(function (CashMovement $movement) use ($number, $bank): bool {
                $otherBank = $this->normalizeBank($movement->check_bank);

                return $this->normalizeChequeNumber($movement->check_number) === $number
                    && ($bank === '' || $otherBank === '' || $bank === $otherBank);
            });

        if ($duplicate) {
            throw ValidationException::withMessages([
                'check_number' => [$this->message(
                    sprintf('هذا الشيك مسجل من قبل في الحركة %s (نفس رقم الشيك ونفس البنك).', $duplicate->number),
                    sprintf('This cheque is already recorded in %s (same cheque number and bank).', $duplicate->number),
                )],
            ]);
        }
    }

    private function normalizeChequeNumber(?string $value): string
    {
        $value = trim((string) $value);
        $digits = preg_replace('/\D+/', '', $value) ?? '';

        return $digits !== '' ? ltrim($digits, '0') ?: '0' : mb_strtolower($value);
    }

    private function normalizeBank(?string $value): string
    {
        return mb_strtolower(preg_replace('/\s+/u', '', (string) $value) ?? '');
    }

    /**
     * Find a posted cash receipt or payment for the same party, day and direction.
     */
    private function sameDayCashMovement(CashMovement $movement): ?CashMovement
    {
        if (
            $movement->method !== 'cash'
            || ! $movement->party_id
            || $movement->government_obligation_id
            || ! in_array($movement->category, ['customer_receipt', 'supplier_payment'], true)
        ) {
            return null;
        }

        return CashMovement::query()
            ->with('allocations')
            ->where('id', '!=', $movement->id)
            ->where('status', 'posted')
            ->whereNull('reversal_of_id')
            ->whereNull('government_obligation_id')
            ->where('method', 'cash')
            ->where('direction', $movement->direction)
            ->where('category', $movement->category)
            ->where('party_id', $movement->party_id)
            ->where('currency', $movement->currency)
            ->where('department_id', $movement->department_id)
            ->whereDate('movement_date', $movement->movement_date->format('Y-m-d'))
            ->lockForUpdate()
            ->first();
    }

    /**
     * Turn a new same-day cash movement into a correction of the existing one
     * carrying the combined amount, so the day keeps one cash entry per party
     * while the earlier entry stays in the audit trail as reversed.
     */
    private function mergeIntoSameDay(CashMovement $movement, CashMovement $existing): void
    {
        $combined = [];

        foreach ([$existing->allocations, $movement->allocations] as $allocations) {
            foreach ($allocations as $allocation) {
                $id = (int) $allocation->financial_document_id;
                $combined[$id] = ($combined[$id] ?? 0) + (float) $allocation->amount;
            }
        }

        $movement->corrected_from_id = $existing->id;
        $movement->amount = number_format((float) $existing->amount + (float) $movement->amount, 4, '.', '');
        $movement->correction_reason = $this->message(
            'دمج دفعة نقدية لنفس الطرف بنفس اليوم مع '.$existing->number,
            'Merged same-day cash for the same party with '.$existing->number,
        );
        $movement->notes = trim(implode(' | ', array_filter([$existing->notes, $movement->notes])));
        $movement->save();

        $movement->allocations()->delete();

        foreach ($combined as $documentId => $amount) {
            CashAllocation::create([
                'cash_movement_id' => $movement->id,
                'financial_document_id' => $documentId,
                'amount' => number_format($amount, 4, '.', ''),
            ]);
        }

        $movement->unsetRelation('allocations');
        $this->validateAllocations($movement);
    }

    private function message(string $arabic, string $english): string
    {
        return app()->getLocale() === 'ar' ? $arabic : $english;
    }

    private function syncAllocations(CashMovement $movement, array $allocations): void
    {
        $movement->allocations()->delete();

        foreach ($allocations as $allocation) {
            if ((float) $allocation['amount'] <= 0) {
                continue;
            }

            CashAllocation::create([
                'cash_movement_id' => $movement->id,
                'financial_document_id' => $allocation['financial_document_id'],
                'amount' => $allocation['amount'],
            ]);
        }

        $movement->load('allocations.document');
        $this->validateAllocations($movement);

        /* Paying invoices makes it a party receipt/payment, whatever category was picked, so the account statement and balance include it. */
        $expected = $movement->direction === 'incoming' ? 'customer_receipt' : 'supplier_payment';

        if (
            $movement->allocations->isNotEmpty()
            && ! in_array($movement->category, [$expected, 'correction', 'refund'], true)
        ) {
            $movement->category = $expected;
            $movement->save();
        }
    }

    private function validateAllocations(CashMovement $movement): void
    {
        $movement->loadMissing('allocations.document');
        $allocated = 0.0;

        foreach ($movement->allocations as $allocation) {
            $document = $allocation->document;

            if (! $document || in_array($document->status, ['draft', 'superseded', 'voided'], true)) {
                throw ValidationException::withMessages([
                    'allocations' => ['Payments can only be allocated to active issued invoices.'],
                ]);
            }

            $requiredKind = $movement->direction === 'incoming'
                ? 'sale_invoice'
                : 'purchase_invoice';

            if ($document->kind !== $requiredKind) {
                throw ValidationException::withMessages([
                    'allocations' => ['Receipt allocations must target sales invoices and outgoing payments must target purchase invoices.'],
                ]);
            }

            if ($document->currency !== $movement->currency) {
                throw ValidationException::withMessages([
                    'allocations' => ['Invoice allocation currency must match the cash movement currency.'],
                ]);
            }

            if ($movement->party_id && (int) $document->party_id !== (int) $movement->party_id) {
                throw ValidationException::withMessages([
                    'allocations' => ['All allocated invoices must belong to the selected counterparty.'],
                ]);
            }

            if (
                ! $movement->corrected_from_id
                && (float) $allocation->amount > (float) $document->balance_due + 0.00005
            ) {
                throw ValidationException::withMessages([
                    'allocations' => ['New cash movements cannot allocate more than the invoice outstanding balance. Keep the extra amount as advance credit.'],
                ]);
            }

            $allocated += (float) $allocation->amount;
        }

        if ($allocated > (float) $movement->amount + 0.00005) {
            throw ValidationException::withMessages([
                'allocations' => ['Allocated invoice amounts cannot exceed the cash movement amount.'],
            ]);
        }

        if ($movement->government_obligation_id && $movement->direction !== 'outgoing') {
            throw ValidationException::withMessages([
                'government_obligation_id' => ['Government obligations can only be linked to outgoing payments.'],
            ]);
        }
    }

    private function refreshLinkedBalances(CashMovement $movement): void
    {
        $movement->loadMissing('allocations');

        $documentIds = $movement->allocations
            ->pluck('financial_document_id')
            ->unique()
            ->values();

        foreach ($documentIds as $documentId) {
            $document = FinancialDocument::query()->find($documentId);

            if ($document) {
                $this->documents->recalculatePaymentState($document);
            }
        }

        if ($movement->government_obligation_id) {
            $this->recalculateObligation((int) $movement->government_obligation_id);
        }
    }

    private function recalculateObligation(int $obligationId): void
    {
        $obligation = GovernmentObligation::query()
            ->lockForUpdate()
            ->findOrFail($obligationId);

        $paid = (float) CashMovement::query()
            ->where('government_obligation_id', $obligation->id)
            ->where('direction', 'outgoing')
            ->where('status', 'posted')
            ->where(function ($query): void {
                $query
                    ->where('method', '!=', 'check')
                    ->orWhereNull('check_status')
                    ->orWhereNotIn('check_status', ['bounced', 'cancelled']);
            })
            ->sum('amount');

        $amount = (float) $obligation->amount;
        $balance = max($amount - $paid, 0);

        $obligation->paid_total = number_format($paid, 4, '.', '');
        $obligation->balance_due = number_format($balance, 4, '.', '');
        $obligation->status = $paid <= 0
            ? 'open'
            : ($paid < $amount ? 'partial' : 'paid');
        $obligation->save();
    }

    private function assertDepartmentSpendingLimit(
        CashMovement $movement,
    ): void {
        if (
            $movement->direction !== 'outgoing'
            || ! $movement->department_id
            || $movement->reversal_of_id
        ) {
            return;
        }

        $limit = DB::table(
            'department_spending_limits',
        )
            ->where(
                'department_id',
                $movement->department_id,
            )
            ->where(
                'currency',
                $movement->currency,
            )
            ->where('active', true)
            ->first();

        if (! $limit) {
            return;
        }

        $date = $movement->movement_date
            ?? now();

        $spent = (float) CashMovement::query()
            ->where(
                'department_id',
                $movement->department_id,
            )
            ->where(
                'currency',
                $movement->currency,
            )
            ->where('direction', 'outgoing')
            ->where('status', 'posted')
            ->where('id', '!=', $movement->id)
            ->whereYear(
                'movement_date',
                $date->year,
            )
            ->whereMonth(
                'movement_date',
                $date->month,
            )
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

        $projected =
            $spent
            + (float) $movement->amount;

        if (
            $projected
            > (float) $limit->monthly_limit
                + 0.00005
        ) {
            throw ValidationException::withMessages([
                'department_id' => [
                    sprintf(
                        'This payment would exceed the department monthly spending limit. Current spend: %s %s. Limit: %s %s.',
                        number_format(
                            $spent,
                            4,
                            '.',
                            '',
                        ),
                        $movement->currency,
                        number_format(
                            (float) $limit->monthly_limit,
                            4,
                            '.',
                            '',
                        ),
                        $movement->currency,
                    ),
                ],
            ]);
        }
    }

    private function assertReferences(array $data): void
    {
        if ($data['party_id'] ?? null) {
            Party::query()
                ->withTrashed()
                ->findOrFail((int) $data['party_id']);
        }

        if ($data['department_id'] ?? null) {
            Department::query()
                ->findOrFail((int) $data['department_id']);
        }

        if ($data['government_obligation_id'] ?? null) {
            $obligation = GovernmentObligation::query()
                ->findOrFail((int) $data['government_obligation_id']);

            if (($data['direction'] ?? null) !== 'outgoing') {
                throw ValidationException::withMessages([
                    'government_obligation_id' => ['Government obligations can only be linked to outgoing payments.'],
                ]);
            }

            if (
                isset($data['currency'])
                && strtoupper((string) $data['currency']) !== strtoupper((string) $obligation->currency)
            ) {
                throw ValidationException::withMessages([
                    'currency' => ['Government obligation payments must use the obligation currency.'],
                ]);
            }
        }
    }

    /** @return array<string, mixed> */
    private function payload(array $data): array
    {
        $method = $data['method'];
        $check = $method === 'check';

        return [
            'party_id' => $data['party_id'] ?? null,
            'government_obligation_id' => $data['government_obligation_id'] ?? null,
            'department_id' => $data['department_id'] ?? null,
            'direction' => $data['direction'],
            'category' => $data['category'],
            'amount' => $data['amount'],
            'currency' => $data['currency'],
            'movement_date' => $data['movement_date'],
            'method' => $method,
            'account_label' => $data['account_label'] ?? null,
            'branch_label' => $data['branch_label'] ?? null,
            'cost_center' => $data['cost_center'] ?? null,
            'reference' => $data['reference'] ?? null,
            'check_number' => $check ? ($data['check_number'] ?? null) : null,
            'check_bank' => $check ? ($data['check_bank'] ?? null) : null,
            'check_due_date' => $check ? ($data['check_due_date'] ?? null) : null,
            'check_status' => $check ? ($data['check_status'] ?? 'pending') : null,
            'method_details' => $data['method_details'] ?? null,
            'notes' => $data['notes'] ?? null,
        ];
    }

    /** @return array<int, string> */
    private function relations(): array
    {
        return [
            'party.roles',
            'governmentObligation.taxRule',
            'department',
            'allocations.document.party',
        ];
    }

    /** @return array<string, mixed> */
    private function snapshot(CashMovement $movement): array
    {
        $movement->loadMissing('allocations');

        return [
            'id' => $movement->id,
            'number' => $movement->number,
            'status' => $movement->status,
            'direction' => $movement->direction,
            'category' => $movement->category,
            'amount' => $movement->amount,
            'currency' => $movement->currency,
            'movement_date' => $movement->movement_date?->format('Y-m-d'),
            'method' => $movement->method,
            'reference' => $movement->reference,
            'check_status' => $movement->check_status,
            'allocations' => $movement->allocations->map(fn ($allocation) => [
                'financial_document_id' => $allocation->financial_document_id,
                'amount' => $allocation->amount,
            ])->all(),
        ];
    }
}
