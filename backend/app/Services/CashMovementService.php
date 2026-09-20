<?php

namespace App\Services;

use App\Models\CashAllocation;
use App\Models\CashMovement;
use App\Models\Department;
use App\Models\FinancialDocument;
use App\Models\GovernmentObligation;
use App\Models\Party;
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

            $movement = CashMovement::create([
                ...$this->payload($data),
                'number' => $this->numbers->next(
                    $data['direction'] === 'incoming' ? 'cash_receipts' : 'cash_payments',
                    $data['direction'] === 'incoming' ? 'RCV' : 'PAY',
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

            $before = $this->snapshot($locked);
            $locked->status = 'posted';
            $locked->posted_at = now();
            $locked->updated_by = $actorId;
            $locked->save();

            $this->refreshLinkedBalances($locked);

            $this->audit->record(
                $locked,
                'posted',
                $actorId,
                null,
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

            $reversal = CashMovement::create([
                'party_id' => $locked->party_id,
                'government_obligation_id' => null,
                'department_id' => $locked->department_id,
                'reversal_of_id' => $locked->id,
                'number' => $this->numbers->next('cash_reversals', 'REV'),
                'direction' => $locked->direction === 'incoming' ? 'outgoing' : 'incoming',
                'status' => 'posted',
                'category' => 'correction',
                'amount' => $locked->amount,
                'currency' => $locked->currency,
                'movement_date' => now()->toDateString(),
                'method' => $locked->method,
                'account_label' => $locked->account_label,
                'branch_label' => $locked->branch_label,
                'cost_center' => $locked->cost_center,
                'reference' => 'Reversal of '.$locked->number,
                'method_details' => $locked->method_details,
                'notes' => $reason,
                'correction_reason' => $reason,
                'posted_at' => now(),
                'created_by' => $actorId,
                'updated_by' => $actorId,
            ]);

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

            CashMovement::create([
                'party_id' => $locked->party_id,
                'department_id' => $locked->department_id,
                'reversal_of_id' => $locked->id,
                'number' => $this->numbers->next('cash_reversals', 'REV'),
                'direction' => $locked->direction === 'incoming' ? 'outgoing' : 'incoming',
                'status' => 'posted',
                'category' => 'correction',
                'amount' => $locked->amount,
                'currency' => $locked->currency,
                'movement_date' => now()->toDateString(),
                'method' => $locked->method,
                'account_label' => $locked->account_label,
                'branch_label' => $locked->branch_label,
                'cost_center' => $locked->cost_center,
                'reference' => 'Correction reversal of '.$locked->number,
                'method_details' => $locked->method_details,
                'notes' => $reason,
                'correction_reason' => $reason,
                'posted_at' => now(),
                'created_by' => $actorId,
                'updated_by' => $actorId,
            ]);

            $replacement = CashMovement::create([
                'party_id' => $locked->party_id,
                'government_obligation_id' => $locked->government_obligation_id,
                'department_id' => $locked->department_id,
                'corrected_from_id' => $locked->id,
                'number' => $this->numbers->next(
                    $locked->direction === 'incoming' ? 'cash_receipts' : 'cash_payments',
                    $locked->direction === 'incoming' ? 'RCV' : 'PAY',
                ),
                'direction' => $locked->direction,
                'status' => 'draft',
                'category' => $locked->category,
                'amount' => $locked->amount,
                'currency' => $locked->currency,
                'movement_date' => now()->toDateString(),
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

            $locked->status = 'reversed';
            $locked->correction_reason = $reason;
            $locked->updated_by = $actorId;
            $locked->save();

            $this->refreshLinkedBalances($locked);

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
