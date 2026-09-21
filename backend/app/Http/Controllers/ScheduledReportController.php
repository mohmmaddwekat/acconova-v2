<?php

namespace App\Http\Controllers;

use App\Enums\OrganizationRole;
use App\Services\FinanceAuthorization;
use App\Services\ScheduledReportService;
use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ScheduledReportController extends Controller
{
    public function index(
        Request $request,
    ): JsonResponse {
        $this->authorizeView(
            $request,
        );

        $organizationId =
            app(TenantContext::class)
                ->id();

        $schedules = DB::table(
            'scheduled_reports',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->latest('id')
            ->get()
            ->map(fn ($row): array => [
                ...((array) $row),
                'recipient_user_ids' =>
                    $row->recipient_user_ids
                        ? json_decode(
                            $row->recipient_user_ids,
                            true,
                        )
                        : [],
            ]);

        $runs = DB::table(
            'scheduled_report_runs as run',
        )
            ->leftJoin(
                'scheduled_reports as schedule',
                'schedule.id',
                '=',
                'run.scheduled_report_id',
            )
            ->where(
                'run.organization_id',
                $organizationId,
            )
            ->latest(
                'run.generated_at',
            )
            ->limit(100)
            ->get([
                'run.id',
                'run.scheduled_report_id',
                'run.report_type',
                'run.snapshot',
                'run.generated_at',
                'schedule.name as schedule_name',
            ])
            ->map(fn ($row): array => [
                ...((array) $row),
                'snapshot' =>
                    $row->snapshot
                        ? json_decode(
                            $row->snapshot,
                            true,
                        )
                        : [],
            ]);

        $members = DB::table(
            'memberships as membership',
        )
            ->join(
                'users as user',
                'user.id',
                '=',
                'membership.user_id',
            )
            ->where(
                'membership.organization_id',
                $organizationId,
            )
            ->orderBy('user.name')
            ->get([
                'user.id',
                'user.name',
            ]);

        return response()->json([
            'schedules' =>
                $schedules,
            'runs' =>
                $runs,
            'members' =>
                $members,
            'can_manage' =>
                $this->canManage(),
        ]);
    }

    public function store(
        Request $request,
        ScheduledReportService $reports,
    ): JsonResponse {
        $this->authorizeManage();

        $organizationId =
            app(TenantContext::class)
                ->id();
        $data = $this->validated(
            $request,
        );

        $id = DB::table(
            'scheduled_reports',
        )->insertGetId([
            'organization_id' =>
                $organizationId,
            ...$data,
            'recipient_user_ids' =>
                json_encode(
                    $data['recipient_user_ids']
                    ?? [],
                    JSON_THROW_ON_ERROR,
                ),
            'active' => true,
            'last_run_at' => null,
            'next_run_at' =>
                $reports->nextRunAt(
                    $data,
                ),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'data' =>
                DB::table(
                    'scheduled_reports',
                )
                    ->where(
                        'organization_id',
                        $organizationId,
                    )
                    ->where('id', $id)
                    ->first(),
        ], 201);
    }

    public function update(
        Request $request,
        string $schedule,
        ScheduledReportService $reports,
    ): JsonResponse {
        $this->authorizeManage();

        $organizationId =
            app(TenantContext::class)
                ->id();

        $current = DB::table(
            'scheduled_reports',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'id',
                (int) $schedule,
            )
            ->first();

        abort_unless(
            $current,
            404,
        );

        $data = $request->validate([
            'active' => [
                'nullable',
                'boolean',
            ],
            'run_hour' => [
                'nullable',
                'integer',
                'between:0,23',
            ],
            'day_of_week' => [
                'nullable',
                'integer',
                'between:0,6',
            ],
            'day_of_month' => [
                'nullable',
                'integer',
                'between:1,28',
            ],
        ]);

        $merged = [
            ...((array) $current),
            ...$data,
        ];

        DB::table(
            'scheduled_reports',
        )
            ->where(
                'id',
                $current->id,
            )
            ->update([
                ...$data,
                'next_run_at' =>
                    ($data['active']
                    ?? $current->active)
                        ? $reports->nextRunAt(
                            $merged,
                        )
                        : null,
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' =>
                DB::table(
                    'scheduled_reports',
                )
                    ->where(
                        'id',
                        $current->id,
                    )
                    ->first(),
        ]);
    }

    public function run(
        Request $request,
        string $schedule,
        ScheduledReportService $reports,
    ): JsonResponse {
        $this->authorizeManage();

        $organizationId =
            app(TenantContext::class)
                ->id();

        $record = DB::table(
            'scheduled_reports',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'id',
                (int) $schedule,
            )
            ->first();

        abort_unless(
            $record,
            404,
        );

        $runId =
            $reports->runNow(
                $record,
            );

        return response()->json([
            'data' => [
                'run_id' => $runId,
            ],
        ], 201);
    }

    /** @return array<string, mixed> */
    private function validated(
        Request $request,
    ): array {
        $data = $request->validate([
            'name' => [
                'required',
                'string',
                'max:160',
            ],
            'report_type' => [
                'required',
                Rule::in([
                    'sales_summary',
                    'ar_aging',
                    'ap_aging',
                    'collections',
                    'budget_vs_actual',
                ]),
            ],
            'cadence' => [
                'required',
                Rule::in([
                    'daily',
                    'weekly',
                    'monthly',
                ]),
            ],
            'run_hour' => [
                'required',
                'integer',
                'between:0,23',
            ],
            'day_of_week' => [
                'nullable',
                'integer',
                'between:0,6',
                'required_if:cadence,weekly',
            ],
            'day_of_month' => [
                'nullable',
                'integer',
                'between:1,28',
                'required_if:cadence,monthly',
            ],
            'recipient_user_ids' => [
                'nullable',
                'array',
                'max:100',
            ],
            'recipient_user_ids.*' => [
                'integer',
            ],
        ]);

        if (
            ! empty(
                $data['recipient_user_ids']
            )
        ) {
            $organizationId =
                app(TenantContext::class)
                    ->id();

            $valid = DB::table(
                'memberships',
            )
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->whereIn(
                    'user_id',
                    $data[
                        'recipient_user_ids'
                    ],
                )
                ->pluck(
                    'user_id',
                )
                ->map(
                    fn ($id): int =>
                        (int) $id,
                )
                ->sort()
                ->values()
                ->all();

            $requested = collect(
                $data[
                    'recipient_user_ids'
                ],
            )
                ->map(
                    fn ($id): int =>
                        (int) $id,
                )
                ->unique()
                ->sort()
                ->values()
                ->all();

            abort_unless(
                $valid === $requested,
                422,
            );
        }

        return [
            ...$data,
            'day_of_week' =>
                $data['cadence']
                === 'weekly'
                    ? $data[
                        'day_of_week'
                    ]
                    : null,
            'day_of_month' =>
                $data['cadence']
                === 'monthly'
                    ? $data[
                        'day_of_month'
                    ]
                    : null,
        ];
    }

    private function authorizeView(
        Request $request,
    ): void {
        $canReadFinance =
            FinanceAuthorization::allows(
                $request->user(),
                'finance.sales.view',
            )
            || FinanceAuthorization::allows(
                $request->user(),
                'finance.purchases.view',
            )
            || FinanceAuthorization::allows(
                $request->user(),
                'finance.cash.view',
            );

        abort_unless(
            $canReadFinance
            && WorkspaceFeaturePermissions::allows(
                $request->user(),
                'reports.scheduled.view',
            ),
            403,
        );
    }

    private function authorizeManage(): void
    {
        abort_unless(
            $this->canManage(),
            403,
        );
    }

    private function canManage(): bool
    {
        $user = request()->user();

        return $user
            && (
                WorkspaceFeaturePermissions::allows(
                    $user,
                    'reports.scheduled.create',
                )
                || WorkspaceFeaturePermissions::allows(
                    $user,
                    'reports.scheduled.update',
                )
                || WorkspaceFeaturePermissions::allows(
                    $user,
                    'reports.scheduled.run',
                )
            );
    }
}
