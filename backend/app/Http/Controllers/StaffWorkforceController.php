<?php

namespace App\Http\Controllers;

use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Support\InventoryQuantity as Decimal;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StaffWorkforceController extends Controller
{
    public function index(Request $request, string $staff): JsonResponse
    {
        $member = StaffMember::findOrFail($staff);
        abort_unless(StaffController::allowed('staff.view') || $member->user_id === $request->user()->id || (StaffController::allowed('staff.team_view') && in_array((int) $member->department_id, StaffController::managedDepartmentIds(), true)), 403);

        return response()->json(['attendance' => DB::table('staff_attendances')->where('staff_member_id', $member->id)->orderByDesc('occurred_on')->paginate(20), 'adjustments' => DB::table('staff_adjustments')->where('staff_member_id', $member->id)->orderByDesc('starts_on')->get()]);
    }

    public function attendance(Request $request, string $staff): JsonResponse
    {
        $data = $request->validate(['occurred_on' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'], 'status' => ['required', Rule::in(['present', 'absent'])], 'quantity' => ['nullable', 'numeric', 'gt:0', 'max:9999', 'regex:/^\d+(\.\d{1,4})?$/'], 'overtime_hours' => ['required', 'numeric', 'min:0', 'max:24', 'regex:/^\d+(\.\d{1,4})?$/'], 'overtime_rate' => ['required', 'numeric', 'min:0', 'max:999999', 'regex:/^\d+(\.\d{1,4})?$/'], 'notes' => ['nullable', 'string', 'max:2000']]);
        DB::transaction(function () use ($staff, $data, $request): void {
            $member = StaffMember::lockForUpdate()->findOrFail($staff);
            abort_unless(StaffController::canPay($member), 403);
            abort_unless($member->active && $data['occurred_on'] >= substr((string) $member->started_on, 0, 10), 422);
            abort_if(DB::table('staff_attendances')->where('staff_member_id', $member->id)->whereDate('occurred_on', $data['occurred_on'])->exists(), 409);
            $terms = $this->termsAt($member, $data['occurred_on']);
            $basis = $terms['basis'];
            abort_unless($terms['active'] ?? true, 422);
            if ($basis !== 'month') {
                abort_if(StaffEntry::where('staff_member_id', $member->id)->where('kind', 'work')->whereDate('occurred_on', $data['occurred_on'])->exists(), 409);
            }
            $present = $data['status'] === 'present';
            $quantity = $present ? (in_array($basis, ['day', 'month'], true) ? '1' : (string) ($data['quantity'] ?? '0')) : '0';
            abort_if($present && Decimal::toUnits($quantity) <= 0, 422);
            abort_if($basis === 'hour' && Decimal::toUnits($quantity) + Decimal::toUnits($data['overtime_hours']) > 240000, 422);
            abort_if(! $present && Decimal::toUnits($data['overtime_hours']) > 0, 422);
            abort_if(Decimal::toUnits($data['overtime_hours']) > 0 && Decimal::toUnits($data['overtime_rate']) <= 0, 422);
            $id = DB::table('staff_attendances')->insertGetId([...$data, 'quantity' => $quantity, 'organization_id' => $member->organization_id, 'staff_member_id' => $member->id, 'created_by' => $request->user()->id, 'created_at' => now(), 'updated_at' => now()]);
            if ($present && $basis !== 'month') {
                $amount = intdiv(Decimal::toUnits($quantity) * Decimal::toUnits($terms['rate']) + 5000, 10000);
                $this->entry($member, 'work', $data['occurred_on'], $amount, $data['notes'] ?? 'Attendance', ['attendance_id' => $id, 'basis' => $basis], $quantity, (string) $terms['rate']);
            }
            if (Decimal::toUnits($data['overtime_hours']) > 0) {
                $amount = intdiv(Decimal::toUnits($data['overtime_hours']) * Decimal::toUnits($data['overtime_rate']) + 5000, 10000);
                $this->entry($member, 'overtime', $data['occurred_on'], $amount, $data['notes'] ?? 'Overtime', ['attendance_id' => $id], (string) $data['overtime_hours'], (string) $data['overtime_rate']);
            }
        });

        return response()->json(['saved' => true], 201);
    }

    public function adjustment(Request $request, string $staff): JsonResponse
    {
        $data = $request->validate(['label' => ['required', 'string', 'max:255'], 'kind' => ['required', Rule::in(['allowance', 'bonus', 'deduction'])], 'amount' => ['required', 'numeric', 'gt:0', 'max:999999999', 'regex:/^\d+(\.\d{1,4})?$/'], 'starts_on' => ['required', 'date_format:Y-m-d'], 'ends_on' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:starts_on']]);
        $id = DB::transaction(function () use ($data, $staff, $request): int {
            $member = StaffMember::lockForUpdate()->findOrFail($staff);
            abort_unless(StaffController::canPay($member), 403);
            abort_unless($member->active && $data['starts_on'] >= substr((string) $member->started_on, 0, 10), 422);

            return DB::table('staff_adjustments')->insertGetId([...$data, 'organization_id' => $member->organization_id, 'staff_member_id' => $member->id, 'created_by' => $request->user()->id, 'created_at' => now(), 'updated_at' => now()]);
        });

        return response()->json(['id' => $id], 201);
    }

    public function stopAdjustment(Request $request, string $staff, string $adjustment): JsonResponse
    {
        $data = $request->validate(['ends_on' => ['required', 'date_format:Y-m-d']]);
        DB::transaction(function () use ($staff, $adjustment, $data): void {
            $member = StaffMember::lockForUpdate()->findOrFail($staff);
            abort_unless(StaffController::canPay($member), 403);
            $rule = DB::table('staff_adjustments')->where('staff_member_id', $member->id)->where('id', $adjustment)->first();
            abort_unless($rule, 404);
            abort_if($data['ends_on'] < $rule->starts_on, 422);
            $last = StaffEntry::where('staff_member_id', $member->id)->where('terms->adjustment_id', (int) $adjustment)->max('occurred_on');
            abort_if($last && $data['ends_on'] < substr((string) $last, 0, 10), 422);
            DB::table('staff_adjustments')->where('id', $rule->id)->update(['ends_on' => $data['ends_on'], 'updated_at' => now()]);
        });

        return response()->json(['saved' => true]);
    }

    public function accrue(Request $request, string $staff): JsonResponse
    {
        $data = $request->validate(['through' => ['required', 'date_format:Y-m']]);
        $through = CarbonImmutable::createFromFormat('!Y-m', $data['through']);
        abort_unless($through->lt(today()->startOfMonth()), 422);
        $count = DB::transaction(function () use ($staff, $through): int {
            $member = StaffMember::lockForUpdate()->findOrFail($staff);
            abort_unless(StaffController::canPay($member), 403);
            abort_unless($member->active, 409);
            $count = 0;
            $history = StaffEntry::where('staff_member_id', $member->id)->where('kind', 'terms')->orderBy('occurred_on')->orderBy('id')->get();
            foreach (DB::table('staff_adjustments')->where('staff_member_id', $member->id)->get() as $rule) {
                $start = CarbonImmutable::parse($rule->starts_on)->startOfMonth();
                abort_if($start->diffInMonths($through, false) > 600, 422);
                for ($month = $start; $month->lte($through); $month = $month->addMonth()) {
                    $date = max($month->toDateString(), $rule->starts_on);
                    if ($rule->ends_on && $date > $rule->ends_on) {
                        continue;
                    }if (! ($this->termsAt($member, $date, $history)['active'] ?? true)) {
                        continue;
                    }if (StaffEntry::where('staff_member_id', $member->id)->where('terms->adjustment_id', $rule->id)->where('terms->period', $month->format('Y-m'))->exists()) {
                        continue;
                    }$amount = Decimal::toUnits($rule->amount) * ($rule->kind === 'deduction' ? -1 : 1);
                    $this->entry($member, $rule->kind, $date, $amount, $rule->label, ['adjustment_id' => $rule->id, 'period' => $month->format('Y-m')]);
                    $count++;
                }
            }

            return $count;
        });

        return response()->json(['created' => $count]);
    }

    /** @return array<string,mixed> */
    private function termsAt(StaffMember $member, string $date, ?Collection $history = null): array
    {
        $history ??= StaffEntry::where('staff_member_id', $member->id)->where('kind', 'terms')->orderBy('occurred_on')->orderBy('id')->get();
        $terms = $history->first()?->terms['before'] ?? $member->toArray();
        foreach ($history as $change) {
            if (substr((string) $change->occurred_on, 0, 10) <= $date) {
                $terms = $change->terms['after'];
            }
        }

        return $terms;
    }

    /** @param array<string,mixed> $terms */
    private function entry(StaffMember $member, string $kind, string $date, int $amount, string $notes, array $terms, ?string $quantity = null, ?string $rate = null): void
    {
        StaffEntry::create(['staff_member_id' => $member->id, 'created_by' => auth()->id(), 'request_id' => (string) Str::uuid(), 'kind' => $kind, 'occurred_on' => $date, 'amount' => Decimal::fromUnits($amount), 'quantity' => $quantity, 'rate' => $rate, 'notes' => $notes, 'terms' => [...$terms, 'currency' => $member->currency]]);
    }
}
