<?php

namespace App\Http\Controllers;

use App\Models\CashMovement;
use App\Services\FinanceAuthorization;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class BankReconciliationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        FinanceAuthorization::authorize(
            $request->user(),
            'finance.cash.view',
        );

        $status = $request->validate([
            'status' => [
                'nullable',
                Rule::in([
                    'unmatched',
                    'matched',
                    'ignored',
                    'all',
                ]),
            ],
        ])['status'] ?? 'unmatched';

        $query = DB::table('bank_statement_lines')
            ->where(
                'organization_id',
                app(TenantContext::class)->id(),
            );

        if ($status !== 'all') {
            $query->where('status', $status);
        }

        $lines = $query
            ->latest('transaction_date')
            ->latest('id')
            ->limit(250)
            ->get();

        $rows = $lines->map(function ($line): array {
            $candidate = null;

            if ($line->status === 'unmatched') {
                $direction = (float) $line->amount >= 0
                    ? 'incoming'
                    : 'outgoing';

                $candidate = CashMovement::query()
                    ->where('status', 'posted')
                    ->where('direction', $direction)
                    ->whereBetween('movement_date', [
                        \Carbon\Carbon::parse($line->transaction_date)
                            ->subDays(3)
                            ->toDateString(),
                        \Carbon\Carbon::parse($line->transaction_date)
                            ->addDays(3)
                            ->toDateString(),
                    ])
                    ->whereRaw(
                        'ABS(amount - ?) <= 0.0001',
                        [abs((float) $line->amount)],
                    )
                    ->orderByRaw(
                        'ABS(DATEDIFF(movement_date, ?))',
                        [$line->transaction_date],
                    )
                    ->first();
            }

            return [
                ...((array) $line),
                'suggested_match' => $candidate
                    ? [
                        'id' => $candidate->id,
                        'number' => $candidate->number,
                        'direction' => $candidate->direction,
                        'movement_date' => $candidate->movement_date?->format('Y-m-d'),
                        'amount' => $candidate->amount,
                        'reference' => $candidate->reference,
                        'method' => $candidate->method,
                    ]
                    : null,
            ];
        })->values();

        return response()->json([
            'data' => $rows,
            'summary' => [
                'unmatched' => DB::table('bank_statement_lines')
                    ->where('organization_id', app(TenantContext::class)->id())
                    ->where('status', 'unmatched')
                    ->count(),
                'matched' => DB::table('bank_statement_lines')
                    ->where('organization_id', app(TenantContext::class)->id())
                    ->where('status', 'matched')
                    ->count(),
                'ignored' => DB::table('bank_statement_lines')
                    ->where('organization_id', app(TenantContext::class)->id())
                    ->where('status', 'ignored')
                    ->count(),
            ],
        ]);
    }

    public function import(Request $request): JsonResponse
    {
        FinanceAuthorization::authorize(
            $request->user(),
            'finance.cash.view',
        );

        $data = $request->validate([
            'lines' => ['required', 'array', 'min:1', 'max:1000'],
            'lines.*.bank_account_label' => ['nullable', 'string', 'max:160'],
            'lines.*.transaction_date' => ['required', 'date_format:Y-m-d'],
            'lines.*.description' => ['required', 'string', 'max:500'],
            'lines.*.reference' => ['nullable', 'string', 'max:160'],
            'lines.*.amount' => ['required', 'numeric', 'between:-999999999999,999999999999'],
            'lines.*.currency' => ['required', 'regex:/^[A-Z]{3}$/'],
        ]);

        $organizationId = app(TenantContext::class)->id();
        $inserted = 0;
        $skipped = 0;

        foreach ($data['lines'] as $line) {
            $exists = DB::table('bank_statement_lines')
                ->where('organization_id', $organizationId)
                ->whereDate(
                    'transaction_date',
                    $line['transaction_date'],
                )
                ->where('amount', $line['amount'])
                ->where(
                    'reference',
                    $line['reference'] ?? null,
                )
                ->where(
                    'description',
                    trim((string) $line['description']),
                )
                ->exists();

            if ($exists) {
                $skipped++;
                continue;
            }

            DB::table('bank_statement_lines')->insert([
                'organization_id' => $organizationId,
                'bank_account_label' => isset($line['bank_account_label'])
                    ? trim((string) $line['bank_account_label']) ?: null
                    : null,
                'transaction_date' => $line['transaction_date'],
                'description' => trim((string) $line['description']),
                'reference' => isset($line['reference'])
                    ? trim((string) $line['reference']) ?: null
                    : null,
                'amount' => $line['amount'],
                'currency' => strtoupper((string) $line['currency']),
                'status' => 'unmatched',
                'matched_cash_movement_id' => null,
                'imported_by' => $request->user()->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $inserted++;
        }

        return response()->json([
            'data' => [
                'inserted' => $inserted,
                'skipped_duplicates' => $skipped,
            ],
        ], 201);
    }

    public function match(
        Request $request,
        string $line,
    ): JsonResponse {
        FinanceAuthorization::authorize(
            $request->user(),
            'finance.cash.view',
        );

        $data = $request->validate([
            'cash_movement_id' => ['required', 'integer'],
        ]);

        $row = $this->find($line);
        $movement = CashMovement::query()
            ->where('status', 'posted')
            ->findOrFail((int) $data['cash_movement_id']);

        $direction = (float) $row->amount >= 0
            ? 'incoming'
            : 'outgoing';

        abort_unless($movement->direction === $direction, 422);
        abort_unless(
            abs(
                (float) $movement->amount
                - abs((float) $row->amount),
            ) <= 0.0001,
            422,
        );

        DB::table('bank_statement_lines')
            ->where('id', $row->id)
            ->update([
                'status' => 'matched',
                'matched_cash_movement_id' => $movement->id,
                'updated_at' => now(),
            ]);

        return response()->json([
            'ok' => true,
        ]);
    }

    public function ignore(
        Request $request,
        string $line,
    ): JsonResponse {
        FinanceAuthorization::authorize(
            $request->user(),
            'finance.cash.view',
        );

        $row = $this->find($line);

        DB::table('bank_statement_lines')
            ->where('id', $row->id)
            ->update([
                'status' => 'ignored',
                'matched_cash_movement_id' => null,
                'updated_at' => now(),
            ]);

        return response()->json([
            'ok' => true,
        ]);
    }

    private function find(string $id): object
    {
        $row = DB::table('bank_statement_lines')
            ->where(
                'organization_id',
                app(TenantContext::class)->id(),
            )
            ->where('id', (int) $id)
            ->first();

        abort_unless($row, 404);

        return $row;
    }
}
