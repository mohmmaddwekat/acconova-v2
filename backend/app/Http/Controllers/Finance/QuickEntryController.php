<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\CashMovement;
use App\Models\FinancialDocument;
use App\Models\ProductionRun;
use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Services\Finance\QuickEntryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class QuickEntryController extends Controller
{
    public function store(Request $request, QuickEntryService $service): JsonResponse
    {
        // Each row type is authorized again inside the service.
        abort_unless($request->user() !== null, 403);

        $data = $request->validate([
            'rows' => ['required', 'array', 'min:1', 'max:100'],
            'rows.*.type' => ['required', Rule::in(['sale', 'purchase', 'misc', 'receipt', 'payment', 'petty', 'prod', 'staff', 'attendance'])],
            'rows.*.attendance_status' => ['nullable', Rule::in(['present', 'absent'])],
            'rows.*.category' => ['nullable', 'string', 'max:60'],
            'rows.*.amount' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'rows.*.notes' => ['nullable', 'string', 'max:1000'],
            'rows.*.product_id' => ['nullable', 'integer'],
            'rows.*.quantity' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'rows.*.staff_id' => ['nullable', 'integer'],
            'rows.*.staff_kind' => ['nullable', Rule::in(['payment', 'bonus', 'allowance', 'deduction', 'advance'])],
            'rows.*.warehouse_id' => ['nullable', 'integer'],
            'rows.*.date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'rows.*.reference' => ['nullable', 'string', 'max:96'],
            'rows.*.party_id' => ['nullable', 'integer'],
            'rows.*.lines' => ['nullable', 'array', 'max:250'],
            'rows.*.lines.*.product_id' => ['required', 'integer'],
            'rows.*.lines.*.quantity' => ['required', 'numeric', 'gt:0', 'max:999999999'],
            'rows.*.lines.*.unit_price' => ['required', 'numeric', 'min:0', 'max:999999999999'],
            'rows.*.discount_type' => ['nullable', Rule::in(['percent', 'fixed'])],
            'rows.*.discount_value' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'rows.*.payment' => ['nullable', 'array'],
            'rows.*.payment.amount' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'rows.*.payment.full' => ['nullable', 'boolean'],
            'rows.*.payment.method' => ['nullable', Rule::in(['cash', 'transfer', 'check'])],
            'rows.*.payment.endorsed_movement_id' => ['nullable', 'integer'],
            'rows.*.payment.check_number' => ['nullable', 'string', 'max:120'],
            'rows.*.payment.check_due_date' => ['nullable', 'date_format:Y-m-d'],
        ]);

        return response()->json([
            'data' => $service->process($data['rows'], $request->user()),
        ]);
    }

    /**
     * Where the user stopped entering paper records: for each entry type the last
     * date and reference, and how many records exist on each day.
     */
    public function progress(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
        ]);

        $from = $data['from'];
        $docs = fn (string $kind, bool $misc) => FinancialDocument::query()
            ->where('kind', $kind)
            ->where('is_misc_sale', $misc)
            ->whereIn('status', ['issued', 'partially_paid', 'paid', 'overpaid']);
        $cash = fn (string $direction, string $category) => CashMovement::query()
            ->where('status', 'posted')
            ->whereNull('reversal_of_id')
            ->where('direction', $direction)
            ->where('category', $category);

        $petty = CashMovement::query()
            ->where('status', 'posted')
            ->whereNull('reversal_of_id')
            ->where('direction', 'outgoing')
            ->whereNull('party_id')
            ->whereIn('category', PettyExpenseController::CATEGORIES);

        $sources = [
            'sale' => [$docs('sale_invoice', false), 'issue_date', 'number'],
            'purchase' => [$docs('purchase_invoice', false), 'issue_date', 'number'],
            'misc' => [$docs('sale_invoice', true), 'issue_date', 'number'],
            'receipt' => [$cash('incoming', 'customer_receipt'), 'movement_date', 'number'],
            'payment' => [$cash('outgoing', 'supplier_payment'), 'movement_date', 'number'],
            'petty' => [$petty, 'movement_date', 'number'],
            'prod' => [ProductionRun::query()->whereIn('status', ['posted', 'draft', 'partially_reversed']), 'occurred_on', 'run_number'],
            'staff' => [StaffEntry::query()->where('kind', '!=', 'terms'), 'occurred_on', 'kind'],
        ];

        $attendance = DB::table('staff_attendances')->whereIn('staff_member_id', StaffMember::query()->select('id'));

        $result = [];

        foreach ($sources as $type => [$query, $dateColumn, $refColumn]) {
            $days = (clone $query)
                ->whereDate($dateColumn, '>=', $from)
                ->selectRaw("DATE({$dateColumn}) as day, COUNT(*) as total")
                ->groupBy('day')
                ->pluck('total', 'day');

            $latest = (clone $query)->orderByDesc($dateColumn)->orderByDesc('id')->first();

            $result[$type] = [
                'last' => $latest ? substr((string) $latest->getRawOriginal($dateColumn), 0, 10) : null,
                'ref' => $latest ? (string) $latest->{$refColumn} : null,
                'days' => $days->map(fn ($count): int => (int) $count),
            ];
        }

        $result['attendance'] = [
            'last' => ($last = (clone $attendance)->max('occurred_on')) ? substr((string) $last, 0, 10) : null,
            'ref' => null,
            'days' => (clone $attendance)
                ->whereDate('occurred_on', '>=', $from)
                ->selectRaw('DATE(occurred_on) as day, COUNT(*) as total')
                ->groupBy('day')
                ->pluck('total', 'day')
                ->map(fn ($count): int => (int) $count),
        ];

        return response()->json(['data' => $result]);
    }
}
