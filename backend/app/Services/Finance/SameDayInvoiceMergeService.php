<?php

namespace App\Services\Finance;

use App\Models\FinancialDocument;
use App\Models\PartyAdjustment;
use App\Services\Governance\ApprovalWorkflowService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The system allows one active invoice per party, kind and day. When another
 * invoice is entered for the same party and day, its lines are added to the
 * existing invoice through a correction: the old invoice is superseded and its
 * payments move to the merged one.
 */
class SameDayInvoiceMergeService
{
    private const EPSILON = 0.00005;

    public function __construct(
        private readonly FinanceDocumentService $documents,
        private readonly ApprovalWorkflowService $approvals,
    ) {}

    public function find(string $kind, int $partyId, string $date): ?FinancialDocument
    {
        return FinancialDocument::query()
            ->with('lines')
            ->where('kind', $kind)
            ->where('party_id', $partyId)
            ->where('is_misc_sale', false)
            ->whereDate('issue_date', substr($date, 0, 10))
            ->whereIn('status', ['issued', 'partially_paid', 'paid', 'overpaid'])
            ->orderByDesc('id')
            ->first();
    }

    /**
     * @param  list<array<string, mixed>>  $newLines
     */
    public function merge(
        FinancialDocument $existing,
        array $newLines,
        string $discountType,
        float $discountValue,
        ?string $reference,
        int $actorId,
    ): FinancialDocument {
        return DB::transaction(function () use ($existing, $newLines, $discountType, $discountValue, $reference, $actorId): FinancialDocument {
            $hasLinkedAdjustments = PartyAdjustment::query()
                ->where('financial_document_id', $existing->id)
                ->where('status', PartyAdjustment::STATUS_POSTED)
                ->exists();

            if ($hasLinkedAdjustments) {
                $this->fail('على الفاتورة '.$existing->number.' خصم أو مقاصة مرتبطة بها، فلا يمكن ضم بنود إليها تلقائياً.');
            }

            $oldDiscount = (float) $existing->document_discount_value;

            if ($discountValue > 0 && $oldDiscount > 0) {
                $this->fail('للفاتورة '.$existing->number.' خصم على مستوى الفاتورة، ولا يمكن دمجه مع خصم جديد. أدخل الفاتورة بدون خصم أو عدّل الفاتورة يدوياً.');
            }

            $merged = $existing->lines->map(fn ($line): array => [
                'product_id' => $line->product_id,
                'tax_rule_id' => $line->tax_rule_id,
                'warehouse_id' => $line->warehouse_id,
                'description' => $line->description,
                'unit' => $line->unit_snapshot,
                'quantity' => $line->quantity,
                'unit_price' => $line->unit_price,
                'price_status' => $line->price_status,
                'discount_percent' => $line->discount_percent,
                'discount_type' => $line->discount_type,
                'discount_value' => $line->discount_value,
                'tax_rate' => $line->tax_rate,
                'affects_inventory' => (bool) $line->affects_inventory,
            ])->all();

            foreach ($newLines as $line) {
                $index = empty($line['product_id'])
                    ? false
                    : collect($merged)->search(fn (array $candidate): bool => (int) $candidate['product_id'] === (int) $line['product_id']);

                if ($index === false) {
                    $merged[] = $line;

                    continue;
                }

                if (abs((float) $merged[$index]['unit_price'] - (float) $line['unit_price']) > self::EPSILON) {
                    $this->fail('المنتج "'.($line['description'] ?? '').'" موجود في الفاتورة '.$existing->number.' بسعر مختلف، فلا يمكن جمع الكميتين تلقائياً.');
                }

                $merged[$index]['quantity'] = (string) ((float) $merged[$index]['quantity'] + (float) $line['quantity']);
            }

            $replacement = $this->documents->startCorrection($existing, 'ضم بنود فاتورة جديدة لنفس اليوم', $actorId);

            $draft = $this->documents->updateDraft($replacement, [
                'kind' => $existing->kind,
                'party_id' => $existing->party_id,
                'warehouse_id' => $existing->warehouse_id,
                'department_id' => $existing->department_id,
                'activity_type' => $existing->activity_type,
                'market_type' => $existing->market_type,
                'branch_label' => $existing->branch_label,
                'payment_terms' => $existing->payment_terms,
                'notes' => $existing->notes,
                'internal_notes' => $existing->internal_notes,
                'external_number' => $existing->external_number ?: $reference,
                'issue_date' => $existing->issue_date->format('Y-m-d'),
                'due_date' => $existing->due_date?->format('Y-m-d'),
                'currency' => $existing->currency,
                'exchange_rate' => $existing->exchange_rate,
                'shipping_total' => $existing->shipping_total,
                'document_discount_type' => $oldDiscount > 0 ? $existing->document_discount_type : $discountType,
                'document_discount_value' => $oldDiscount > 0 ? $existing->document_discount_value : $discountValue,
                'lines' => $merged,
            ], $actorId);

            $this->approvals->assertDocumentApproved($draft, $actorId);

            return $this->documents->issue($draft, $actorId, true);
        }, 3);
    }

    private function fail(string $message): never
    {
        throw ValidationException::withMessages(['lines' => [$message]]);
    }
}
