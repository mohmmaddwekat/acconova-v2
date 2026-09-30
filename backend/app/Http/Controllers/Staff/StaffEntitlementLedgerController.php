<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\StaffMember;
use App\Services\Staff\StaffAttendanceEntitlementRepairService;
use App\Services\Staff\StaffMonthlyEntitlementService;
use App\Services\Staff\StaffPayrollSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaffEntitlementLedgerController extends Controller
{
    /**
     * Recalculate one employee's entitlement before returning the ledger.
     *
     * Keeping this synchronization on the focused employee endpoint avoids the
     * organization-wide work that previously made Staff list/overview reads slow,
     * while still guaranteeing that all four pay bases are correct when payroll
     * details are opened.
     */
    public function __invoke(
        Request $request,
        string $staff,
        StaffController $staffController,
        StaffAttendanceEntitlementRepairService $attendanceRepair,
        StaffMonthlyEntitlementService $monthlyEntitlements,
        StaffPayrollSummaryService $payrollSummary,
    ): JsonResponse {
        $member = StaffMember::findOrFail($staff);

        abort_unless(
            StaffController::canView($member),
            403,
        );

        $createdBy = (int) $request->user()->id;

        /*
         * Hour/day/piece attendance is rebuilt from attendance quantity plus the
         * compensation terms effective on that date. The repair service also
         * normalizes a daily employee to exactly one paid day per present date.
         */
        $attendanceRepair->repair(
            $member,
            $createdBy,
        );

        /*
         * Monthly employees are calculated separately because salary is earned
         * across the month and explicit absences prorate the monthly amount.
         */
        $monthlyEntitlements->syncMember(
            $member,
            $createdBy,
        );

        $member->refresh();
        $summary = $payrollSummary->summarize($member);
        $response = $staffController->ledger($request, $staff);
        $payload = $response->getData(true);

        $payload['member'] = [
            ...($payload['member'] ?? []),
            'payroll_summary' => $summary,
        ];
        $payload['balance'] = $summary['remaining'];

        $response->setData($payload);

        return $response;
    }
}
