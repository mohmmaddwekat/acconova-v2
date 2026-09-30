<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\StaffMember;
use App\Services\Staff\StaffMonthlyEntitlementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaffAttendanceSyncController extends Controller
{
    /**
     * Record attendance and immediately refresh attendance-backed salary.
     */
    public function store(
        Request $request,
        string $staff,
        StaffWorkforceController $workforce,
        StaffMonthlyEntitlementService $entitlements,
    ): JsonResponse {
        $response = $workforce->attendance($request, $staff);
        $member = StaffMember::findOrFail($staff);

        $entitlements->syncMember(
            $member,
            (int) $request->user()->id,
        );

        return $response;
    }

    /**
     * Correct or delete attendance and immediately recalculate salary.
     */
    public function correct(
        Request $request,
        string $staff,
        string $attendance,
        StaffCorrectionController $corrections,
        StaffWorkforceController $workforce,
        StaffMonthlyEntitlementService $entitlements,
    ): JsonResponse {
        $response = $corrections->attendance(
            $request,
            $staff,
            $attendance,
            $workforce,
        );
        $member = StaffMember::findOrFail($staff);

        $entitlements->syncMember(
            $member,
            (int) $request->user()->id,
        );

        return $response;
    }
}
