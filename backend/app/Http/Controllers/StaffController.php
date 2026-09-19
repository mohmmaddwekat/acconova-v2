<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Membership;
use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Models\WorkspaceRole;
use App\Support\InventoryQuantity as Decimal;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StaffController extends Controller
{
    /**
     * Determine whether the current workspace member owns one permission.
     */
    public static function allowed(
        string $permission,
    ): bool {
        if (
            in_array(
                app(
                    TenantContext::class,
                )->role()->value,
                [
                    'owner',
                    'admin',
                ],
                true,
            )
        ) {
            return true;
        }

        $membership =
            Membership::where(
                'user_id',
                auth()->id(),
            )->first();

        $role =
            $membership?->workspace_role_id
                ? WorkspaceRole::find(
                    $membership->workspace_role_id,
                )
                : null;

        return $role
            && $role->base_role ===
                $membership->role->value
            && in_array(
                $permission,
                $role->permissions,
                true,
            );
    }

    /**
     * Return whether the member has any permission scoped to managed teams.
     */
    private static function hasTeamScope(): bool
    {
        foreach (
            [
                'staff.team_view',
                'staff.team_manage',
                'staff.team_attendance',
                'staff.team_pay',
            ] as $permission
        ) {
            if (
                self::allowed(
                    $permission,
                )
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Return department IDs managed by the current user's linked Staff record.
     *
     * @return list<int>
     */
    public static function managedDepartmentIds(): array
    {
        return Department::whereIn(
            'manager_id',
            StaffMember::where(
                'user_id',
                auth()->id(),
            )
                ->where(
                    'active',
                    true,
                )
                ->select(
                    'id',
                ),
        )
            ->pluck(
                'id',
            )
            ->map(
                fn ($id): int => (int) $id,
            )
            ->all();
    }

    /**
     * Determine whether the current user may see one Staff record.
     */
    public static function canView(
        StaffMember $member,
    ): bool {
        if (
            self::allowed(
                'staff.view',
            )
        ) {
            return true;
        }

        if (
            (int) $member->user_id ===
            (int) auth()->id()
        ) {
            return true;
        }

        return self::hasTeamScope()
            && in_array(
                (int) $member->department_id,
                self::managedDepartmentIds(),
                true,
            );
    }

    /**
     * Determine whether the current user may change one Staff profile.
     */
    public static function canManage(
        StaffMember $member,
    ): bool {
        if (
            self::allowed(
                'staff.manage',
            )
        ) {
            return true;
        }

        return self::allowed(
            'staff.team_manage',
        )
            && in_array(
                (int) $member->department_id,
                self::managedDepartmentIds(),
                true,
            );
    }

    /**
     * Determine whether the current user may record attendance for one person.
     */
    public static function canRecordAttendance(
        StaffMember $member,
    ): bool {
        if (
            self::allowed(
                'staff.attendance',
            )
        ) {
            return true;
        }

        return self::allowed(
            'staff.team_attendance',
        )
            && in_array(
                (int) $member->department_id,
                self::managedDepartmentIds(),
                true,
            );
    }

    /**
     * Determine whether the current user may mutate payroll for one person.
     */
    public static function canPay(
        StaffMember $member,
    ): bool {
        return self::allowed(
            'staff.pay',
        )
        || (
            self::allowed(
                'staff.team_pay',
            )
            && in_array(
                (int) $member->department_id,
                self::managedDepartmentIds(),
                true,
            )
        );
    }

    /**
     * Return Staff records visible to the current permission scope.
     */
    public function index(
        Request $request,
    ): JsonResponse {
        $query =
            StaffMember::query();

        if (
            ! self::allowed(
                'staff.view',
            )
        ) {
            $query->where(
                function (
                    $query,
                ) use (
                    $request,
                ): void {
                    $query->where(
                        'user_id',
                        $request
                            ->user()
                            ->id,
                    );

                    if (
                        self::hasTeamScope()
                    ) {
                        $query->orWhereIn(
                            'department_id',
                            self::managedDepartmentIds(),
                        );
                    }
                },
            );
        }

        $filters =
            $request->validate([
                'include_accounts' => [
                    'sometimes',
                    'boolean',
                ],

                'search' => [
                    'nullable',
                    'string',
                    'max:100',
                ],

                'department_id' => [
                    'nullable',
                    'integer',
                ],

                'basis' => [
                    'nullable',

                    Rule::in([
                        'hour',
                        'day',
                        'month',
                        'piece',
                    ]),
                ],

                'active' => [
                    'nullable',

                    Rule::in([
                        '0',
                        '1',
                    ]),
                ],
            ]);

        if (
            ! empty(
                $filters['search']
            )
        ) {
            $query->where(
                function (
                    $query,
                ) use (
                    $filters,
                ): void {
                    $search =
                        '%'
                        .$filters['search']
                        .'%';

                    $query
                        ->where(
                            'name',
                            'like',
                            $search,
                        )
                        ->orWhere(
                            'job_title',
                            'like',
                            $search,
                        )
                        ->orWhere(
                            'phone',
                            'like',
                            $search,
                        );
                },
            );
        }

        foreach (
            [
                'department_id',
                'basis',
                'active',
            ] as $filter
        ) {
            if (
                isset(
                    $filters[$filter],
                )
                && $filters[$filter] !==
                    ''
            ) {
                $query->where(
                    $filter,
                    $filters[$filter],
                );
            }
        }

        $query->withSum(
            [
                'entries as balance' => fn ($query) => $query->where(
                    'kind',
                    '!=',
                    'terms',
                ),
            ],
            'amount',
        );

        return response()->json([
            'data' => $query
                ->orderBy(
                    'name',
                )
                ->paginate(
                    30,
                ),

            'can_invite' => app(
                TenantContext::class,
            )->role()->value ===
                    'owner',

            'can_view' => self::allowed(
                'staff.view',
            )
                || self::hasTeamScope(),

            'can_manage' => self::allowed(
                'staff.manage',
            )
                || self::allowed(
                    'staff.team_manage',
                ),

            'can_attendance' => self::allowed(
                'staff.attendance',
            )
                || self::allowed(
                    'staff.team_attendance',
                ),

            'can_pay' => self::allowed(
                'staff.pay',
            )
                || self::allowed(
                    'staff.team_pay',
                ),

            'currency' => app(
                TenantContext::class,
            )->organization()->preferences['currency']
                ?? 'ILS',

            'roles' => app(
                TenantContext::class,
            )->role()->value ===
                    'owner'
                    ? WorkspaceRole::orderBy(
                        'name',
                    )->get([
                        'id',
                        'name',
                    ])
                    : [],

            'departments' => Department::orderBy(
                'name',
            )->get([
                'id',
                'name',
                'manager_id',
            ]),

            'accounts' => (
                self::allowed(
                    'staff.manage',
                )
                || self::allowed(
                    'staff.team_manage',
                )
            )
                && $request->boolean(
                    'include_accounts',
                )
                    ? Membership::with(
                        'user:id,name,email',
                    )
                        ->get()
                        ->map(
                            fn (
                                Membership $member,
                            ): array => [
                                'id' => $member->user_id,

                                'name' => $member->user->name,

                                'email' => $member->user->email,
                            ],
                        )
                    : [],
        ]);
    }

    /**
     * Return the organization-scoped people overview used by the dedicated
     * employee dashboard, attendance, payroll and insights pages.
     */
    public function overview(
        Request $request,
    ): JsonResponse {
        $query =
            StaffMember::query();

        if (
            ! self::allowed(
                'staff.view',
            )
        ) {
            $query->where(
                function (
                    $query,
                ) use (
                    $request,
                ): void {
                    $query->where(
                        'user_id',
                        $request
                            ->user()
                            ->id,
                    );

                    if (
                        self::hasTeamScope()
                    ) {
                        $query->orWhereIn(
                            'department_id',
                            self::managedDepartmentIds(),
                        );
                    }
                },
            );
        }

        $members =
            $query
                ->withSum(
                    [
                        'entries as balance' => fn ($query) => $query->where(
                            'kind',
                            '!=',
                            'terms',
                        ),
                    ],
                    'amount',
                )
                ->orderBy(
                    'name',
                )
                ->get();

        $memberIds =
            $members
                ->pluck(
                    'id',
                );

        $departments =
            Department::query()
                ->orderBy(
                    'name',
                )
                ->get([
                    'id',
                    'name',
                    'manager_id',
                ]);

        $departmentNames =
            $departments
                ->pluck(
                    'name',
                    'id',
                );

        $active =
            $members->where(
                'active',
                true,
            );

        $canAttendance =
            self::allowed(
                'staff.attendance',
            )
            || self::allowed(
                'staff.team_attendance',
            );

        $canPay =
            self::allowed(
                'staff.pay',
            )
            || self::allowed(
                'staff.team_pay',
            );

        $attendanceToday =
            collect();

        $monthAttendance =
            collect();

        if (
            $canAttendance
            && $memberIds->isNotEmpty()
        ) {
            $attendanceToday =
                DB::table(
                    'staff_attendances',
                )
                    ->whereIn(
                        'staff_member_id',
                        $memberIds,
                    )
                    ->whereDate(
                        'occurred_on',
                        today(),
                    )
                    ->get();

            $monthAttendance =
                DB::table(
                    'staff_attendances',
                )
                    ->whereIn(
                        'staff_member_id',
                        $memberIds,
                    )
                    ->whereBetween(
                        'occurred_on',
                        [
                            today()
                                ->startOfMonth()
                                ->toDateString(),

                            today()
                                ->endOfMonth()
                                ->toDateString(),
                        ],
                    )
                    ->get();
        }

        $todayByMember =
            $attendanceToday
                ->keyBy(
                    'staff_member_id',
                );

        $attendanceRows =
            $active
                ->map(
                    function (
                        StaffMember $member,
                    ) use (
                        $todayByMember,
                        $departmentNames,
                    ): array {
                        $row =
                            $todayByMember->get(
                                $member->id,
                            );

                        return [
                            'id' => (int) $member->id,

                            'name' => $member->name,

                            'job_title' => $member->job_title,

                            'department' => $member->department_id !== null
                                ? $departmentNames->get(
                                    $member->department_id,
                                )
                                : null,

                            'status' => $row?->status,

                            'quantity' => $row?->quantity !== null
                                ? (string) $row->quantity
                                : null,

                            'overtime_hours' => $row?->overtime_hours !== null
                                ? (string) $row->overtime_hours
                                : '0',
                        ];
                    },
                )
                ->values();

        $monthPresent =
            $monthAttendance
                ->where(
                    'status',
                    'present',
                )
                ->count();

        $monthAbsent =
            $monthAttendance
                ->where(
                    'status',
                    'absent',
                )
                ->count();

        $monthOvertime =
            $monthAttendance
                ->sum(
                    fn (
                        object $row,
                    ): float => (float) $row->overtime_hours,
                );

        $byDepartment =
            $members
                ->groupBy(
                    fn (
                        StaffMember $member,
                    ): string => (string) (
                        $member->department_id
                        ?? 0
                    ),
                )
                ->map(
                    function (
                        $group,
                        string $departmentId,
                    ) use (
                        $departmentNames,
                    ): array {
                        $id =
                            (int) $departmentId;

                        return [
                            'id' => $id > 0
                                ? $id
                                : null,

                            'name' => $id > 0
                                ? (
                                    $departmentNames->get(
                                        $id,
                                    )
                                    ?? '—'
                                )
                                : '—',

                            'total' => $group->count(),

                            'active' => $group
                                ->where(
                                    'active',
                                    true,
                                )
                                ->count(),
                        ];
                    },
                )
                ->sortByDesc(
                    'total',
                )
                ->values();

        $byBasis =
            $members
                ->groupBy(
                    'basis',
                )
                ->map(
                    fn (
                        $group,
                        string $basis,
                    ): array => [
                        'basis' => $basis,

                        'total' => $group->count(),
                    ],
                )
                ->values();

        $tenureMonths =
            $members
                ->map(
                    fn (
                        StaffMember $member,
                    ): int => CarbonImmutable::parse(
                        $member->started_on,
                    )->diffInMonths(
                        today(),
                    ),
                );

        $recentHires =
            $members
                ->sortByDesc(
                    'started_on',
                )
                ->take(
                    6,
                )
                ->map(
                    fn (
                        StaffMember $member,
                    ): array => [
                        'id' => (int) $member->id,

                        'name' => $member->name,

                        'job_title' => $member->job_title,

                        'department' => $member->department_id !== null
                            ? $departmentNames->get(
                                $member->department_id,
                            )
                            : null,

                        'started_on' => (string) $member->started_on,

                        'active' => (bool) $member->active,

                        'linked_account' => $member->user_id !== null,
                    ],
                )
                ->values();

        $payroll =
            collect();

        if ($canPay) {
            $payroll =
                $members
                    ->groupBy(
                        'currency',
                    )
                    ->map(
                        function (
                            $group,
                            string $currency,
                        ): array {
                            $monthly =
                                $group->where(
                                    'active',
                                    true,
                                );

                            $monthlyBase =
                                $monthly
                                    ->where(
                                        'basis',
                                        'month',
                                    )
                                    ->sum(
                                        fn (
                                            StaffMember $member,
                                        ): float => (float) $member->rate,
                                    );

                            $allowances =
                                $monthly->sum(
                                    fn (
                                        StaffMember $member,
                                    ): float => (float) $member->monthly_allowance,
                                );

                            $balance =
                                $group->sum(
                                    fn (
                                        StaffMember $member,
                                    ): float => (float) (
                                        $member->balance
                                        ?? 0
                                    ),
                                );

                            return [
                                'currency' => $currency,

                                'monthly_base' => round(
                                    $monthlyBase,
                                    4,
                                ),

                                'monthly_allowances' => round(
                                    $allowances,
                                    4,
                                ),

                                'monthly_commitment' => round(
                                    $monthlyBase
                                    + $allowances,
                                    4,
                                ),

                                'balance' => round(
                                    $balance,
                                    4,
                                ),

                                'positive_balance' => round(
                                    $group->sum(
                                        fn (
                                            StaffMember $member,
                                        ): float => max(
                                            0,
                                            (float) (
                                                $member->balance
                                                ?? 0
                                            ),
                                        ),
                                    ),
                                    4,
                                ),

                                'negative_balance' => round(
                                    $group->sum(
                                        fn (
                                            StaffMember $member,
                                        ): float => min(
                                            0,
                                            (float) (
                                                $member->balance
                                                ?? 0
                                            ),
                                        ),
                                    ),
                                    4,
                                ),
                            ];
                        },
                    )
                    ->values();
        }

        return response()->json([
            'permissions' => [
                'can_view' => self::allowed(
                    'staff.view',
                )
                    || self::hasTeamScope(),

                'can_manage' => self::allowed(
                    'staff.manage',
                )
                    || self::allowed(
                        'staff.team_manage',
                    ),

                'can_attendance' => $canAttendance,

                'can_pay' => $canPay,
            ],

            'totals' => [
                'employees' => $members->count(),

                'active' => $active->count(),

                'inactive' => $members
                    ->where(
                        'active',
                        false,
                    )
                    ->count(),

                'linked_accounts' => $members
                    ->whereNotNull(
                        'user_id',
                    )
                    ->count(),

                'without_department' => $members
                    ->whereNull(
                        'department_id',
                    )
                    ->count(),

                'departments' => $byDepartment
                    ->whereNotNull(
                        'id',
                    )
                    ->count(),

                'average_tenure_months' => $tenureMonths->isNotEmpty()
                    ? (int) round(
                        $tenureMonths->average(),
                    )
                    : 0,
            ],

            'departments' => $byDepartment,

            'pay_basis' => $byBasis,

            'recent_hires' => $recentHires,

            'attendance' => [
                'date' => today()->toDateString(),

                'present_today' => $attendanceToday
                    ->where(
                        'status',
                        'present',
                    )
                    ->count(),

                'absent_today' => $attendanceToday
                    ->where(
                        'status',
                        'absent',
                    )
                    ->count(),

                'missing_today' => max(
                    0,
                    $active->count()
                    - $attendanceToday->count(),
                ),

                'month_present_records' => $monthPresent,

                'month_absent_records' => $monthAbsent,

                'month_overtime_hours' => round(
                    $monthOvertime,
                    4,
                ),

                'rows' => $canAttendance
                    ? $attendanceRows
                    : [],
            ],

            'payroll' => $payroll,
        ]);
    }

    /**
     * Validate the Staff profile fields accepted by create/update.
     */
    private function rules(): array
    {
        return [
            'name' => [
                'required',
                'string',
                'max:255',
            ],

            'job_title' => [
                'nullable',
                'string',
                'max:255',
            ],

            'phone' => [
                'nullable',
                'string',
                'max:50',
            ],

            'user_id' => [
                'nullable',
                'integer',

                Rule::exists(
                    'memberships',
                    'user_id',
                )->where(
                    'organization_id',
                    app(
                        TenantContext::class,
                    )->id(),
                ),

                Rule::unique(
                    'staff_members',
                    'user_id',
                )
                    ->where(
                        'organization_id',
                        app(
                            TenantContext::class,
                        )->id(),
                    )
                    ->ignore(
                        request()->route(
                            'staff',
                        ),
                    ),
            ],

            'department_id' => [
                'nullable',
                'integer',

                Rule::exists(
                    'departments',
                    'id',
                )->where(
                    'organization_id',
                    app(
                        TenantContext::class,
                    )->id(),
                ),
            ],

            'basis' => [
                'required',

                Rule::in([
                    'hour',
                    'day',
                    'month',
                    'piece',
                ]),
            ],

            'unit' => [
                'nullable',
                'string',
                'max:50',
            ],

            'rate' => [
                'required',
                'numeric',
                'min:0',
                'max:999999',
                'regex:/^\d+(\.\d{1,4})?$/',
            ],

            'monthly_allowance' => [
                'required',
                'numeric',
                'min:0',
                'max:999999',
                'regex:/^\d+(\.\d{1,4})?$/',
            ],

            'currency' => [
                'required',
                'regex:/^[A-Z]{3}$/',
            ],

            'started_on' => [
                'required',
                'date_format:Y-m-d',
            ],

            'active' => [
                'sometimes',
                'boolean',
            ],
        ];
    }

    /**
     * Create a Staff member in the permitted company/team scope.
     */
    public function store(
        Request $request,
    ): JsonResponse {
        $request->merge([
            'currency' => app(
                TenantContext::class,
            )->organization()->preferences['currency']
                ?? 'ILS',
        ]);

        $data =
            $request->validate(
                $this->rules(),
            );

        $canManageAll =
            self::allowed(
                'staff.manage',
            );

        $canManageTeam =
            self::allowed(
                'staff.team_manage',
            )
            && isset(
                $data['department_id'],
            )
            && in_array(
                (int) $data['department_id'],
                self::managedDepartmentIds(),
                true,
            );

        abort_unless(
            $canManageAll
            || $canManageTeam,
            403,
        );

        $member =
            StaffMember::create(
                $data,
            );

        return response()->json([
            'data' => $member,
        ], 201);
    }

    /**
     * Update a Staff profile only inside the permitted management scope.
     */
    public function update(
        Request $request,
        string $staff,
    ): JsonResponse {
        $existing =
            StaffMember::findOrFail(
                $staff,
            );

        abort_unless(
            self::canManage(
                $existing,
            ),
            403,
        );

        $request->merge([
            'currency' => $existing->currency,
        ]);

        $data =
            $request->validate(
                $this->rules(),
            );

        /*
         * A department-scoped manager may not move an employee out of their
         * managed departments to bypass the scope boundary.
         */
        if (
            ! self::allowed(
                'staff.manage',
            )
        ) {
            abort_unless(
                isset(
                    $data['department_id'],
                )
                && in_array(
                    (int) $data['department_id'],
                    self::managedDepartmentIds(),
                    true,
                ),
                403,
            );
        }

        $member =
            DB::transaction(
                function () use (
                    $staff,
                    $data,
                    $request,
                ): StaffMember {
                    $member =
                        StaffMember::lockForUpdate()
                            ->findOrFail(
                                $staff,
                            );

                    abort_if(
                        $data['currency'] !==
                            $member->currency
                        && StaffEntry::where(
                            'staff_member_id',
                            $member->id,
                        )->exists(),
                        422,
                    );

                    if (
                        (
                            isset(
                                $data['active'],
                            )
                            && ! $data['active']
                        )
                        || (
                            array_key_exists(
                                'department_id',
                                $data,
                            )
                            && (int) $data['department_id'] !==
                                (int) $member->department_id
                        )
                    ) {
                        Department::where(
                            'manager_id',
                            $member->id,
                        )->update([
                            'manager_id' => null,
                        ]);
                    }

                    $before =
                        $member->toArray();

                    $member->update(
                        $data,
                    );

                    StaffEntry::create([
                        'staff_member_id' => $member->id,

                        'created_by' => $request
                            ->user()
                            ->id,

                        'request_id' => (string) Str::uuid(),

                        'kind' => 'terms',

                        'occurred_on' => today()->toDateString(),

                        'amount' => 0,

                        'terms' => [
                            'before' => $before,

                            'after' => $member->toArray(),
                        ],
                    ]);

                    return $member;
                },
            );

        return response()->json([
            'data' => $member,
        ]);
    }

    /**
     * Return one employee ledger inside the allowed visibility scope.
     */
    public function ledger(
        Request $request,
        string $staff,
    ): JsonResponse {
        $member =
            StaffMember::findOrFail(
                $staff,
            );

        abort_unless(
            self::canView(
                $member,
            ),
            403,
        );

        $entries =
            StaffEntry::where(
                'staff_member_id',
                $member->id,
            );

        $totals =
            (clone $entries)
                ->selectRaw(
                    'kind, SUM(amount) as amount',
                )
                ->groupBy(
                    'kind',
                )
                ->pluck(
                    'amount',
                    'kind',
                );

        return response()->json([
            'can_pay' => self::canPay(
                $member,
            ),

            'can_attendance' => self::canRecordAttendance(
                $member,
            ),

            'can_manage' => self::canManage(
                $member,
            ),

            'member' => $member,

            'totals' => $totals,

            'balance' => (string) (
                clone $entries
            )->sum(
                'amount',
            ),

            'corrections' => DB::table(
                'staff_corrections',
            )
                ->where(
                    'staff_member_id',
                    $member->id,
                )
                ->latest(
                    'id',
                )
                ->limit(
                    20,
                )
                ->get([
                    'entity',
                    'action',
                    'reason',
                    'created_at',
                ]),

            'entries' => $entries
                ->latest(
                    'occurred_on',
                )
                ->latest(
                    'id',
                )
                ->paginate(
                    30,
                ),
        ]);
    }

    /**
     * Approve missing complete monthly salary periods.
     */
    public function accrue(
        Request $request,
        string $staff,
    ): JsonResponse {
        $data =
            $request->validate([
                'through' => [
                    'required',
                    'date_format:Y-m',
                ],
            ]);

        $through =
            CarbonImmutable::createFromFormat(
                '!Y-m',
                $data['through'],
            );

        abort_unless(
            $through->lt(
                today()->startOfMonth(),
            ),
            422,
        );

        $count =
            DB::transaction(
                function () use (
                    $request,
                    $staff,
                    $through,
                ): int {
                    $member =
                        StaffMember::lockForUpdate()
                            ->findOrFail(
                                $staff,
                            );

                    abort_unless(
                        self::canPay(
                            $member,
                        ),
                        403,
                    );

                    abort_unless(
                        $member->basis ===
                            'month'
                        && $member->active,
                        409,
                    );

                    $history =
                        StaffEntry::where(
                            'staff_member_id',
                            $member->id,
                        )
                            ->where(
                                'kind',
                                'terms',
                            )
                            ->orderBy(
                                'occurred_on',
                            )
                            ->orderBy(
                                'id',
                            )
                            ->get();

                    $initial =
                        $history->first()?->terms['before']
                        ?? $member->toArray();

                    $started =
                        CarbonImmutable::parse(
                            $initial['started_on'],
                        );

                    $start =
                        $started->day ===
                            1
                            ? $started->startOfMonth()
                            : $started
                                ->startOfMonth()
                                ->addMonth();

                    abort_if(
                        $start->diffInMonths(
                            $through,
                            false,
                        ) >
                            600,
                        422,
                    );

                    $existing =
                        StaffEntry::where(
                            'staff_member_id',
                            $member->id,
                        )
                            ->whereIn(
                                'kind',
                                [
                                    'work',
                                    'monthly_allowance',
                                ],
                            )
                            ->get([
                                'kind',
                                'occurred_on',
                            ])
                            ->mapWithKeys(
                                fn (
                                    StaffEntry $entry,
                                ): array => [
                                    $entry->kind
                                    .':'
                                    .substr(
                                        (string) $entry->occurred_on,
                                        0,
                                        7,
                                    ) => true,
                                ],
                            )
                            ->all();

                    $count =
                        0;

                    for (
                        $month =
                            $start;
                        $month->lte(
                            $through,
                        );
                        $month =
                            $month->addMonth()
                    ) {
                        $terms =
                            $initial;

                        foreach (
                            $history as $change
                        ) {
                            if (
                                substr(
                                    (string) $change->occurred_on,
                                    0,
                                    10,
                                ) <=
                                $month->toDateString()
                            ) {
                                $terms =
                                    $change->terms['after'];
                            }
                        }

                        if (
                            (
                                $terms['basis']
                                ?? null
                            ) !==
                                'month'
                            || ! (
                                $terms['active']
                                ?? true
                            )
                        ) {
                            continue;
                        }

                        foreach (
                            [
                                'work' => 'rate',

                                'monthly_allowance' => 'monthly_allowance',
                            ] as $kind => $field
                        ) {
                            if (
                                isset(
                                    $existing[
                                        $kind
                                        .':'
                                        .$month->format(
                                            'Y-m',
                                        )
                                    ],
                                )
                            ) {
                                continue;
                            }

                            $amount =
                                Decimal::toUnits(
                                    $terms[$field]
                                    ?? '0',
                                );

                            if (
                                $amount <=
                                0
                            ) {
                                continue;
                            }

                            StaffEntry::create([
                                'staff_member_id' => $member->id,

                                'created_by' => $request
                                    ->user()
                                    ->id,

                                'request_id' => (string) Str::uuid(),

                                'kind' => $kind,

                                'occurred_on' => $month->toDateString(),

                                'quantity' => $kind ===
                                        'work'
                                        ? '1'
                                        : null,

                                'rate' => $kind ===
                                        'work'
                                        ? $terms['rate']
                                        : null,

                                'amount' => Decimal::fromUnits(
                                    $amount,
                                ),

                                'notes' => 'Monthly accrual '
                                    .$month->format(
                                        'Y-m',
                                    ),

                                'terms' => [
                                    'basis' => 'month',

                                    'currency' => $member->currency,

                                    'accrual' => true,
                                ],
                            ]);

                            $count++;
                        }
                    }

                    return $count;
                },
            );

        return response()->json([
            'created' => $count,
        ]);
    }

    /**
     * Record one payroll ledger operation.
     */
    public function record(
        Request $request,
        string $staff,
    ): JsonResponse {
        $data =
            $request->validate([
                'request_id' => [
                    'required',
                    'uuid',
                ],

                'kind' => [
                    'required',

                    Rule::in([
                        'work',
                        'bonus',
                        'allowance',
                        'monthly_allowance',
                        'deduction',
                        'payment',
                        'advance',
                    ]),
                ],

                'occurred_on' => [
                    'required',
                    'date_format:Y-m-d',
                    'before_or_equal:today',
                ],

                'quantity' => [
                    'required_if:kind,work',
                    'nullable',
                    'numeric',
                    'gt:0',
                    'max:9999',
                    'regex:/^\d+(\.\d{1,4})?$/',
                ],

                'amount' => [
                    'required_unless:kind,work,monthly_allowance',
                    'nullable',
                    'numeric',
                    'gt:0',
                    'max:999999999',
                    'regex:/^\d+(\.\d{1,4})?$/',
                ],

                'notes' => [
                    'required',
                    'string',
                    'max:2000',
                ],
            ]);

        $entry =
            DB::transaction(
                function () use (
                    $request,
                    $staff,
                    $data,
                ): StaffEntry {
                    $member =
                        StaffMember::lockForUpdate()
                            ->findOrFail(
                                $staff,
                            );

                    abort_unless(
                        self::canPay(
                            $member,
                        ),
                        403,
                    );

                    abort_if(
                        ! $member->active
                        && in_array(
                            $data['kind'],
                            [
                                'work',
                                'monthly_allowance',
                            ],
                            true,
                        ),
                        409,
                    );

                    abort_if(
                        StaffEntry::where(
                            'request_id',
                            $data['request_id'],
                        )->exists(),
                        409,
                    );

                    if (
                        $data['kind'] ===
                            'monthly_allowance'
                        || (
                            $data['kind'] ===
                                'work'
                            && $member->basis ===
                                'month'
                        )
                    ) {
                        abort_unless(
                            substr(
                                $data['occurred_on'],
                                8,
                                2,
                            ) ===
                                '01',
                            422,
                        );

                        abort_if(
                            StaffEntry::where(
                                'staff_member_id',
                                $member->id,
                            )
                                ->where(
                                    'kind',
                                    $data['kind'],
                                )
                                ->whereDate(
                                    'occurred_on',
                                    $data['occurred_on'],
                                )
                                ->exists(),
                            409,
                        );

                        if (
                            $data['kind'] ===
                            'work'
                        ) {
                            abort_unless(
                                Decimal::toUnits(
                                    $data['quantity'],
                                ) ===
                                    10000,
                                422,
                            );
                        }
                    }

                    if (
                        $data['kind'] ===
                            'work'
                        && $member->basis !==
                            'month'
                    ) {
                        abort_if(
                            DB::table(
                                'staff_attendances',
                            )
                                ->where(
                                    'staff_member_id',
                                    $member->id,
                                )
                                ->whereDate(
                                    'occurred_on',
                                    $data['occurred_on'],
                                )
                                ->exists(),
                            409,
                        );
                    }

                    $amount =
                        $data['kind'] ===
                            'work'
                            ? intdiv(
                                Decimal::toUnits(
                                    $data['quantity'],
                                )
                                * Decimal::toUnits(
                                    $member->rate,
                                )
                                + 5000,
                                10000,
                            )
                            : (
                                $data['kind'] ===
                                    'monthly_allowance'
                                    ? Decimal::toUnits(
                                        $member->monthly_allowance,
                                    )
                                    : Decimal::toUnits(
                                        $data['amount'],
                                    )
                            );

                    abort_if(
                        $amount <=
                        0,
                        422,
                    );

                    if (
                        in_array(
                            $data['kind'],
                            [
                                'deduction',
                                'payment',
                                'advance',
                            ],
                            true,
                        )
                    ) {
                        $amount =
                            -$amount;
                    }

                    return StaffEntry::create([
                        ...$data,

                        'amount' => Decimal::fromUnits(
                            $amount,
                        ),

                        'quantity' => $data['kind'] ===
                                'work'
                                ? $data['quantity']
                                : null,

                        'rate' => $data['kind'] ===
                                'work'
                                ? $member->rate
                                : null,

                        'staff_member_id' => $member->id,

                        'created_by' => $request
                            ->user()
                            ->id,

                        'terms' => [
                            'basis' => $member->basis,

                            'unit' => $member->unit,

                            'currency' => $member->currency,

                            'monthly_allowance' => $member->monthly_allowance,
                        ],
                    ]);
                },
            );

        return response()->json([
            'data' => $entry,
        ], 201);
    }
}
