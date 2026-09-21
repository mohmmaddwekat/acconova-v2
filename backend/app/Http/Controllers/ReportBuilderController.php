<?php

namespace App\Http\Controllers;

use App\Models\Party;
use App\Models\Product;
use App\Services\FinanceAuthorization;
use App\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ReportBuilderController extends Controller
{
    /**
     * Return available report datasets and reports visible to the current user.
     */
    public function index(
        Request $request,
    ): JsonResponse {
        $organizationId =
            app(TenantContext::class)
                ->id();

        $available = collect(
            $this->datasets(),
        )
            ->filter(
                fn (
                    array $dataset,
                    string $key,
                ): bool =>
                    $this->canUseDataset(
                        $request,
                        $key,
                    ),
            )
            ->map(
                fn (
                    array $dataset,
                    string $key,
                ): array => [
                    'key' => $key,
                    'label' =>
                        $dataset['label'],
                    'columns' =>
                        collect(
                            $dataset['columns'],
                        )
                            ->map(
                                fn (
                                    array $column,
                                    string $columnKey,
                                ): array => [
                                    'key' =>
                                        $columnKey,
                                    'label' =>
                                        $column['label'],
                                    'type' =>
                                        $column['type'],
                                ],
                            )
                            ->values(),
                ],
            )
            ->values();

        $reports = DB::table(
            'custom_reports',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                function (
                    $query,
                ) use ($request): void {
                    $query
                        ->where(
                            'created_by',
                            $request
                                ->user()
                                ->id,
                        )
                        ->orWhere(
                            'shared',
                            true,
                        );
                },
            )
            ->latest('id')
            ->get()
            ->map(
                fn ($row): array =>
                    $this->presentReport(
                        $row,
                        $request->user()->id,
                    ),
            );

        return response()->json([
            'datasets' =>
                $available,
            'reports' =>
                $reports,
        ]);
    }

    /**
     * Save a reusable report definition.
     */
    public function store(
        Request $request,
    ): JsonResponse {
        $data =
            $this->validatedReport(
                $request,
            );

        $this->assertDatasetAccess(
            $request,
            $data['dataset'],
        );

        $organizationId =
            app(TenantContext::class)
                ->id();

        $id = DB::table(
            'custom_reports',
        )->insertGetId([
            'organization_id' =>
                $organizationId,
            'created_by' =>
                $request->user()->id,
            'name' =>
                $data['name'],
            'dataset' =>
                $data['dataset'],
            'columns' =>
                json_encode(
                    $data['columns'],
                    JSON_THROW_ON_ERROR,
                ),
            'filters' =>
                json_encode(
                    $data['filters']
                    ?? [],
                    JSON_THROW_ON_ERROR,
                ),
            'group_by' =>
                $data['group_by']
                ?? null,
            'sort_by' =>
                $data['sort_by']
                ?? null,
            'sort_direction' =>
                $data['sort_direction']
                ?? 'asc',
            'shared' =>
                (bool) (
                    $data['shared']
                    ?? false
                ),
            'created_at' =>
                now(),
            'updated_at' =>
                now(),
        ]);

        $this->saveVersion(
            $id,
            $request->user()->id,
        );

        return response()->json([
            'data' =>
                $this->presentReport(
                    DB::table(
                        'custom_reports',
                    )
                        ->where(
                            'organization_id',
                            $organizationId,
                        )
                        ->where(
                            'id',
                            $id,
                        )
                        ->first(),
                ),
        ], 201);
    }

    /**
     * Update a report owned by the current user.
     */
    public function update(
        Request $request,
        string $report,
    ): JsonResponse {
        $organizationId =
            app(TenantContext::class)
                ->id();

        $current = DB::table(
            'custom_reports',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'created_by',
                $request->user()->id,
            )
            ->where(
                'id',
                (int) $report,
            )
            ->first();

        abort_unless(
            $current,
            404,
        );

        $data =
            $this->validatedReport(
                $request,
            );

        $this->assertDatasetAccess(
            $request,
            $data['dataset'],
        );

        DB::table(
            'custom_reports',
        )
            ->where(
                'id',
                $current->id,
            )
            ->update([
                'name' =>
                    $data['name'],
                'dataset' =>
                    $data['dataset'],
                'columns' =>
                    json_encode(
                        $data['columns'],
                        JSON_THROW_ON_ERROR,
                    ),
                'filters' =>
                    json_encode(
                        $data['filters']
                        ?? [],
                        JSON_THROW_ON_ERROR,
                    ),
                'group_by' =>
                    $data['group_by']
                    ?? null,
                'sort_by' =>
                    $data['sort_by']
                    ?? null,
                'sort_direction' =>
                    $data['sort_direction']
                    ?? 'asc',
                'shared' =>
                    (bool) (
                        $data['shared']
                        ?? false
                    ),
                'updated_at' =>
                    now(),
            ]);

        $this->saveVersion(
            (int) $current->id,
            $request->user()->id,
        );

        return response()->json([
            'data' =>
                $this->presentReport(
                    DB::table(
                        'custom_reports',
                    )
                        ->where(
                            'id',
                            $current->id,
                        )
                        ->first(),
                ),
        ]);
    }

    /**
     * Delete a report owned by the current user.
     */
    public function destroy(
        Request $request,
        string $report,
    ): JsonResponse {
        $organizationId =
            app(TenantContext::class)
                ->id();

        $deleted = DB::table(
            'custom_reports',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'created_by',
                $request->user()->id,
            )
            ->where(
                'id',
                (int) $report,
            )
            ->delete();

        abort_unless(
            $deleted > 0,
            404,
        );

        return response()->json([
            'ok' => true,
        ]);
    }

    /**
     * Execute a saved or unsaved report definition using whitelisted fields.
     */
    public function run(
        Request $request,
    ): JsonResponse {
        $data =
            $this->validatedExecution(
                $request,
            );

        $this->assertDatasetAccess(
            $request,
            $data['dataset'],
        );

        $definition =
            $this->datasets()[
                $data['dataset']
            ];

        $query =
            $this->baseQuery(
                $data['dataset'],
                app(
                    TenantContext::class,
                )->id(),
            );

        foreach (
            $data['filters']
            ?? []
            as $filter
        ) {
            $this->applyFilter(
                $query,
                $definition,
                $filter,
            );
        }

        $columns =
            collect(
                $data['columns'],
            )
                ->unique()
                ->values()
                ->all();

        $selects = collect(
            $columns,
        )
            ->map(
                fn (
                    string $column,
                ) => DB::raw(
                    $definition[
                        'columns'
                    ][$column][
                        'expression'
                    ]
                    .' as '
                    .$column,
                ),
            )
            ->all();

        $query->select(
            $selects,
        );

        if (
            ! empty(
                $data['sort_by']
            )
        ) {
            $sortColumn =
                $data['sort_by'];

            $query->orderByRaw(
                $definition[
                    'columns'
                ][$sortColumn][
                    'expression'
                ]
                .' '
                .strtoupper(
                    $data[
                        'sort_direction'
                    ]
                    ?? 'asc',
                ),
            );
        }

        $rows =
            $query
                ->limit(1000)
                ->get()
                ->map(
                    fn ($row): array =>
                        (array) $row,
                )
                ->values();

        $groupBy =
            $data['group_by']
            ?? null;

        $numericColumns =
            collect(
                $columns,
            )
                ->filter(
                    fn (
                        string $column,
                    ): bool =>
                        $definition[
                            'columns'
                        ][$column][
                            'type'
                        ]
                        === 'number',
                )
                ->values();

        $groups =
            $groupBy
                ? $rows
                    ->groupBy(
                        fn (
                            array $row,
                        ) =>
                            (string) (
                                $row[
                                    $groupBy
                                ]
                                ?? '—'
                            ),
                    )
                    ->map(
                        function (
                            $groupRows,
                            $key,
                        ) use (
                            $numericColumns,
                        ): array {
                            $totals = [];

                            foreach (
                                $numericColumns
                                as $column
                            ) {
                                $totals[
                                    $column
                                ] =
                                    number_format(
                                        (float) collect(
                                            $groupRows,
                                        )->sum(
                                            fn (
                                                array $row,
                                            ): float =>
                                                (float) (
                                                    $row[
                                                        $column
                                                    ]
                                                    ?? 0
                                                ),
                                        ),
                                        4,
                                        '.',
                                        '',
                                    );
                            }

                            return [
                                'key' =>
                                    $key,
                                'count' =>
                                    count(
                                        $groupRows,
                                    ),
                                'totals' =>
                                    $totals,
                                'rows' =>
                                    array_values(
                                        $groupRows
                                            ->all(),
                                    ),
                            ];
                        },
                    )
                    ->values()
                : collect();

        return response()->json([
            'data' => [
                'columns' =>
                    collect(
                        $columns,
                    )
                        ->map(
                            fn (
                                string $column,
                            ): array => [
                                'key' =>
                                    $column,
                                'label' =>
                                    $definition[
                                        'columns'
                                    ][$column][
                                        'label'
                                    ],
                                'type' =>
                                    $definition[
                                        'columns'
                                    ][$column][
                                        'type'
                                    ],
                            ],
                        )
                        ->values(),
                'rows' =>
                    $rows,
                'groups' =>
                    $groups,
                'group_by' =>
                    $groupBy,
                'limited' =>
                    $rows->count()
                    >= 1000,
            ],
        ]);
    }

    public function versions(
        Request $request,
        string $report,
    ): JsonResponse {
        $organizationId = app(TenantContext::class)->id();

        $exists = DB::table('custom_reports')
            ->where('organization_id', $organizationId)
            ->where('id', (int) $report)
            ->where(function ($query) use ($request): void {
                $query->where('created_by', $request->user()->id)
                    ->orWhere('shared', true);
            })
            ->exists();

        abort_unless($exists, 404);

        $versions = DB::table('report_versions')
            ->where('organization_id', $organizationId)
            ->where('report_id', (int) $report)
            ->latest('version')
            ->get()
            ->map(function ($row): array {
                return [
                    ...((array) $row),
                    'definition' => json_decode($row->definition, true) ?: [],
                ];
            });

        return response()->json(['data' => $versions]);
    }

    public function restoreVersion(
        Request $request,
        string $report,
        string $version,
    ): JsonResponse {
        $organizationId = app(TenantContext::class)->id();

        $current = DB::table('custom_reports')
            ->where('organization_id', $organizationId)
            ->where('created_by', $request->user()->id)
            ->where('id', (int) $report)
            ->first();

        abort_unless($current, 404);

        $row = DB::table('report_versions')
            ->where('organization_id', $organizationId)
            ->where('report_id', (int) $report)
            ->where('version', (int) $version)
            ->first();

        abort_unless($row, 404);
        $definition = json_decode($row->definition, true) ?: [];

        DB::table('custom_reports')
            ->where('id', (int) $report)
            ->update([
                'name' => $definition['name'] ?? $current->name,
                'dataset' => $definition['dataset'] ?? $current->dataset,
                'columns' => json_encode($definition['columns'] ?? [], JSON_THROW_ON_ERROR),
                'filters' => json_encode($definition['filters'] ?? [], JSON_THROW_ON_ERROR),
                'group_by' => $definition['group_by'] ?? null,
                'sort_by' => $definition['sort_by'] ?? null,
                'sort_direction' => $definition['sort_direction'] ?? 'asc',
                'shared' => (bool) ($definition['shared'] ?? false),
                'configuration' => array_key_exists('configuration', $definition)
                    ? json_encode($definition['configuration'], JSON_THROW_ON_ERROR)
                    : $current->configuration,
                'visualization' => array_key_exists('visualization', $definition)
                    ? json_encode($definition['visualization'], JSON_THROW_ON_ERROR)
                    : $current->visualization,
                'updated_at' => now(),
            ]);

        $this->saveVersion((int) $report, $request->user()->id);

        return response()->json([
            'data' => $this->presentReport(
                DB::table('custom_reports')->where('id', (int) $report)->first(),
                $request->user()->id,
            ),
        ]);
    }

    private function saveVersion(
        int $reportId,
        int $userId,
    ): void {
        if (! \Illuminate\Support\Facades\Schema::hasTable('report_versions')) {
            return;
        }

        $organizationId = app(TenantContext::class)->id();
        $report = DB::table('custom_reports')
            ->where('organization_id', $organizationId)
            ->where('id', $reportId)
            ->first();

        if (! $report) {
            return;
        }

        $version = ((int) DB::table('report_versions')
            ->where('report_id', $reportId)
            ->max('version')) + 1;

        DB::table('report_versions')->insert([
            'organization_id' => $organizationId,
            'report_id' => $reportId,
            'created_by' => $userId,
            'version' => $version,
            'definition' => json_encode($this->presentReport($report), JSON_THROW_ON_ERROR),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validatedReport(
        Request $request,
    ): array {
        $data =
            $this->validatedExecution(
                $request,
            );

        $name = $request->validate([
            'name' => [
                'required',
                'string',
                'max:160',
            ],
            'shared' => [
                'nullable',
                'boolean',
            ],
        ]);

        return [
            ...$data,
            ...$name,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function validatedExecution(
        Request $request,
    ): array {
        $data = $request->validate([
            'dataset' => [
                'required',
                Rule::in(
                    array_keys(
                        $this->datasets(),
                    ),
                ),
            ],
            'columns' => [
                'required',
                'array',
                'min:1',
                'max:20',
            ],
            'columns.*' => [
                'required',
                'string',
                'max:80',
            ],
            'filters' => [
                'nullable',
                'array',
                'max:12',
            ],
            'filters.*.field' => [
                'required',
                'string',
                'max:80',
            ],
            'filters.*.operator' => [
                'required',
                Rule::in([
                    'eq',
                    'neq',
                    'contains',
                    'gte',
                    'lte',
                ]),
            ],
            'filters.*.value' => [
                'nullable',
                'string',
                'max:255',
            ],
            'group_by' => [
                'nullable',
                'string',
                'max:80',
            ],
            'sort_by' => [
                'nullable',
                'string',
                'max:80',
            ],
            'sort_direction' => [
                'nullable',
                Rule::in([
                    'asc',
                    'desc',
                ]),
            ],
        ]);

        $definition =
            $this->datasets()[
                $data['dataset']
            ];

        $allowed =
            array_keys(
                $definition[
                    'columns'
                ],
            );

        foreach (
            $data['columns']
            as $column
        ) {
            if (
                ! in_array(
                    $column,
                    $allowed,
                    true,
                )
            ) {
                throw ValidationException::withMessages([
                    'columns' => [
                        'One or more selected columns are not available for this dataset.',
                    ],
                ]);
            }
        }

        foreach (
            $data['filters']
            ?? []
            as $filter
        ) {
            if (
                ! in_array(
                    $filter['field'],
                    $allowed,
                    true,
                )
            ) {
                throw ValidationException::withMessages([
                    'filters' => [
                        'One or more filter fields are not available for this dataset.',
                    ],
                ]);
            }
        }

        foreach (
            [
                'group_by',
                'sort_by',
            ]
            as $key
        ) {
            if (
                ! empty(
                    $data[$key]
                )
                && ! in_array(
                    $data[$key],
                    $allowed,
                    true,
                )
            ) {
                throw ValidationException::withMessages([
                    $key => [
                        'The selected field is not available for this dataset.',
                    ],
                ]);
            }
        }

        if (
            ! empty(
                $data['group_by']
            )
            && ! in_array(
                $data['group_by'],
                $data['columns'],
                true,
            )
        ) {
            throw ValidationException::withMessages([
                'group_by' => [
                    'Grouping field must also be selected as a report column.',
                ],
            ]);
        }

        return $data;
    }

    private function applyFilter(
        Builder $query,
        array $dataset,
        array $filter,
    ): void {
        $expression =
            $dataset[
                'columns'
            ][
                $filter[
                    'field'
                ]
            ][
                'expression'
            ];
        $value =
            $filter['value']
            ?? '';

        match (
            $filter[
                'operator'
            ]
        ) {
            'eq' =>
                $query->whereRaw(
                    $expression
                    .' = ?',
                    [$value],
                ),
            'neq' =>
                $query->whereRaw(
                    $expression
                    .' != ?',
                    [$value],
                ),
            'contains' =>
                $query->whereRaw(
                    'LOWER(CAST('
                    .$expression
                    .' AS CHAR)) LIKE ?',
                    [
                        '%'
                        .mb_strtolower(
                            $value,
                        )
                        .'%',
                    ],
                ),
            'gte' =>
                $query->whereRaw(
                    $expression
                    .' >= ?',
                    [$value],
                ),
            'lte' =>
                $query->whereRaw(
                    $expression
                    .' <= ?',
                    [$value],
                ),
        };
    }

    private function baseQuery(
        string $dataset,
        int $organizationId,
    ): Builder {
        if (
            in_array(
                $dataset,
                [
                    'sales_invoices',
                    'purchase_invoices',
                ],
                true,
            )
        ) {
            return DB::table(
                'financial_documents as document',
            )
                ->leftJoin(
                    'parties as party',
                    'party.id',
                    '=',
                    'document.party_id',
                )
                ->where(
                    'document.organization_id',
                    $organizationId,
                )
                ->where(
                    'document.kind',
                    $dataset
                    === 'sales_invoices'
                        ? 'sale_invoice'
                        : 'purchase_invoice',
                );
        }

        if (
            $dataset
            === 'cash_movements'
        ) {
            return DB::table(
                'cash_movements as movement',
            )
                ->leftJoin(
                    'parties as party',
                    'party.id',
                    '=',
                    'movement.party_id',
                )
                ->where(
                    'movement.organization_id',
                    $organizationId,
                );
        }

        if (
            $dataset === 'parties'
        ) {
            return DB::table(
                'parties as party',
            )
                ->where(
                    'party.organization_id',
                    $organizationId,
                )
                ->whereNull(
                    'party.deleted_at',
                );
        }

        return DB::table(
            'products as product',
        )
            ->where(
                'product.organization_id',
                $organizationId,
            )
            ->whereNull(
                'product.deleted_at',
            );
    }

    private function assertDatasetAccess(
        Request $request,
        string $dataset,
    ): void {
        abort_unless(
            $this->canUseDataset(
                $request,
                $dataset,
            ),
            403,
        );
    }

    private function canUseDataset(
        Request $request,
        string $dataset,
    ): bool {
        return match ($dataset) {
            'sales_invoices' =>
                FinanceAuthorization::allows(
                    $request->user(),
                    'finance.sales.view',
                ),
            'purchase_invoices' =>
                FinanceAuthorization::allows(
                    $request->user(),
                    'finance.purchases.view',
                ),
            'cash_movements' =>
                FinanceAuthorization::allows(
                    $request->user(),
                    'finance.cash.view',
                ),
            'parties' =>
                Gate::forUser(
                    $request->user(),
                )->allows(
                    'viewAny',
                    Party::class,
                ),
            'products' =>
                Gate::forUser(
                    $request->user(),
                )->allows(
                    'viewAny',
                    Product::class,
                ),
            default =>
                false,
        };
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function datasets(): array
    {
        $documentColumns = [
            'number' => [
                'label' => 'Document number',
                'type' => 'text',
                'expression' =>
                    'document.number',
            ],
            'party' => [
                'label' => 'Customer / supplier',
                'type' => 'text',
                'expression' =>
                    "COALESCE(party.company_name, party.name, '')",
            ],
            'issue_date' => [
                'label' => 'Issue date',
                'type' => 'date',
                'expression' =>
                    'document.issue_date',
            ],
            'due_date' => [
                'label' => 'Due date',
                'type' => 'date',
                'expression' =>
                    'document.due_date',
            ],
            'status' => [
                'label' => 'Status',
                'type' => 'text',
                'expression' =>
                    'document.status',
            ],
            'subtotal' => [
                'label' => 'Subtotal',
                'type' => 'number',
                'expression' =>
                    'document.subtotal',
            ],
            'discount_total' => [
                'label' => 'Discount',
                'type' => 'number',
                'expression' =>
                    'document.discount_total',
            ],
            'tax_total' => [
                'label' => 'Tax',
                'type' => 'number',
                'expression' =>
                    'document.tax_total',
            ],
            'total' => [
                'label' => 'Total',
                'type' => 'number',
                'expression' =>
                    'document.total',
            ],
            'paid_total' => [
                'label' => 'Paid',
                'type' => 'number',
                'expression' =>
                    'document.paid_total',
            ],
            'balance_due' => [
                'label' => 'Balance due',
                'type' => 'number',
                'expression' =>
                    'document.balance_due',
            ],
            'currency' => [
                'label' => 'Currency',
                'type' => 'text',
                'expression' =>
                    'document.currency',
            ],
        ];

        return [
            'sales_invoices' => [
                'label' =>
                    'Sales invoices',
                'columns' =>
                    $documentColumns,
            ],
            'purchase_invoices' => [
                'label' =>
                    'Purchase invoices',
                'columns' =>
                    $documentColumns,
            ],
            'cash_movements' => [
                'label' =>
                    'Cash movements',
                'columns' => [
                    'number' => [
                        'label' =>
                            'Movement number',
                        'type' =>
                            'text',
                        'expression' =>
                            'movement.number',
                    ],
                    'party' => [
                        'label' =>
                            'Counterparty',
                        'type' =>
                            'text',
                        'expression' =>
                            "COALESCE(party.company_name, party.name, '')",
                    ],
                    'movement_date' => [
                        'label' =>
                            'Date',
                        'type' =>
                            'date',
                        'expression' =>
                            'movement.movement_date',
                    ],
                    'direction' => [
                        'label' =>
                            'Direction',
                        'type' =>
                            'text',
                        'expression' =>
                            'movement.direction',
                    ],
                    'status' => [
                        'label' =>
                            'Status',
                        'type' =>
                            'text',
                        'expression' =>
                            'movement.status',
                    ],
                    'category' => [
                        'label' =>
                            'Category',
                        'type' =>
                            'text',
                        'expression' =>
                            'movement.category',
                    ],
                    'amount' => [
                        'label' =>
                            'Amount',
                        'type' =>
                            'number',
                        'expression' =>
                            'movement.amount',
                    ],
                    'currency' => [
                        'label' =>
                            'Currency',
                        'type' =>
                            'text',
                        'expression' =>
                            'movement.currency',
                    ],
                    'method' => [
                        'label' =>
                            'Method',
                        'type' =>
                            'text',
                        'expression' =>
                            'movement.method',
                    ],
                    'reference' => [
                        'label' =>
                            'Reference',
                        'type' =>
                            'text',
                        'expression' =>
                            'movement.reference',
                    ],
                ],
            ],
            'parties' => [
                'label' =>
                    'Customers & suppliers',
                'columns' => [
                    'name' => [
                        'label' =>
                            'Name',
                        'type' =>
                            'text',
                        'expression' =>
                            "COALESCE(party.company_name, party.name, '')",
                    ],
                    'type' => [
                        'label' =>
                            'Type',
                        'type' =>
                            'text',
                        'expression' =>
                            'party.type',
                    ],
                    'email' => [
                        'label' =>
                            'Email',
                        'type' =>
                            'text',
                        'expression' =>
                            'party.email',
                    ],
                    'phone' => [
                        'label' =>
                            'Phone',
                        'type' =>
                            'text',
                        'expression' =>
                            'party.phone',
                    ],
                    'city' => [
                        'label' =>
                            'City',
                        'type' =>
                            'text',
                        'expression' =>
                            'party.city',
                    ],
                    'country_code' => [
                        'label' =>
                            'Country',
                        'type' =>
                            'text',
                        'expression' =>
                            'party.country_code',
                    ],
                    'credit_limit' => [
                        'label' =>
                            'Credit limit',
                        'type' =>
                            'number',
                        'expression' =>
                            'party.credit_limit',
                    ],
                    'created_at' => [
                        'label' =>
                            'Created at',
                        'type' =>
                            'date',
                        'expression' =>
                            'party.created_at',
                    ],
                ],
            ],
            'products' => [
                'label' =>
                    'Products',
                'columns' => [
                    'name' => [
                        'label' =>
                            'Name',
                        'type' =>
                            'text',
                        'expression' =>
                            'product.name',
                    ],
                    'sku' => [
                        'label' =>
                            'SKU',
                        'type' =>
                            'text',
                        'expression' =>
                            'product.sku',
                    ],
                    'type' => [
                        'label' =>
                            'Type',
                        'type' =>
                            'text',
                        'expression' =>
                            'product.type',
                    ],
                    'unit' => [
                        'label' =>
                            'Unit',
                        'type' =>
                            'text',
                        'expression' =>
                            'product.unit',
                    ],
                    'unit_price' => [
                        'label' =>
                            'Selling price',
                        'type' =>
                            'number',
                        'expression' =>
                            'product.unit_price',
                    ],
                    'cost_price' => [
                        'label' =>
                            'Cost price',
                        'type' =>
                            'number',
                        'expression' =>
                            'product.cost_price',
                    ],
                    'tax_rate' => [
                        'label' =>
                            'Tax rate',
                        'type' =>
                            'number',
                        'expression' =>
                            'product.tax_rate',
                    ],
                    'track_inventory' => [
                        'label' =>
                            'Tracks inventory',
                        'type' =>
                            'text',
                        'expression' =>
                            'product.track_inventory',
                    ],
                    'created_at' => [
                        'label' =>
                            'Created at',
                        'type' =>
                            'date',
                        'expression' =>
                            'product.created_at',
                    ],
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function presentReport(
        object $row,
        ?int $userId = null,
    ): array {
        return [
            ...((array) $row),
            'can_edit' =>
                $userId !== null
                && (int) $row->created_by
                    === $userId,
            'columns' =>
                json_decode(
                    $row->columns,
                    true,
                )
                ?: [],
            'filters' =>
                json_decode(
                    $row->filters
                    ?: '[]',
                    true,
                )
                ?: [],
            'configuration' =>
                isset($row->configuration)
                && $row->configuration
                    ? (
                        json_decode(
                            $row->configuration,
                            true,
                        )
                        ?: null
                    )
                    : null,
            'visualization' =>
                isset($row->visualization)
                && $row->visualization
                    ? (
                        json_decode(
                            $row->visualization,
                            true,
                        )
                        ?: null
                    )
                    : null,
        ];
    }
}
