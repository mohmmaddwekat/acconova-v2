<?php

namespace App\Http\Controllers;

use App\Models\FinancialDocument;
use App\Models\FinancialDocumentLine;
use App\Services\FinanceAuthorization;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DocumentFulfillmentController extends Controller
{
    public function index(
        Request $request,
        string $document,
    ): JsonResponse {
        $document = FinancialDocument::query()
            ->with('lines')
            ->findOrFail($document);

        $this->authorize(
            $request,
            $document,
            false,
        );

        return response()->json([
            'data' => $this->summary($document),
        ]);
    }

    public function store(
        Request $request,
        string $document,
    ): JsonResponse {
        $document = FinancialDocument::query()
            ->with('lines')
            ->findOrFail($document);

        $this->authorize(
            $request,
            $document,
            true,
        );

        abort_unless(
            in_array(
                $document->status,
                [
                    'issued',
                    'partially_paid',
                    'paid',
                    'overpaid',
                ],
                true,
            ),
            422,
            'Fulfillment can only be tracked on issued invoices.',
        );

        $data = $request->validate([
            'line_id' => ['required', 'integer'],
            'quantity' => ['required', 'numeric', 'gt:0', 'max:999999999'],
            'occurred_on' => ['required', 'date_format:Y-m-d'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $line = $document->lines
            ->firstWhere(
                'id',
                (int) $data['line_id'],
            );

        abort_unless(
            $line instanceof FinancialDocumentLine,
            404,
        );

        abort_unless(
            (bool) $line->affects_inventory,
            422,
            'Only inventory-affecting lines can be delivered or received.',
        );

        $fulfilled = (float) DB::table('financial_line_fulfillments')
            ->where('organization_id', app(TenantContext::class)->id())
            ->where('financial_document_line_id', $line->id)
            ->sum('quantity');

        $ordered = (float) $line->quantity;
        $remaining = max(
            $ordered - $fulfilled,
            0,
        );
        $quantity = (float) $data['quantity'];

        abort_if(
            $quantity > $remaining + 0.00005,
            422,
            'Fulfillment quantity exceeds the remaining invoice quantity.',
        );

        DB::table('financial_line_fulfillments')->insert([
            'organization_id' => app(TenantContext::class)->id(),
            'financial_document_line_id' => $line->id,
            'quantity' => $data['quantity'],
            'occurred_on' => $data['occurred_on'],
            'note' => isset($data['note'])
                ? trim((string) $data['note']) ?: null
                : null,
            'created_by' => $request->user()->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $document->load('lines');

        return response()->json([
            'data' => $this->summary($document),
        ], 201);
    }

    public function destroy(
        Request $request,
        string $document,
        string $fulfillment,
    ): JsonResponse {
        $document = FinancialDocument::query()
            ->findOrFail($document);

        $this->authorize(
            $request,
            $document,
            true,
        );

        $row = DB::table('financial_line_fulfillments as f')
            ->join(
                'financial_document_lines as l',
                'l.id',
                '=',
                'f.financial_document_line_id',
            )
            ->where(
                'f.organization_id',
                app(TenantContext::class)->id(),
            )
            ->where(
                'l.financial_document_id',
                $document->id,
            )
            ->where(
                'f.id',
                (int) $fulfillment,
            )
            ->select('f.id')
            ->first();

        abort_unless(
            $row,
            404,
        );

        DB::table('financial_line_fulfillments')
            ->where('id', $row->id)
            ->delete();

        return response()->json([
            'ok' => true,
        ]);
    }

    /**
     * This is operational tracking only. It deliberately does not mutate
     * invoice totals, accounting entries, or inventory balances.
     *
     * @return array<string, mixed>
     */
    private function summary(
        FinancialDocument $document,
    ): array {
        $rows = DB::table('financial_line_fulfillments')
            ->where('organization_id', app(TenantContext::class)->id())
            ->whereIn(
                'financial_document_line_id',
                $document->lines->pluck('id'),
            )
            ->orderByDesc('occurred_on')
            ->orderByDesc('id')
            ->get();

        $byLine = $rows->groupBy('financial_document_line_id');

        return [
            'mode' => $document->isSale()
                ? 'delivery'
                : 'receipt',
            'lines' => $document->lines
                ->filter(
                    fn (FinancialDocumentLine $line): bool => (bool) $line->affects_inventory,
                )
                ->map(function (
                    FinancialDocumentLine $line,
                ) use ($byLine): array {
                    $events = $byLine->get(
                        $line->id,
                        collect(),
                    );

                    $fulfilled = (float) $events->sum('quantity');
                    $quantity = (float) $line->quantity;
                    $remaining = max(
                        $quantity - $fulfilled,
                        0,
                    );

                    return [
                        'line_id' => $line->id,
                        'description' => $line->description,
                        'sku' => $line->sku_snapshot,
                        'unit' => $line->unit_snapshot,
                        'quantity' => $line->quantity,
                        'fulfilled_quantity' => number_format(
                            $fulfilled,
                            4,
                            '.',
                            '',
                        ),
                        'remaining_quantity' => number_format(
                            $remaining,
                            4,
                            '.',
                            '',
                        ),
                        'status' => $fulfilled <= 0.00005
                            ? 'pending'
                            : (
                                $remaining <= 0.00005
                                    ? 'complete'
                                    : 'partial'
                            ),
                        'events' => $events
                            ->map(fn ($event): array => [
                                'id' => $event->id,
                                'quantity' => (string) $event->quantity,
                                'occurred_on' => (string) $event->occurred_on,
                                'note' => $event->note,
                                'created_by' => $event->created_by,
                                'created_at' => (string) $event->created_at,
                            ])
                            ->values(),
                    ];
                })
                ->values(),
        ];
    }

    private function authorize(
        Request $request,
        FinancialDocument $document,
        bool $manage,
    ): void {
        FinanceAuthorization::authorize(
            $request->user(),
            $document->isSale()
                ? (
                    $manage
                        ? 'finance.sales.manage'
                        : 'finance.sales.view'
                )
                : (
                    $manage
                        ? 'finance.purchases.manage'
                        : 'finance.purchases.view'
                ),
        );
    }
}
