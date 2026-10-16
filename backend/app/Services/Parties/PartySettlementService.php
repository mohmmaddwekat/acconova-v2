<?php

namespace App\Services\Parties;

use App\Enums\OrganizationRole;
use App\Models\Party;
use App\Models\PartyOpeningBalance;
use App\Models\PartySettlement;
use App\Models\User;
use App\Services\Finance\FinanceAuditService;
use App\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * Agreed offsets between what a dual-role Party owes us and what we owe it.
 *
 * Nothing is netted automatically. A settlement is requested with a valid
 * agreement, approved by a different reviewer (an owner may approve their own
 * request), and only then posted. Posting, rejecting and reversing are each
 * written to the finance audit trail with the actor and the before/after
 * state, and a posted settlement can only be undone by reversing it.
 */
final class PartySettlementService
{
    public function __construct(
        private readonly PartyBalanceSummary $balances,
        private readonly FinanceAuditService $audit,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function request(Party $party, array $data, User $actor): PartySettlement
    {
        $validated = Validator::make($data, [
            'amount' => ['required', 'numeric', 'gt:0', 'max:999999999999'],
            'settlement_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'agreement_reference' => ['required', 'string', 'max:120'],
            'agreement_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:settlement_date'],
            'agreement_notes' => ['nullable', 'string', 'max:2000'],
        ])->validate();

        return DB::transaction(function () use ($party, $validated, $actor): PartySettlement {
            $record = Party::query()->with('roles')->lockForUpdate()->findOrFail($party->id);
            $roles = $record->roles->map(fn ($role): string => $role->role->value)->all();

            if (! in_array('customer', $roles, true) || ! in_array('supplier', $roles, true)) {
                $this->fail('party', 'Only a Party that is both a customer and a supplier can be settled.');
            }

            $latestOpening = PartyOpeningBalance::query()->where('party_id', $record->id)->max('as_of_date');

            if ($latestOpening !== null && $validated['settlement_date'] <= substr((string) $latestOpening, 0, 10)) {
                $this->fail('settlement_date', 'The settlement date must be after the opening balance date.');
            }

            $available = $this->available($record) - $this->pendingTotal($record);

            if ((float) $validated['amount'] > $available + 0.00005) {
                $this->fail('amount', 'The amount exceeds what can be settled: '.number_format(max($available, 0), 4, '.', '').'.');
            }

            $settlement = PartySettlement::create([
                'party_id' => $record->id,
                'amount' => $validated['amount'],
                'currency' => strtoupper((string) (app(TenantContext::class)->organization()->preferences['currency'] ?? 'ILS')),
                'settlement_date' => $validated['settlement_date'],
                'agreement_reference' => $validated['agreement_reference'],
                'agreement_date' => $validated['agreement_date'],
                'agreement_notes' => $validated['agreement_notes'] ?? null,
                'status' => PartySettlement::STATUS_PENDING,
                'requested_by' => $actor->id,
            ]);

            $this->audit->record($settlement, 'settlement.requested', $actor->id, null, null, $this->snapshot($settlement));

            return $settlement;
        });
    }

    public function approve(PartySettlement $settlement, User $approver): PartySettlement
    {
        return DB::transaction(function () use ($settlement, $approver): PartySettlement {
            $record = $this->lock($settlement, PartySettlement::STATUS_PENDING);

            if ((int) $record->requested_by === $approver->id && app(TenantContext::class)->role() !== OrganizationRole::Owner) {
                $this->fail('approver', 'A different reviewer must approve this settlement.');
            }

            $party = Party::query()->lockForUpdate()->findOrFail($record->party_id);

            if ((float) $record->amount > $this->available($party) + 0.00005) {
                $this->fail('amount', 'The balances no longer cover this settlement. Reject it and request a new one.');
            }

            $before = $this->snapshot($record);
            $record->forceFill([
                'status' => PartySettlement::STATUS_POSTED,
                'approved_by' => $approver->id,
                'approved_at' => now(),
            ])->save();

            $this->audit->record($record, 'settlement.posted', $approver->id, null, $before, $this->snapshot($record));

            return $record;
        });
    }

    public function reject(PartySettlement $settlement, User $actor, string $reason): PartySettlement
    {
        $reason = $this->reason($reason);

        return DB::transaction(function () use ($settlement, $actor, $reason): PartySettlement {
            $record = $this->lock($settlement, PartySettlement::STATUS_PENDING);
            $before = $this->snapshot($record);
            $record->forceFill([
                'status' => PartySettlement::STATUS_REJECTED,
                'rejected_by' => $actor->id,
                'rejected_at' => now(),
                'rejection_reason' => $reason,
            ])->save();

            $this->audit->record($record, 'settlement.rejected', $actor->id, $reason, $before, $this->snapshot($record));

            return $record;
        });
    }

    public function reverse(PartySettlement $settlement, User $actor, string $reason): PartySettlement
    {
        $reason = $this->reason($reason);

        return DB::transaction(function () use ($settlement, $actor, $reason): PartySettlement {
            $record = $this->lock($settlement, PartySettlement::STATUS_POSTED);
            $before = $this->snapshot($record);
            $record->forceFill([
                'status' => PartySettlement::STATUS_REVERSED,
                'reversed_by' => $actor->id,
                'reversed_at' => now(),
                'reversal_reason' => $reason,
            ])->save();

            $this->audit->record($record, 'settlement.reversed', $actor->id, $reason, $before, $this->snapshot($record));

            return $record;
        });
    }

    /**
     * The most that can be settled now: the smaller of what the Party owes us
     * and what we owe it. Zero when either side has nothing outstanding.
     */
    public function available(Party $party): float
    {
        $position = $this->balances->forParties(collect([$party]), true, true, true)[$party->id] ?? null;

        if ($position === null) {
            return 0.0;
        }

        return max(min((float) $position['customer_position'], (float) $position['supplier_position']), 0.0);
    }

    private function pendingTotal(Party $party): float
    {
        return (float) PartySettlement::query()
            ->where('party_id', $party->id)
            ->where('status', PartySettlement::STATUS_PENDING)
            ->sum('amount');
    }

    private function lock(PartySettlement $settlement, string $requiredStatus): PartySettlement
    {
        $record = PartySettlement::query()->lockForUpdate()->findOrFail($settlement->id);

        if ($record->status !== $requiredStatus) {
            $this->fail('status', "Only a {$requiredStatus} settlement can be changed this way; this one is {$record->status}.");
        }

        return $record;
    }

    private function reason(string $reason): string
    {
        $reason = trim($reason);

        if ($reason === '') {
            $this->fail('reason', 'A reason is required.');
        }

        return mb_substr($reason, 0, 1000);
    }

    /**
     * @return array<string, mixed>
     */
    private function snapshot(PartySettlement $settlement): array
    {
        return $settlement->only([
            'party_id', 'amount', 'currency', 'settlement_date', 'agreement_reference', 'agreement_date', 'status',
            'requested_by', 'approved_by', 'rejection_reason', 'reversal_reason',
        ]);
    }

    private function fail(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => [$message]]);
    }
}
