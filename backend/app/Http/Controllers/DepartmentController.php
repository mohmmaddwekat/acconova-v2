<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\StaffMember;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DepartmentController extends Controller
{
    public function index(): JsonResponse
    {
        abort_unless(StaffController::allowed('staff.view') || StaffController::allowed('staff.team_view'), 403);

        return response()->json(['departments' => Department::when(! StaffController::allowed('staff.view'), fn ($query) => $query->whereIn('id', StaffController::managedDepartmentIds()))->orderBy('name')->get(), 'staff' => StaffMember::when(! StaffController::allowed('staff.view'), fn ($query) => $query->whereIn('department_id', StaffController::managedDepartmentIds()))->orderBy('name')->get(['id', 'name', 'department_id', 'active']), 'can_manage' => StaffController::allowed('staff.manage')]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless(StaffController::allowed('staff.manage'), 403);
        $data = $request->validate(['name' => ['required', 'string', 'max:100', Rule::unique('departments', 'name')->where('organization_id', app(TenantContext::class)->id())]]);

        return response()->json(['data' => Department::create($data)], 201);
    }

    public function update(Request $request, string $department): JsonResponse
    {
        abort_unless(StaffController::allowed('staff.manage'), 403);
        $data = $request->validate(['name' => ['required', 'string', 'max:100', Rule::unique('departments', 'name')->where('organization_id', app(TenantContext::class)->id())->ignore($department)], 'manager_id' => ['nullable', 'integer', Rule::exists('staff_members', 'id')->where('organization_id', app(TenantContext::class)->id())->where('active', true)]]);
        $item = DB::transaction(function () use ($department, $data): Department {
            $manager = ! empty($data['manager_id']) ? StaffMember::lockForUpdate()->findOrFail($data['manager_id']) : null;
            $item = Department::lockForUpdate()->findOrFail($department);
            if ($manager) {
                abort_unless((int) $manager->department_id === $item->id, 422);
            }
            $item->update($data);

            return $item;
        });

        return response()->json(['data' => $item]);
    }
}
