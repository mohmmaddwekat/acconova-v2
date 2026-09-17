<?php

namespace App\Http\Controllers;

use App\Http\Requests\RecordPaymentRequest;
use App\Http\Requests\StorePaymentPlanRequest;
use App\Http\Resources\PaymentPlanResource;
use App\Http\Resources\PaymentRecordResource;
use App\Models\PaymentPlan;
use App\Models\PaymentRecord;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class PaymentPlanController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', PaymentPlan::class);
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'direction' => ['nullable', Rule::in(['incoming', 'outgoing'])],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        return PaymentPlanResource::collection(PaymentPlan::query()->withCount('records')
            ->where('active', ($data['status'] ?? 'active') === 'active')
            ->when($data['direction'] ?? null, fn ($query, $direction) => $query->where('direction', $direction))
            ->orderBy('next_due_on')->orderBy('id')->paginate(20));
    }

    public function store(StorePaymentPlanRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['interval_count'] = $data['frequency'] === 'once' ? 1 : ($data['interval_count'] ?? 1);
        $data['anchor_day'] = CarbonImmutable::parse($data['next_due_on'])->day;

        return (new PaymentPlanResource(PaymentPlan::create($data)))->response()->setStatusCode(201);
    }

    public function toggle(Request $request, string $plan): PaymentPlanResource
    {
        $data = $request->validate(['active' => ['required', 'boolean']]);
        $updated = DB::transaction(function () use ($plan, $data): PaymentPlan {
            $item = PaymentPlan::query()->lockForUpdate()->findOrFail($plan);
            Gate::authorize('update', $item);
            abort_if($data['active'] && $item->frequency === 'once' && PaymentRecord::where('payment_plan_id', $item->id)->exists(), 409);
            $item->update($data);

            return $item;
        });

        return new PaymentPlanResource($updated);
    }

    /** Recording is manual; no external money transfer is performed. */
    public function record(RecordPaymentRequest $request, string $plan): JsonResponse
    {
        $record = DB::transaction(function () use ($request, $plan): PaymentRecord {
            $item = PaymentPlan::query()->lockForUpdate()->findOrFail($plan);
            $data = $request->validated();
            abort_unless($item->active && $item->next_due_on->format('Y-m-d') === $data['due_on'], 409);
            $record = PaymentRecord::create([
                ...$data, 'payment_plan_id' => $item->id, 'created_by' => $request->user()->id,
                'title' => $item->title, 'direction' => $item->direction, 'currency' => $item->currency,
            ]);
            $due = CarbonImmutable::parse($data['due_on']);
            if ($item->frequency === 'once') {
                $item->active = false;
            } elseif ($item->frequency === 'daily') {
                $item->next_due_on = $due->addDays($item->interval_count);
            } elseif ($item->frequency === 'weekly') {
                $item->next_due_on = $due->addWeeks($item->interval_count);
            } else {
                $next = $item->frequency === 'monthly' ? $due->startOfMonth()->addMonths($item->interval_count) : $due->startOfMonth()->addYears($item->interval_count);
                $item->next_due_on = $next->day(min($item->anchor_day, $next->daysInMonth));
            }
            $item->save();

            return $record;
        }, 3);

        return (new PaymentRecordResource($record))->response()->setStatusCode(201);
    }

    public function history(Request $request): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', PaymentPlan::class);
        $request->validate(['page' => ['sometimes', 'integer', 'min:1']]);

        return PaymentRecordResource::collection(PaymentRecord::query()->latest('paid_on')->latest('id')->paginate(20));
    }

    public function reminders(): JsonResponse
    {
        Gate::authorize('viewAny', PaymentPlan::class);
        $items = PaymentPlan::where('active', true)->whereDate('next_due_on', '<=', today()->addDays(30))
            ->get()->filter(fn (PaymentPlan $plan): bool => $plan->next_due_on->lte(today()->addDays($plan->reminder_days)));

        return response()->json(['count' => $items->count(), 'url' => route('app.payments')]);
    }
}
