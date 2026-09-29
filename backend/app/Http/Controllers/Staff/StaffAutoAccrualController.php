<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\StaffMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaffAutoAccrualController extends Controller
{
    /**
     * Return one employee ledger after making sure fixed monthly salary periods
     * through the previous completed month exist.
     */
    public function ledger(
        Request $request,
        string $staff,
        StaffController $staffController,
    ): JsonResponse {
        $member = StaffMember::findOrFail($staff);

        if (
            $member->active
            && $member->basis === 'month'
            && StaffController::canPay($member)
        ) {
            $this->accrueMember($request, $staffController, $member);
        }

        return $staffController->ledger($request, $staff);
    }

    /**
     * Return staff overview after auto-accruing monthly employees the current
     * user is allowed to pay. Hour/day/piece employees are already accrued by
     * attendance itself.
     */
    public function overview(
        Request $request,
        StaffController $staffController,
    ): JsonResponse {
        StaffMember::query()
            ->where('active', true)
            ->where('basis', 'month')
            ->orderBy('id')
            ->each(function (StaffMember $member) use ($request, $staffController): void {
                if (StaffController::canPay($member)) {
                    $this->accrueMember($request, $staffController, $member);
                }
            });

        return $staffController->overview($request);
    }

    private function accrueMember(
        Request $request,
        StaffController $staffController,
        StaffMember $member,
    ): void {
        $through = today()->startOfMonth()->subMonth()->format('Y-m');
        $accrualRequest = clone $request;
        $accrualRequest->merge([
            'through' => $through,
        ]);

        $staffController->accrue(
            $accrualRequest,
            (string) $member->id,
        );
    }
}
