<?php

namespace App\Services\Finance;

use App\Models\CashMovement;
use App\Models\FinancialDocument;
use App\Models\PartyAdjustment;
use App\Tenancy\TenantContext;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Old versions of financial records: invoices replaced by a correction or voided,
 * and cash movements reversed by a correction. They stay out of the normal lists
 * and can be deleted here, by hand or by the monthly clean-up.
 */
class FinanceArchiveService
{
    public const ARCHIVED_DOCUMENT_STATUSES = ['superseded', 'voided'];

    public const AUTO_PURGE_PREFERENCE = 'finance_archive_auto_purge';

    public function __construct(
        private readonly FinanceDocumentService $documents,
        private readonly FinanceAuditService $audit,
    ) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function documents(): array
    {
        $records = FinancialDocument::query()
            ->with('party:id,name,company_name')
            ->whereIn('status', self::ARCHIVED_DOCUMENT_STATUSES)
            ->latest('updated_at')
            ->limit(1000)
            ->get();

        $replacements = FinancialDocument::query()
            ->whereIn('corrected_from_id', $records->pluck('id'))
            ->pluck('number', 'corrected_from_id');

        return $records->map(fn (FinancialDocument $document): array => [
            'type' => 'document',
            'id' => $document->id,
            'kind' => $document->kind,
            'number' => $document->number,
            'external_number' => $document->external_number,
            'party' => $document->party?->company_name ?: $document->party?->name,
            'date' => $document->issue_date?->format('Y-m-d'),
            'amount' => $document->total,
            'status' => $document->status,
            'replaced_by' => $replacements[$document->id] ?? null,
            'reason' => $document->correction_reason,
            'archived_at' => $document->updated_at?->toIso8601String(),
        ])->values()->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function movements(): array
    {
        $records = CashMovement::query()
            ->with('party:id,name,company_name')
            ->where('status', 'reversed')
            ->whereNull('reversal_of_id')
            ->latest('updated_at')
            ->limit(1000)
            ->get();

        $replacements = CashMovement::query()
            ->whereIn('corrected_from_id', $records->pluck('id'))
            ->pluck('number', 'corrected_from_id');

        return $records->map(fn (CashMovement $movement): array => [
            'type' => 'movement',
            'id' => $movement->id,
            'kind' => $movement->direction,
            'number' => $movement->number,
            'external_number' => $movement->reference,
            'party' => $movement->party?->company_name ?: $movement->party?->name,
            'date' => $movement->movement_date?->format('Y-m-d'),
            'amount' => $movement->amount,
            'status' => $movement->status,
            'replaced_by' => $replacements[$movement->id] ?? null,
            'reason' => $movement->correction_reason,
            'archived_at' => $movement->updated_at?->toIso8601String(),
        ])->values()->all();
    }

    /**
     * Voided difference entries ("قيد فروقات").
     *
     * @return list<array<string, mixed>>
     */
    public function adjustments(): array
    {
        return PartyAdjustment::query()
            ->with('party:id,name,company_name')
            ->where('status', PartyAdjustment::STATUS_VOIDED)
            ->latest('updated_at')
            ->limit(1000)
            ->get()
            ->map(fn (PartyAdjustment $adjustment): array => [
                'type' => 'adjustment',
                'id' => $adjustment->id,
                'kind' => 'adjustment',
                'side' => $adjustment->side,
                'party_id' => $adjustment->party_id,
                'number' => $adjustment->number,
                'external_number' => $adjustment->reason,
                'party' => $adjustment->party?->company_name ?: $adjustment->party?->name,
                'date' => $adjustment->adjustment_date?->format('Y-m-d'),
                'amount' => $adjustment->amount,
                'status' => $adjustment->status,
                'replaced_by' => null,
                'reason' => $adjustment->void_reason,
                'archived_at' => $adjustment->updated_at?->toIso8601String(),
            ])->values()->all();
    }

    /**
     * Permanently delete archived invoices, cash movements and voided difference entries.
     *
     * @param  list<int>  $documentIds
     * @param  list<int>  $movementIds
     * @param  list<int>  $adjustmentIds
     * @return array{documents: int, movements: int, adjustments: int}
     */
    public function delete(array $documentIds, array $movementIds, int $actorId, array $adjustmentIds = []): array
    {
        $deletedDocuments = 0;
        $deletedMovements = 0;
        $deletedAdjustments = 0;

        foreach (PartyAdjustment::query()->whereIn('id', $adjustmentIds)->get() as $adjustment) {
            if ($adjustment->status !== PartyAdjustment::STATUS_VOIDED) {
                throw ValidationException::withMessages([
                    'adjustments' => [$this->message(
                        'قيد الفروقات '.$adjustment->number.' ليس في الأرشيف.',
                        'Difference entry '.$adjustment->number.' is not archived.',
                    )],
                ]);
            }

            $this->audit->record($adjustment, 'deleted', $actorId, 'Deleted from the finance archive', [
                'number' => $adjustment->number, 'amount' => $adjustment->amount,
            ], null);
            $adjustment->delete();
            $deletedAdjustments++;
        }

        foreach (FinancialDocument::query()->whereIn('id', $documentIds)->get() as $document) {
            if (! in_array($document->status, self::ARCHIVED_DOCUMENT_STATUSES, true)) {
                throw ValidationException::withMessages([
                    'documents' => [$this->message(
                        'الفاتورة '.$document->number.' ليست في الأرشيف.',
                        'Invoice '.$document->number.' is not archived.',
                    )],
                ]);
            }

            $this->documents->deleteDocument($document, $actorId);
            $deletedDocuments++;
        }

        foreach (CashMovement::query()->whereIn('id', $movementIds)->get() as $movement) {
            $this->deleteMovement($movement, $actorId);
            $deletedMovements++;
        }

        return ['documents' => $deletedDocuments, 'movements' => $deletedMovements, 'adjustments' => $deletedAdjustments];
    }

    /**
     * Delete everything that has been in the archive since before the cut-off.
     *
     * @return array{documents: int, movements: int, adjustments: int}
     */
    public function purgeOlderThan(CarbonInterface $cutoff, int $actorId): array
    {
        $documentIds = FinancialDocument::query()
            ->whereIn('status', self::ARCHIVED_DOCUMENT_STATUSES)
            ->where('updated_at', '<', $cutoff)
            ->whereDoesntHave('allocations')
            ->pluck('id')
            ->all();

        $movementIds = CashMovement::query()
            ->where('status', 'reversed')
            ->whereNull('reversal_of_id')
            ->where('updated_at', '<', $cutoff)
            ->pluck('id')
            ->all();

        $adjustmentIds = PartyAdjustment::query()
            ->where('status', PartyAdjustment::STATUS_VOIDED)
            ->where('updated_at', '<', $cutoff)
            ->pluck('id')
            ->all();

        $deleted = ['documents' => 0, 'movements' => 0, 'adjustments' => 0];

        foreach ($documentIds as $id) {
            try {
                $deleted = $this->sum($deleted, $this->delete([$id], [], $actorId));
            } catch (ValidationException) {
                /* Linked to a return request or similar; keep it and continue. */
            }
        }

        return $this->sum($deleted, $this->delete([], $movementIds, $actorId, $adjustmentIds));
    }

    public function autoPurgeEnabled(): bool
    {
        return (bool) (app(TenantContext::class)->organization()->preferences[self::AUTO_PURGE_PREFERENCE] ?? false);
    }

    public function setAutoPurge(bool $enabled): void
    {
        $organization = app(TenantContext::class)->organization();
        $organization->preferences = [
            ...($organization->preferences ?? []),
            self::AUTO_PURGE_PREFERENCE => $enabled,
        ];
        $organization->save();
    }

    /**
     * A reversed movement is deleted together with the reversal entry that cancelled
     * it; on their own the pair nets to zero, so no balance changes.
     */
    private function deleteMovement(CashMovement $movement, int $actorId): void
    {
        DB::transaction(function () use ($movement, $actorId): void {
            $locked = CashMovement::query()->lockForUpdate()->findOrFail($movement->id);

            if ($locked->status !== 'reversed' || $locked->reversal_of_id !== null) {
                throw ValidationException::withMessages([
                    'movements' => [$this->message(
                        'الحركة '.$locked->number.' ليست في الأرشيف.',
                        'Cash movement '.$locked->number.' is not archived.',
                    )],
                ]);
            }

            $reversals = CashMovement::query()->where('reversal_of_id', $locked->id)->get();

            $this->audit->record(
                $locked,
                'deleted',
                $actorId,
                'Deleted from the finance archive',
                ['number' => $locked->number, 'amount' => $locked->amount, 'reversals' => $reversals->pluck('number')->all()],
                null,
            );

            foreach ($reversals as $reversal) {
                $reversal->delete();
            }

            $locked->delete();
        }, 3);
    }

    /**
     * @param  array{documents: int, movements: int, adjustments: int}  $a
     * @param  array{documents: int, movements: int, adjustments: int}  $b
     * @return array{documents: int, movements: int, adjustments: int}
     */
    private function sum(array $a, array $b): array
    {
        return [
            'documents' => $a['documents'] + $b['documents'],
            'movements' => $a['movements'] + $b['movements'],
            'adjustments' => $a['adjustments'] + $b['adjustments'],
        ];
    }

    private function message(string $arabic, string $english): string
    {
        return app()->getLocale() === 'ar' ? $arabic : $english;
    }
}
