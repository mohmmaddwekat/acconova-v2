<?php

namespace App\Http\Controllers;

use App\Enums\OrganizationRole;
use App\Models\Party;
use App\Models\Product;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WorkspaceCustomizationController extends Controller
{
    public function index(
        Request $request,
    ): JsonResponse {
        $this->authorizeSettings();

        $organizationId = app(
            TenantContext::class,
        )->id();

        return response()->json([
            'fields' => DB::table(
                'custom_field_definitions',
            )
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->orderBy('entity_type')
                ->orderBy('position')
                ->orderBy('id')
                ->get()
                ->map(fn ($row): array => [
                    ...((array) $row),
                    'options' => $row->options
                        ? json_decode(
                            $row->options,
                            true,
                        )
                        : [],
                ]),
            'statuses' => DB::table(
                'custom_status_definitions',
            )
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->orderBy('entity_type')
                ->orderBy('position')
                ->orderBy('id')
                ->get(),
            'approval_rules' => DB::table(
                'approval_rules',
            )
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->orderBy('priority')
                ->orderBy('id')
                ->get(),
        ]);
    }

    public function storeField(
        Request $request,
    ): JsonResponse {
        $this->authorizeSettings();

        $organizationId = app(
            TenantContext::class,
        )->id();

        $data = $this->fieldData(
            $request,
            $organizationId,
        );

        $id = DB::table(
            'custom_field_definitions',
        )->insertGetId([
            'organization_id' =>
                $organizationId,
            ...$data,
            'options' => json_encode(
                $data['options'] ?? [],
                JSON_THROW_ON_ERROR,
            ),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'data' => $this->field(
                $organizationId,
                $id,
            ),
        ], 201);
    }

    public function updateField(
        Request $request,
        string $field,
    ): JsonResponse {
        $this->authorizeSettings();

        $organizationId = app(
            TenantContext::class,
        )->id();
        $record = $this->tenantRow(
            'custom_field_definitions',
            (int) $field,
            $organizationId,
        );

        $data = $this->fieldData(
            $request,
            $organizationId,
            (int) $record->id,
        );

        DB::table(
            'custom_field_definitions',
        )
            ->where('id', $record->id)
            ->update([
                ...$data,
                'options' => json_encode(
                    $data['options'] ?? [],
                    JSON_THROW_ON_ERROR,
                ),
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' => $this->field(
                $organizationId,
                (int) $record->id,
            ),
        ]);
    }

    public function deleteField(
        Request $request,
        string $field,
    ): JsonResponse {
        $this->authorizeSettings();

        $organizationId = app(
            TenantContext::class,
        )->id();
        $record = $this->tenantRow(
            'custom_field_definitions',
            (int) $field,
            $organizationId,
        );

        DB::table(
            'custom_field_definitions',
        )
            ->where('id', $record->id)
            ->update([
                'active' => false,
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' => [
                'id' => $record->id,
                'active' => false,
            ],
        ]);
    }

    public function storeStatus(
        Request $request,
    ): JsonResponse {
        $this->authorizeSettings();

        $organizationId = app(
            TenantContext::class,
        )->id();
        $data = $this->statusData(
            $request,
            $organizationId,
        );

        $id = DB::table(
            'custom_status_definitions',
        )->insertGetId([
            'organization_id' =>
                $organizationId,
            ...$data,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'data' => $this->tenantRow(
                'custom_status_definitions',
                $id,
                $organizationId,
            ),
        ], 201);
    }

    public function updateStatus(
        Request $request,
        string $status,
    ): JsonResponse {
        $this->authorizeSettings();

        $organizationId = app(
            TenantContext::class,
        )->id();
        $record = $this->tenantRow(
            'custom_status_definitions',
            (int) $status,
            $organizationId,
        );
        $data = $this->statusData(
            $request,
            $organizationId,
            (int) $record->id,
        );

        DB::table(
            'custom_status_definitions',
        )
            ->where('id', $record->id)
            ->update([
                ...$data,
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' => $this->tenantRow(
                'custom_status_definitions',
                (int) $record->id,
                $organizationId,
            ),
        ]);
    }

    public function deleteStatus(
        Request $request,
        string $status,
    ): JsonResponse {
        $this->authorizeSettings();

        $organizationId = app(
            TenantContext::class,
        )->id();
        $record = $this->tenantRow(
            'custom_status_definitions',
            (int) $status,
            $organizationId,
        );

        DB::table(
            'custom_status_definitions',
        )
            ->where('id', $record->id)
            ->update([
                'active' => false,
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' => [
                'id' => $record->id,
                'active' => false,
            ],
        ]);
    }

    public function storeApprovalRule(
        Request $request,
    ): JsonResponse {
        $this->authorizeSettings();

        $organizationId = app(
            TenantContext::class,
        )->id();
        $data = $this->approvalRuleData(
            $request,
        );

        $id = DB::table(
            'approval_rules',
        )->insertGetId([
            'organization_id' =>
                $organizationId,
            ...$data,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'data' => $this->tenantRow(
                'approval_rules',
                $id,
                $organizationId,
            ),
        ], 201);
    }

    public function updateApprovalRule(
        Request $request,
        string $rule,
    ): JsonResponse {
        $this->authorizeSettings();

        $organizationId = app(
            TenantContext::class,
        )->id();
        $record = $this->tenantRow(
            'approval_rules',
            (int) $rule,
            $organizationId,
        );
        $data = $this->approvalRuleData(
            $request,
        );

        DB::table('approval_rules')
            ->where('id', $record->id)
            ->update([
                ...$data,
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' => $this->tenantRow(
                'approval_rules',
                (int) $record->id,
                $organizationId,
            ),
        ]);
    }

    public function deleteApprovalRule(
        Request $request,
        string $rule,
    ): JsonResponse {
        $this->authorizeSettings();

        $organizationId = app(
            TenantContext::class,
        )->id();
        $record = $this->tenantRow(
            'approval_rules',
            (int) $rule,
            $organizationId,
        );

        DB::table('approval_rules')
            ->where('id', $record->id)
            ->update([
                'active' => false,
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' => [
                'id' => $record->id,
                'active' => false,
            ],
        ]);
    }

    public function record(
        Request $request,
        string $type,
        string $record,
    ): JsonResponse {
        $entity = $this->entity(
            $request,
            $type,
            (int) $record,
            false,
        );

        $organizationId = app(
            TenantContext::class,
        )->id();

        $fields = DB::table(
            'custom_field_definitions',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'entity_type',
                $type,
            )
            ->where('active', true)
            ->orderBy('position')
            ->orderBy('id')
            ->get()
            ->map(fn ($row): array => [
                ...((array) $row),
                'options' => $row->options
                    ? json_decode(
                        $row->options,
                        true,
                    )
                    : [],
            ]);

        $values = DB::table(
            'custom_field_values',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'entity_type',
                $type,
            )
            ->where(
                'entity_id',
                $entity['id'],
            )
            ->pluck(
                'value',
                'custom_field_definition_id',
            );

        $statuses = DB::table(
            'custom_status_definitions',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'entity_type',
                $type,
            )
            ->where('active', true)
            ->orderBy('position')
            ->orderBy('id')
            ->get();

        $assignment = DB::table(
            'custom_status_assignments',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'entity_type',
                $type,
            )
            ->where(
                'entity_id',
                $entity['id'],
            )
            ->first();

        return response()->json([
            'fields' => $fields,
            'values' => $values,
            'statuses' => $statuses,
            'status_id' =>
                $assignment
                    ? $assignment->custom_status_definition_id
                    : null,
            'can_edit' =>
                $entity['can_edit'],
        ]);
    }

    public function updateRecord(
        Request $request,
        string $type,
        string $record,
    ): JsonResponse {
        $entity = $this->entity(
            $request,
            $type,
            (int) $record,
            true,
        );

        $organizationId = app(
            TenantContext::class,
        )->id();

        $data = $request->validate([
            'values' => [
                'nullable',
                'array',
            ],
            'values.*' => [
                'nullable',
                'string',
                'max:5000',
            ],
            'status_id' => [
                'nullable',
                'integer',
            ],
        ]);

        DB::transaction(
            function () use (
                $data,
                $type,
                $entity,
                $organizationId,
            ): void {
                $definitions = DB::table(
                    'custom_field_definitions',
                )
                    ->where(
                        'organization_id',
                        $organizationId,
                    )
                    ->where(
                        'entity_type',
                        $type,
                    )
                    ->where('active', true)
                    ->get()
                    ->keyBy('id');

                foreach (
                    $data['values']
                    ?? []
                    as $definitionId => $value
                ) {
                    $definition =
                        $definitions->get(
                            (int) $definitionId,
                        );

                    if (! $definition) {
                        throw ValidationException::withMessages([
                            'values' => [
                                'One or more custom fields are not available for this record.',
                            ],
                        ]);
                    }

                    $this->validateCustomValue(
                        $definition,
                        $value,
                    );

                    DB::table(
                        'custom_field_values',
                    )->updateOrInsert([
                        'organization_id' =>
                            $organizationId,
                        'custom_field_definition_id' =>
                            (int) $definition->id,
                        'entity_type' => $type,
                        'entity_id' => $entity['id'],
                    ], [
                        'value' =>
                            $value === ''
                                ? null
                                : $value,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]);
                }

                if (
                    array_key_exists(
                        'status_id',
                        $data,
                    )
                ) {
                    if (
                        $data['status_id']
                        === null
                    ) {
                        DB::table(
                            'custom_status_assignments',
                        )
                            ->where(
                                'organization_id',
                                $organizationId,
                            )
                            ->where(
                                'entity_type',
                                $type,
                            )
                            ->where(
                                'entity_id',
                                $entity['id'],
                            )
                            ->delete();

                        return;
                    }

                    $status = DB::table(
                        'custom_status_definitions',
                    )
                        ->where(
                            'organization_id',
                            $organizationId,
                        )
                        ->where(
                            'entity_type',
                            $type,
                        )
                        ->where(
                            'id',
                            (int) $data['status_id'],
                        )
                        ->where(
                            'active',
                            true,
                        )
                        ->first();

                    if (! $status) {
                        throw ValidationException::withMessages([
                            'status_id' => [
                                'Choose an active status for this record type.',
                            ],
                        ]);
                    }

                    DB::table(
                        'custom_status_assignments',
                    )->updateOrInsert([
                        'organization_id' =>
                            $organizationId,
                        'entity_type' => $type,
                        'entity_id' => $entity['id'],
                    ], [
                        'custom_status_definition_id' =>
                            $status->id,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]);
                }
            },
            3,
        );

        return $this->record(
            $request,
            $type,
            (string) $entity['id'],
        );
    }

    /** @return array<string, mixed> */
    private function fieldData(
        Request $request,
        int $organizationId,
        ?int $ignoreId = null,
    ): array {
        $data = $request->validate([
            'entity_type' => [
                'required',
                Rule::in([
                    'party',
                    'product',
                    'staff',
                    'task',
                    'project',
                ]),
            ],
            'key' => [
                'required',
                'string',
                'max:80',
                'regex:/^[a-z][a-z0-9_]*$/',
            ],
            'label' => [
                'required',
                'string',
                'max:160',
            ],
            'field_type' => [
                'required',
                Rule::in([
                    'text',
                    'number',
                    'date',
                    'select',
                    'checkbox',
                ]),
            ],
            'options' => [
                'nullable',
                'array',
                'max:50',
            ],
            'options.*' => [
                'string',
                'max:160',
            ],
            'required' => [
                'nullable',
                'boolean',
            ],
            'active' => [
                'nullable',
                'boolean',
            ],
            'position' => [
                'nullable',
                'integer',
                'between:0,1000',
            ],
        ]);

        $exists = DB::table(
            'custom_field_definitions',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'entity_type',
                $data['entity_type'],
            )
            ->where(
                'key',
                $data['key'],
            )
            ->when(
                $ignoreId,
                fn ($query) =>
                    $query->where(
                        'id',
                        '!=',
                        $ignoreId,
                    ),
            )
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'key' => [
                    'This custom field key is already used for the selected record type.',
                ],
            ]);
        }

        if (
            $data['field_type']
            === 'select'
            && empty(
                $data['options']
            )
        ) {
            throw ValidationException::withMessages([
                'options' => [
                    'Select fields require at least one option.',
                ],
            ]);
        }

        return [
            ...$data,
            'options' =>
                array_values(
                    $data['options']
                    ?? [],
                ),
            'required' =>
                (bool) (
                    $data['required']
                    ?? false
                ),
            'active' =>
                (bool) (
                    $data['active']
                    ?? true
                ),
            'position' =>
                (int) (
                    $data['position']
                    ?? 0
                ),
        ];
    }

    /** @return array<string, mixed> */
    private function statusData(
        Request $request,
        int $organizationId,
        ?int $ignoreId = null,
    ): array {
        $data = $request->validate([
            'entity_type' => [
                'required',
                Rule::in([
                    'party',
                    'product',
                    'staff',
                    'task',
                    'project',
                ]),
            ],
            'key' => [
                'required',
                'string',
                'max:80',
                'regex:/^[a-z][a-z0-9_]*$/',
            ],
            'label' => [
                'required',
                'string',
                'max:160',
            ],
            'color' => [
                'nullable',
                'string',
                'max:32',
            ],
            'is_closed' => [
                'nullable',
                'boolean',
            ],
            'active' => [
                'nullable',
                'boolean',
            ],
            'position' => [
                'nullable',
                'integer',
                'between:0,1000',
            ],
        ]);

        $exists = DB::table(
            'custom_status_definitions',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'entity_type',
                $data['entity_type'],
            )
            ->where(
                'key',
                $data['key'],
            )
            ->when(
                $ignoreId,
                fn ($query) =>
                    $query->where(
                        'id',
                        '!=',
                        $ignoreId,
                    ),
            )
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'key' => [
                    'This status key is already used for the selected record type.',
                ],
            ]);
        }

        return [
            ...$data,
            'is_closed' =>
                (bool) (
                    $data['is_closed']
                    ?? false
                ),
            'active' =>
                (bool) (
                    $data['active']
                    ?? true
                ),
            'position' =>
                (int) (
                    $data['position']
                    ?? 0
                ),
        ];
    }

    /** @return array<string, mixed> */
    private function approvalRuleData(
        Request $request,
    ): array {
        $data = $request->validate([
            'name' => [
                'required',
                'string',
                'max:160',
            ],
            'subject_type' => [
                'required',
                Rule::in([
                    'financial_document',
                    'cash_movement',
                ]),
            ],
            'condition_field' => [
                'required',
                Rule::in([
                    'total',
                    'discount_percent',
                    'amount',
                    'method',
                ]),
            ],
            'operator' => [
                'required',
                Rule::in([
                    'gte',
                    'gt',
                    'lte',
                    'lt',
                    'eq',
                ]),
            ],
            'threshold' => [
                'required',
                'string',
                'max:255',
            ],
            'required_approvals' => [
                'required',
                'integer',
                'between:1,5',
            ],
            'active' => [
                'nullable',
                'boolean',
            ],
            'priority' => [
                'nullable',
                'integer',
                'between:1,1000',
            ],
        ]) + [
            'active' => true,
            'priority' => 100,
        ];

        $allowedFields =
            $data['subject_type']
            === 'financial_document'
                ? [
                    'total',
                    'discount_percent',
                ]
                : [
                    'amount',
                    'method',
                ];

        if (
            ! in_array(
                $data['condition_field'],
                $allowedFields,
                true,
            )
        ) {
            throw ValidationException::withMessages([
                'condition_field' => [
                    'The selected field is not available for this approval subject.',
                ],
            ]);
        }

        if (
            $data['condition_field']
            === 'method'
            && $data['operator']
                !== 'eq'
        ) {
            throw ValidationException::withMessages([
                'operator' => [
                    'Payment method rules support the equals operator only.',
                ],
            ]);
        }

        if (
            $data['condition_field']
            !== 'method'
            && ! is_numeric(
                $data['threshold'],
            )
        ) {
            throw ValidationException::withMessages([
                'threshold' => [
                    'This approval rule requires a numeric threshold.',
                ],
            ]);
        }

        return $data;
    }

    private function field(
        int $organizationId,
        int $id,
    ): array {
        $row = $this->tenantRow(
            'custom_field_definitions',
            $id,
            $organizationId,
        );

        return [
            ...((array) $row),
            'options' => $row->options
                ? json_decode(
                    $row->options,
                    true,
                )
                : [],
        ];
    }

    private function validateCustomValue(
        object $definition,
        ?string $value,
    ): void {
        if (
            $definition->required
            && (
                $value === null
                || trim($value) === ''
            )
        ) {
            throw ValidationException::withMessages([
                'values' => [
                    $definition->label
                    .' is required.',
                ],
            ]);
        }

        if (
            $value === null
            || trim($value) === ''
        ) {
            return;
        }

        if (
            $definition->field_type
            === 'number'
            && ! is_numeric($value)
        ) {
            throw ValidationException::withMessages([
                'values' => [
                    $definition->label
                    .' must be numeric.',
                ],
            ]);
        }

        if (
            $definition->field_type
            === 'date'
            && ! preg_match(
                '/^\d{4}-\d{2}-\d{2}$/',
                $value,
            )
        ) {
            throw ValidationException::withMessages([
                'values' => [
                    $definition->label
                    .' must be a date.',
                ],
            ]);
        }

        if (
            $definition->field_type
            === 'checkbox'
            && ! in_array(
                $value,
                ['0', '1'],
                true,
            )
        ) {
            throw ValidationException::withMessages([
                'values' => [
                    $definition->label
                    .' must be checked or unchecked.',
                ],
            ]);
        }

        if (
            $definition->field_type
            === 'select'
        ) {
            $options = $definition->options
                ? json_decode(
                    $definition->options,
                    true,
                )
                : [];

            if (
                ! is_array($options)
                || ! in_array(
                    $value,
                    $options,
                    true,
                )
            ) {
                throw ValidationException::withMessages([
                    'values' => [
                        'Choose a valid option for '
                        .$definition->label
                        .'.',
                    ],
                ]);
            }
        }
    }

    /** @return array{id: int, can_edit: bool} */
    private function entity(
        Request $request,
        string $type,
        int $record,
        bool $mustEdit,
    ): array {
        $organizationId = app(
            TenantContext::class,
        )->id();

        if ($type === 'party') {
            $model = Party::query()
                ->findOrFail($record);

            abort_unless(
                $request->user()->can(
                    $mustEdit
                        ? 'update'
                        : 'view',
                    $model,
                ),
                403,
            );

            return [
                'id' => $model->id,
                'can_edit' =>
                    $request->user()->can(
                        'update',
                        $model,
                    ),
            ];
        }

        if ($type === 'product') {
            $model = Product::query()
                ->findOrFail($record);

            abort_unless(
                $request->user()->can(
                    $mustEdit
                        ? 'update'
                        : 'view',
                    $model,
                ),
                403,
            );

            return [
                'id' => $model->id,
                'can_edit' =>
                    $request->user()->can(
                        'update',
                        $model,
                    ),
            ];
        }

        if ($type === 'staff') {
            $row = DB::table(
                'staff_members',
            )
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->where('id', $record)
                ->first();

            abort_unless(
                $row
                && (
                    StaffController::allowed(
                        $mustEdit
                            ? 'staff.manage'
                            : 'staff.view',
                    )
                    || StaffController::allowed(
                        $mustEdit
                            ? 'staff.team_manage'
                            : 'staff.team_view',
                    )
                ),
                403,
            );

            return [
                'id' => (int) $row->id,
                'can_edit' =>
                    StaffController::allowed(
                        'staff.manage',
                    )
                    || StaffController::allowed(
                        'staff.team_manage',
                    ),
            ];
        }

        $table = match ($type) {
            'task' => 'tasks',
            'project' => 'task_projects',
            default => null,
        };

        abort_unless(
            $table
            && Schema::hasTable(
                $table,
            ),
            404,
        );

        $row = DB::table($table)
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where('id', $record)
            ->first();

        abort_unless(
            $row,
            404,
        );

        $role = app(
            TenantContext::class,
        )->role();

        $canEdit = in_array(
            $role,
            [
                OrganizationRole::Owner,
                OrganizationRole::Admin,
                OrganizationRole::Manager,
            ],
            true,
        );

        abort_unless(
            ! $mustEdit
            || $canEdit,
            403,
        );

        return [
            'id' => (int) $row->id,
            'can_edit' => $canEdit,
        ];
    }

    private function tenantRow(
        string $table,
        int $id,
        int $organizationId,
    ): object {
        $row = DB::table($table)
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where('id', $id)
            ->first();

        abort_unless($row, 404);

        return $row;
    }

    private function authorizeSettings(): void
    {
        abort_unless(
            in_array(
                app(TenantContext::class)
                    ->role(),
                [
                    OrganizationRole::Owner,
                    OrganizationRole::Admin,
                ],
                true,
            ),
            403,
        );
    }
}
