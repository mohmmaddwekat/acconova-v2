<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Services\Finance\AutoAllocationService;
use App\Services\Finance\FinanceAuthorization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AutoAllocationController extends Controller
{
    public function index(Request $request, AutoAllocationService $service): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.cash.view');

        $data = $request->validate([
            'kind' => ['nullable', Rule::in(['sale', 'purchase'])],
        ]);

        return response()->json([
            'data' => $service->movementRows($data['kind'] ?? null),
        ]);
    }

    public function preview(Request $request, AutoAllocationService $service): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.cash.view');

        $data = $this->validated($request, 10000);

        return response()->json([
            'data' => $service->plan(
                $data['movement_ids'] ?? null,
                $data['kind'] ?? null,
                (bool) ($data['continue_newer'] ?? false),
            ),
        ]);
    }

    public function apply(Request $request, AutoAllocationService $service): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.documents.apply_credit');

        $data = $this->validated($request, 500);

        $plan = $service->plan(
            $data['movement_ids'] ?? null,
            $data['kind'] ?? null,
            (bool) ($data['continue_newer'] ?? false),
        );

        $kinds = collect($plan)
            ->filter(fn (array $result): bool => $result['lines'] !== [])
            ->pluck('movement.kind')
            ->unique();

        if ($kinds->contains('sale')) {
            FinanceAuthorization::authorize($request->user(), 'finance.cash.receive');
        }

        if ($kinds->contains('purchase')) {
            FinanceAuthorization::authorize($request->user(), 'finance.cash.pay');
        }

        return response()->json([
            'data' => $service->apply($plan, $request->user()->id),
        ]);
    }

    /**
     * @return array{movement_ids?: list<int>, kind?: string|null, continue_newer?: bool}
     */
    private function validated(Request $request, int $maxMovements): array
    {
        return $request->validate([
            'movement_ids' => ['nullable', 'array', 'max:'.$maxMovements],
            'movement_ids.*' => ['integer'],
            'kind' => ['nullable', Rule::in(['sale', 'purchase'])],
            'continue_newer' => ['nullable', 'boolean'],
        ]);
    }
}
