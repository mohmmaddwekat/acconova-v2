<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Support\InventoryQuantity as Decimal;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Ramsey\Uuid\Uuid;

class StaffBulkTransactionController extends Controller
{
    private const KINDS = ['payment', 'bonus', 'allowance', 'deduction', 'advance'];

    /**
     * Return a paginated roster of the employees the user may pay, with each
     * employee's current balance so a payment can be prefilled quickly.
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'department_id' => ['nullable', 'integer'],
            'only_due' => ['nullable', 'boolean'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', Rule::in([20, 50, 100])],
        ]);

        $query = $this->payableScope();

        if (! empty($filters['search'])) {
            $search = '%'.trim((string) $filters['search']).'%';
            $query->where(function (Builder $builder) use ($search): void {
                $builder->where('name', 'like', $search)
                    ->orWhere('job_title', 'like', $search);
            });
        }

        if (! empty($filters['department_id'])) {
            $query->where('department_id', (int) $filters['department_id']);
        }

        if (! empty($filters['only_due'])) {
            $query->whereRaw(
                '(select coalesce(sum(amount), 0) from staff_entries where staff_entries.staff_member_id = staff_members.id and kind != ? and deleted_at is null) > 0',
                ['terms'],
            );
        }

        $query->withSum(
            [
                'entries as balance' => fn ($entries) => $entries->where('kind', '!=', 'terms'),
            ],
            'amount',
        );

        $paginator = $query
            ->orderBy('name')
            ->orderBy('id')
            ->paginate(
                (int) ($filters['per_page'] ?? 50),
                ['id', 'name', 'job_title', 'department_id', 'basis', 'currency', 'active'],
            );

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn (StaffMember $member): array => [
                    'id' => (int) $member->id,
                    'name' => (string) $member->name,
                    'job_title' => $member->job_title,
                    'basis' => (string) $member->basis,
                    'currency' => (string) $member->currency,
                    'active' => (bool) $member->active,
                    'balance' => Decimal::fromUnits(Decimal::toUnits((string) ($member->balance ?? '0'))),
                ])
                ->values(),
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'from' => $paginator->firstItem(),
                'to' => $paginator->lastItem(),
            ],
            'departments' => DB::table('departments')
                ->where('organization_id', app(TenantContext::class)->id())
                ->orderBy('name')
                ->get(['id', 'name']),
        ]);
    }

    /**
     * Record one transaction kind for many employees at once. Every row keeps
     * its own amount; re-sending the same batch never duplicates an entry.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'batch_id' => ['required', 'uuid'],
            'kind' => ['required', Rule::in(self::KINDS)],
            'occurred_on' => ['required', 'date_format:Y-m-d', 'before_or_equal:tomorrow'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'rows' => ['required', 'array', 'min:1', 'max:100'],
            'rows.*.staff_id' => ['required', 'integer', 'distinct'],
            'rows.*.amount' => ['required', 'numeric', 'gt:0', 'max:999999999', 'regex:/^\d+(\.\d{1,4})?$/'],
        ]);

        $rows = collect($data['rows']);
        $members = $this->payableScope()
            ->whereIn('id', $rows->pluck('staff_id')->map(fn ($id): int => (int) $id))
            ->get()
            ->keyBy('id');

        $created = 0;
        $skipped = [];
        $negative = in_array($data['kind'], ['deduction', 'payment', 'advance'], true);

        DB::transaction(function () use ($request, $data, $rows, $members, $negative, &$created, &$skipped): void {
            foreach ($rows as $row) {
                $member = $members->get((int) $row['staff_id']);

                if (! $member || ! StaffController::canPay($member)) {
                    $skipped[] = [
                        'id' => (int) $row['staff_id'],
                        'name' => $member?->name,
                        'reason' => 'not_allowed',
                    ];

                    continue;
                }

                $requestId = Uuid::uuid5($data['batch_id'], 'staff-'.$member->id)->toString();

                if (StaffEntry::withTrashed()->where('request_id', $requestId)->exists()) {
                    $skipped[] = [
                        'id' => (int) $member->id,
                        'name' => (string) $member->name,
                        'reason' => 'duplicate',
                    ];

                    continue;
                }

                $units = Decimal::toUnits((string) $row['amount']);

                StaffEntry::create([
                    'staff_member_id' => $member->id,
                    'created_by' => (int) $request->user()->id,
                    'request_id' => $requestId,
                    'kind' => $data['kind'],
                    'occurred_on' => $data['occurred_on'],
                    'amount' => Decimal::fromUnits($negative ? -$units : $units),
                    'quantity' => null,
                    'rate' => null,
                    'notes' => $data['notes'] ?? null,
                    'terms' => [
                        'basis' => $member->basis,
                        'unit' => $member->unit,
                        'currency' => $member->currency,
                        'monthly_allowance' => $member->monthly_allowance,
                        'bulk' => true,
                    ],
                ]);

                $created++;
            }
        });

        return response()->json([
            'created' => $created,
            'skipped' => $skipped,
        ], 201);
    }

    /**
     * Employees the current user is allowed to record payroll transactions for.
     *
     * @return Builder<StaffMember>
     */
    private function payableScope(): Builder
    {
        $all = StaffController::allowed('staff.pay');

        abort_unless($all || StaffController::allowed('staff.team_pay'), 403);

        $query = StaffMember::query();

        if (! $all) {
            $query->whereIn('department_id', StaffController::managedDepartmentIds());
        }

        return $query;
    }
}
