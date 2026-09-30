<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\StaffMember;
use App\Services\Staff\StaffMonthlyEntitlementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaffAutoAccrualController extends Controller
{
    /**
     * Return one employee ledger after synchronizing attendance-backed monthly
     * salary entitlement. Hour/day/piece salary entries are already generated
     * directly by attendance itself.
     */
    public function ledger(
        Request $request,
        string $staff,
        StaffController $staffController,
        StaffMonthlyEntitlementService $entitlements,
    ): JsonResponse {
        $member = StaffMember::findOrFail($staff);

        abort_unless(
            StaffController::canView($member),
            403,
        );

        $entitlements->syncMember(
            $member,
            (int) $request->user()->id,
        );

        return $staffController->ledger($request, $staff);
    }

    /**
     * Overview is a read endpoint and must stay cheap. Attendance writes and
     * individual ledger reads synchronize the affected employee; recalculating
     * every employee and every historical attendance period here made every page
     * load scale with the organization's complete payroll history.
     */
    public function overview(
        Request $request,
        StaffController $staffController,
    ): JsonResponse {
        return $staffController->overview($request);
    }
}
