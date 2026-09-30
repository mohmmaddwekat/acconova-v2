<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class StaffImportCommitController extends Controller
{
    public function __invoke(
        Request $request,
        StaffImportController $importer,
        StaffTransactionImportController $transactionImporter,
    ): JsonResponse {
        if ($request->input('type') === 'transactions') {
            return $transactionImporter($request);
        }

        if ($request->input('type') === 'payroll') {
            throw ValidationException::withMessages([
                'type' => [
                    'Salary entitlement import is disabled. AccoNova calculates salary/work and overtime from attendance and pay terms. Import manual transactions instead.',
                ],
            ]);
        }

        // Do not recalculate the entire organization's monthly payroll inside a large
        // attendance import request. Attendance-derived work/overtime rows are already
        // synchronized by the importer, while monthly entitlements are lazily refreshed
        // by the staff ledger/overview endpoints. Keeping that organization-wide pass
        // out of this request prevents large imports from hitting PHP's execution limit.
        return $importer->commit($request);
    }
}
