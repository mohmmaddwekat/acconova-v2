<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\StaffMember;
use App\Services\Staff\StaffAttendanceEntitlementRepairService;
use App\Services\Staff\StaffMonthlyEntitlementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaffEntitlementWorkforceController extends Controller
{
    /**
     * Refresh only the selected employee before building attendance/payroll rows.
     */
    public function __invoke(
        Request $request,
        string $staff,
        StaffAttendanceHistoryController $historyController,
        StaffAttendanceEntitlementRepairService $attendanceRepair,
        StaffMonthlyEntitlementService $monthlyEntitlements,
    ): JsonResponse {
        $member = StaffMember::findOrFail($staff);

        abort_unless(
            StaffController::canView($member),
            403,
        );

        $createdBy = (int) $request->user()->id;

        $attendanceRepair->repair(
            $member,
            $createdBy,
        );

        $monthlyEntitlements->syncMember(
            $member,
            $createdBy,
        );

        return $historyController($request, $staff);
    }
}
