<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\CashMovement;
use App\Services\Finance\CashMovementService;
use App\Services\Finance\FinanceAuthorization;
use App\Services\Governance\ApprovalWorkflowService;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PettyExpenseController extends Controller
{
    /** @var list<string> */
    public const CATEGORIES = [
        'operating_expense',
        'utilities',
        'maintenance',
        'shipping_customs',
        'rent',
        'asset_purchase',
        'other',
    ];

    /**
     * Posted outgoing payments that have no payee, totalled by category and by month.
     */
    public function summary(Request $request): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.cash.view');

        $data = $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
        ]);

        $rows = CashMovement::query()
            ->where('direction', 'outgoing')
            ->where('status', 'posted')
            ->whereNull('reversal_of_id')
            ->whereNull('party_id')
            ->whereIn('category', self::CATEGORIES)
            ->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate('movement_date', '>=', $date))
            ->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate('movement_date', '<=', $date))
            ->get(['category', 'movement_date', 'amount']);

        $money = fn (float $value): string => number_format($value, 4, '.', '');

        $byCategory = $rows->groupBy('category')->map(fn ($group, $category): array => [
            'category' => $category,
            'count' => $group->count(),
            'total' => $money((float) $group->sum(fn (CashMovement $row): float => (float) $row->amount)),
        ])->sortByDesc(fn (array $row): float => (float) $row['total'])->values();

        $byMonth = $rows->groupBy(fn (CashMovement $row): string => substr((string) $row->movement_date, 0, 7))
            ->map(fn ($group, $month): array => [
                'month' => $month,
                'count' => $group->count(),
                'total' => $money((float) $group->sum(fn (CashMovement $row): float => (float) $row->amount)),
                'categories' => $group->groupBy('category')->map(
                    fn ($inner): string => $money((float) $inner->sum(fn (CashMovement $row): float => (float) $row->amount)),
                )->all(),
            ])->sortKeysDesc()->values();

        return response()->json([
            'data' => [
                'count' => $rows->count(),
                'total' => $money((float) $rows->sum(fn (CashMovement $row): float => (float) $row->amount)),
                'by_category' => $byCategory,
                'by_month' => $byMonth,
            ],
        ]);
    }

    /**
     * Record several petty expenses for one day in a single request. Each entry becomes its own
     * cash payment so it can be searched, corrected and reported on individually.
     */
    public function store(
        Request $request,
        CashMovementService $service,
        ApprovalWorkflowService $approvals,
    ): JsonResponse {
        FinanceAuthorization::authorize($request->user(), 'finance.cash.pay');

        $data = $request->validate([
            'movement_date' => ['required', 'date_format:Y-m-d'],
            'movement_date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:movement_date'],
            'entries' => ['required', 'array', 'min:1', 'max:100'],
            'entries.*.category' => ['required', Rule::in(self::CATEGORIES)],
            'entries.*.amount' => ['required', 'numeric', 'gt:0', 'max:999999999999'],
            'entries.*.notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $currency = strtoupper((string) (app(TenantContext::class)->organization()->preferences['currency'] ?? 'ILS'));
        $userId = $request->user()->id;
        $dates = [];

        for (
            $day = Carbon::parse($data['movement_date']);
            $day->lte(Carbon::parse($data['movement_date_to'] ?? $data['movement_date']));
            $day = $day->copy()->addDay()
        ) {
            $dates[] = $day->toDateString();
        }

        if (count($dates) * count($data['entries']) > 500) {
            throw ValidationException::withMessages([
                'movement_date_to' => __('Too many items for one batch. Shorten the date range.'),
            ]);
        }

        $created = [];
        $pending = [];

        foreach ($dates as $date) {
            $compactDate = str_replace('-', '', $date);

            foreach ($data['entries'] as $entry) {
                $movement = DB::transaction(fn (): CashMovement => $service->createDraft([
                    'direction' => 'outgoing',
                    'party_id' => null,
                    'government_obligation_id' => null,
                    'department_id' => null,
                    'category' => $entry['category'],
                    'amount' => number_format((float) $entry['amount'], 4, '.', ''),
                    'currency' => $currency,
                    'movement_date' => $date,
                    'method' => 'cash',
                    'account_label' => null,
                    'branch_label' => null,
                    'cost_center' => null,
                    'reference' => 'PETTY-'.$compactDate.'-'.$entry['category'],
                    'check_number' => null,
                    'check_bank' => null,
                    'check_due_date' => null,
                    'check_status' => null,
                    'notes' => $entry['notes'] ?? null,
                    'allocations' => [],
                ], $userId));

                try {
                    $approvals->assertPaymentApproved($movement, $userId);
                    $service->post($movement, $userId);
                    $created[] = $movement->id;
                } catch (ValidationException) {
                    $pending[] = $movement->id;
                }
            }
        }

        return response()->json([
            'data' => [
                'posted' => count($created),
                'awaiting_approval' => count($pending),
            ],
        ], 201);
    }

    /**
     * Reverse posted petty expenses so they leave the log but keep the audit trail.
     */
    public function destroyMany(Request $request, CashMovementService $service): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.cash.correct');

        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:200'],
            'ids.*' => ['integer'],
        ]);

        $movements = $this->pettyMovements($data['ids']);
        $reason = __('Deleted from petty expenses');

        DB::transaction(function () use ($movements, $service, $reason, $request): void {
            foreach ($movements as $movement) {
                $service->reverse($movement, $reason, $request->user()->id);
            }
        });

        return response()->json(['data' => ['deleted' => $movements->count()]]);
    }

    /**
     * Move one posted petty expense to another date through a correction.
     */
    public function update(
        Request $request,
        string $movement,
        CashMovementService $service,
        ApprovalWorkflowService $approvals,
    ): JsonResponse {
        FinanceAuthorization::authorize($request->user(), 'finance.cash.correct');

        $data = $request->validate([
            'movement_date' => ['required', 'date_format:Y-m-d'],
        ]);

        $source = $this->pettyMovements([(int) $movement])->first();
        $userId = $request->user()->id;

        if ($source->movement_date?->format('Y-m-d') === $data['movement_date']) {
            return response()->json(['data' => ['id' => $source->id, 'awaiting_approval' => false]]);
        }

        $replacement = DB::transaction(function () use ($service, $source, $data, $userId): CashMovement {
            $draft = $service->startCorrection($source, __('Date changed from petty expenses'), $userId);
            $draft->forceFill([
                'movement_date' => $data['movement_date'],
                'reference' => 'PETTY-'.str_replace('-', '', $data['movement_date']).'-'.$draft->category,
            ])->save();

            return $draft;
        });

        try {
            $approvals->assertPaymentApproved($replacement, $userId);
            $service->post($replacement, $userId);
        } catch (ValidationException) {
            return response()->json(['data' => ['id' => $replacement->id, 'awaiting_approval' => true]]);
        }

        return response()->json(['data' => ['id' => $replacement->id, 'awaiting_approval' => false]]);
    }

    /**
     * @param  list<int>  $ids
     * @return Collection<int, CashMovement>
     */
    private function pettyMovements(array $ids): Collection
    {
        $movements = CashMovement::query()
            ->whereIn('id', $ids)
            ->where('direction', 'outgoing')
            ->where('status', 'posted')
            ->whereNull('party_id')
            ->whereNull('reversal_of_id')
            ->whereIn('category', self::CATEGORIES)
            ->get();

        if ($movements->count() !== count(array_unique($ids))) {
            throw ValidationException::withMessages([
                'ids' => __('Only posted petty expenses can be changed here.'),
            ]);
        }

        return $movements;
    }
}
