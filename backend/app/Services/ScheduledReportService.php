<?php

namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class ScheduledReportService
{
    public function runDue(
        int $organizationId,
    ): void {
        DB::table('scheduled_reports')
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where('active', true)
            ->where(function ($query): void {
                $query
                    ->whereNull('next_run_at')
                    ->orWhere(
                        'next_run_at',
                        '<=',
                        now(),
                    );
            })
            ->orderBy('id')
            ->limit(100)
            ->get()
            ->each(
                fn ($schedule) => $this->runSchedule(
                    $schedule,
                ),
            );
    }

    public function runNow(
        object $schedule,
    ): int {
        return $this->runSchedule(
            $schedule,
        );
    }

    public function nextRunAt(
        object|array $schedule,
        ?CarbonImmutable $from = null,
    ): CarbonImmutable {
        $value = is_array($schedule)
            ? $schedule
            : (array) $schedule;

        $from ??= CarbonImmutable::now();
        $hour = max(
            0,
            min(
                23,
                (int) (
                    $value['run_hour']
                    ?? 8
                ),
            ),
        );

        $candidate = $from
            ->startOfDay()
            ->setHour($hour);

        return match (
            $value['cadence']
            ?? 'daily'
        ) {
            'weekly' => $this->weeklyNext(
                $candidate,
                $from,
                (int) (
                    $value['day_of_week']
                    ?? 1
                ),
            ),
            'monthly' => $this->monthlyNext(
                $candidate,
                $from,
                (int) (
                    $value['day_of_month']
                    ?? 1
                ),
            ),
            default => $candidate->lte($from)
                    ? $candidate->addDay()
                    : $candidate,
        };
    }

    private function runSchedule(
        object $schedule,
    ): int {
        $snapshot = $this->snapshot(
            (int) $schedule->organization_id,
            (string) $schedule->report_type,
        );

        $runId = (int) DB::table(
            'scheduled_report_runs',
        )->insertGetId([
            'organization_id' => $schedule->organization_id,
            'scheduled_report_id' => $schedule->id,
            'report_type' => $schedule->report_type,
            'snapshot' => json_encode(
                $snapshot,
                JSON_THROW_ON_ERROR,
            ),
            'generated_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->notify(
            $schedule,
            $runId,
        );

        DB::table('scheduled_reports')
            ->where('id', $schedule->id)
            ->update([
                'last_run_at' => now(),
                'next_run_at' => $this->nextRunAt(
                    $schedule,
                    CarbonImmutable::now()
                        ->addSecond(),
                ),
                'updated_at' => now(),
            ]);

        return $runId;
    }

    /** @return array<string, mixed> */
    private function snapshot(
        int $organizationId,
        string $reportType,
    ): array {
        return match ($reportType) {
            'sales_summary' => $this->salesSummary(
                $organizationId,
            ),
            'ar_aging' => $this->aging(
                $organizationId,
                'sale_invoice',
            ),
            'ap_aging' => $this->aging(
                $organizationId,
                'purchase_invoice',
            ),
            'collections' => $this->collections(
                $organizationId,
            ),
            'budget_vs_actual' => $this->budgetVsActual(
                $organizationId,
            ),
            default => [
                'generated_at' => now()->toIso8601String(),
                'rows' => [],
            ],
        };
    }

    /** @return array<string, mixed> */
    private function salesSummary(
        int $organizationId,
    ): array {
        $start =
            CarbonImmutable::today()
                ->startOfMonth();
        $end =
            CarbonImmutable::today()
                ->endOfMonth();

        $rows = DB::table(
            'financial_documents',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'kind',
                'sale_invoice',
            )
            ->whereIn(
                'status',
                [
                    'issued',
                    'partially_paid',
                    'paid',
                    'overpaid',
                ],
            )
            ->whereBetween(
                'issue_date',
                [
                    $start->toDateString(),
                    $end->toDateString(),
                ],
            )
            ->get([
                'currency',
                'total',
                'balance_due',
            ])
            ->groupBy('currency')
            ->map(
                function (
                    $currencyRows,
                    $currency,
                ): array {
                    $total =
                        (float) $currencyRows
                            ->sum('total');
                    $outstanding =
                        (float) $currencyRows
                            ->sum('balance_due');

                    return [
                        'currency' => $currency,
                        'invoice_count' => $currencyRows
                            ->count(),
                        'sales_total' => number_format(
                            $total,
                            4,
                            '.',
                            '',
                        ),
                        'outstanding' => number_format(
                            $outstanding,
                            4,
                            '.',
                            '',
                        ),
                        'collected' => number_format(
                            max(
                                $total
                                - $outstanding,
                                0,
                            ),
                            4,
                            '.',
                            '',
                        ),
                    ];
                },
            )
            ->values()
            ->all();

        return [
            'title' => 'Sales summary',
            'period' => [
                'from' => $start->toDateString(),
                'to' => $end->toDateString(),
            ],
            'generated_at' => now()->toIso8601String(),
            'rows' => $rows,
        ];
    }

    /** @return array<string, mixed> */
    private function aging(
        int $organizationId,
        string $kind,
    ): array {
        $rows = DB::table(
            'financial_documents',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where('kind', $kind)
            ->whereIn(
                'status',
                [
                    'issued',
                    'partially_paid',
                ],
            )
            ->where(
                'balance_due',
                '>',
                0,
            )
            ->get([
                'currency',
                'due_date',
                'balance_due',
            ]);

        $summary = $rows
            ->groupBy('currency')
            ->map(
                function (
                    $currencyRows,
                    $currency,
                ): array {
                    $buckets = [
                        'current' => 0.0,
                        '0_30' => 0.0,
                        '31_60' => 0.0,
                        '61_90' => 0.0,
                        '90_plus' => 0.0,
                    ];

                    foreach (
                        $currencyRows as $row
                    ) {
                        $days = $row->due_date
                            ? CarbonImmutable::parse(
                                $row->due_date,
                            )->diffInDays(
                                CarbonImmutable::today(),
                                false,
                            )
                            : 0;

                        $bucket = match (true) {
                            $days <= 0 => 'current',
                            $days <= 30 => '0_30',
                            $days <= 60 => '31_60',
                            $days <= 90 => '61_90',
                            default => '90_plus',
                        };

                        $buckets[$bucket] +=
                            (float) $row->balance_due;
                    }

                    return [
                        'currency' => $currency,
                        ...collect(
                            $buckets,
                        )->map(
                            fn ($value): string => number_format(
                                $value,
                                4,
                                '.',
                                '',
                            ),
                        )->all(),
                    ];
                },
            )
            ->values()
            ->all();

        return [
            'title' => $kind === 'sale_invoice'
                    ? 'A/R aging'
                    : 'A/P aging',
            'generated_at' => now()->toIso8601String(),
            'rows' => $summary,
        ];
    }

    /** @return array<string, mixed> */
    private function collections(
        int $organizationId,
    ): array {
        $rows = DB::table(
            'financial_documents',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'kind',
                'sale_invoice',
            )
            ->whereIn(
                'status',
                [
                    'issued',
                    'partially_paid',
                ],
            )
            ->where(
                'balance_due',
                '>',
                0,
            )
            ->whereDate(
                'due_date',
                '<',
                today(),
            )
            ->get([
                'currency',
                'balance_due',
            ])
            ->groupBy('currency')
            ->map(
                fn (
                    $currencyRows,
                    $currency,
                ): array => [
                    'currency' => $currency,
                    'overdue_invoices' => $currencyRows
                        ->count(),
                    'overdue_amount' => number_format(
                        (float) $currencyRows
                            ->sum(
                                'balance_due',
                            ),
                        4,
                        '.',
                        '',
                    ),
                ],
            )
            ->values()
            ->all();

        return [
            'title' => 'Collections',
            'generated_at' => now()->toIso8601String(),
            'rows' => $rows,
        ];
    }

    /** @return array<string, mixed> */
    private function budgetVsActual(
        int $organizationId,
    ): array {
        $month =
            CarbonImmutable::today()
                ->startOfMonth();

        $rows = DB::table(
            'department_budgets as budget',
        )
            ->join(
                'departments as department',
                'department.id',
                '=',
                'budget.department_id',
            )
            ->where(
                'budget.organization_id',
                $organizationId,
            )
            ->whereDate(
                'budget.month',
                $month->toDateString(),
            )
            ->get([
                'budget.department_id',
                'department.name as department',
                'budget.amount',
                'budget.currency',
            ])
            ->map(
                function ($row) use (
                    $organizationId,
                    $month,
                ): array {
                    $actual =
                        (float) DB::table(
                            'cash_movements',
                        )
                            ->where(
                                'organization_id',
                                $organizationId,
                            )
                            ->where(
                                'department_id',
                                $row->department_id,
                            )
                            ->where(
                                'currency',
                                $row->currency,
                            )
                            ->where(
                                'direction',
                                'outgoing',
                            )
                            ->where(
                                'status',
                                'posted',
                            )
                            ->whereYear(
                                'movement_date',
                                $month->year,
                            )
                            ->whereMonth(
                                'movement_date',
                                $month->month,
                            )
                            ->sum('amount');

                    return [
                        'department' => $row->department,
                        'currency' => $row->currency,
                        'budget' => (string) $row->amount,
                        'actual' => number_format(
                            $actual,
                            4,
                            '.',
                            '',
                        ),
                        'variance' => number_format(
                            (float) $row->amount
                            - $actual,
                            4,
                            '.',
                            '',
                        ),
                    ];
                },
            )
            ->all();

        return [
            'title' => 'Budget vs actual',
            'period' => $month->format('Y-m'),
            'generated_at' => now()->toIso8601String(),
            'rows' => $rows,
        ];
    }

    private function notify(
        object $schedule,
        int $runId,
    ): void {
        $recipientIds =
            $schedule->recipient_user_ids
                ? json_decode(
                    $schedule->recipient_user_ids,
                    true,
                )
                : [];

        if (
            ! is_array($recipientIds)
            || $recipientIds === []
        ) {
            $recipientIds = DB::table(
                'memberships',
            )
                ->where(
                    'organization_id',
                    $schedule->organization_id,
                )
                ->whereIn(
                    'role',
                    [
                        'owner',
                        'admin',
                        'manager',
                    ],
                )
                ->pluck('user_id')
                ->all();
        }

        foreach (
            array_unique(
                array_map(
                    'intval',
                    $recipientIds,
                ),
            ) as $userId
        ) {
            DB::table(
                'workspace_notifications',
            )->insertOrIgnore([
                'organization_id' => $schedule->organization_id,
                'user_id' => $userId,
                'event_key' => 'scheduled-report:'
                    .$schedule->id
                    .':'
                    .$runId
                    .':'
                    .$userId,
                'kind' => 'scheduled_report_ready',
                'category' => 'activity',
                'data' => json_encode([
                    'name' => 'Scheduled report ready',
                    'detail' => $schedule->name,
                ], JSON_THROW_ON_ERROR),
                'url' => '/app/reports/scheduled?run='
                    .$runId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function weeklyNext(
        CarbonImmutable $candidate,
        CarbonImmutable $from,
        int $dayOfWeek,
    ): CarbonImmutable {
        $dayOfWeek = max(
            0,
            min(
                6,
                $dayOfWeek,
            ),
        );

        $candidate =
            $candidate->startOfWeek()
                ->addDays(
                    $dayOfWeek,
                );

        return $candidate->lte($from)
            ? $candidate->addWeek()
            : $candidate;
    }

    private function monthlyNext(
        CarbonImmutable $candidate,
        CarbonImmutable $from,
        int $dayOfMonth,
    ): CarbonImmutable {
        $dayOfMonth = max(
            1,
            min(
                28,
                $dayOfMonth,
            ),
        );

        $candidate =
            $candidate->startOfMonth()
                ->addDays(
                    $dayOfMonth - 1,
                );

        return $candidate->lte($from)
            ? $candidate
                ->addMonth()
                ->startOfMonth()
                ->addDays(
                    $dayOfMonth - 1,
                )
            : $candidate;
    }
}
