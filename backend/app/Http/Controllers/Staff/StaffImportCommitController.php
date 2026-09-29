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
    ): JsonResponse {
        if ($request->input('type') === 'payroll') {
            throw ValidationException::withMessages([
                'type' => [
                    'Payroll entitlement import is disabled. AccoNova calculates salary entitlement from attendance and pay terms; record only payments, deductions, bonuses, allowances and advances manually.',
                ],
            ]);
        }

        return $importer->commit($request);
    }
}
