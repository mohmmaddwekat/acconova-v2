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

        return $importer->commit($request);
    }
}
