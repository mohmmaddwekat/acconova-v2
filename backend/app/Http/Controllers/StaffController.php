<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Membership;
use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Models\WorkspaceRole;
use App\Support\InventoryQuantity as Decimal;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StaffController extends Controller
{
    public static function allowed(string $permission): bool
    {
        if (in_array(app(TenantContext::class)->role()->value, ['owner', 'admin'], true)) {
            return true;
        }
        $membership = Membership::where('user_id', auth()->id())->first();
        $role = $membership?->workspace_role_id ? WorkspaceRole::find($membership->workspace_role_id) : null;

        return $role && $role->base_role === $membership->role->value && in_array($permission, $role->permissions, true);
    }

    public function index(Request $request): JsonResponse
    {
        $query = StaffMember::query();
        if (! self::allowed('staff.view')) {
            $query->where('user_id', $request->user()->id);
        }
        $query->withSum(['entries as balance' => fn ($query) => $query->where('kind', '!=', 'terms')], 'amount');

        return response()->json(['data' => $query->orderBy('name')->paginate(30), 'can_view' => self::allowed('staff.view'), 'can_manage' => self::allowed('staff.manage'), 'can_pay' => self::allowed('staff.pay'),
            'currency' => app(TenantContext::class)->organization()->preferences['currency'] ?? 'ILS',
            'departments' => Department::orderBy('name')->get(['id', 'name', 'manager_id']),
            'accounts' => self::allowed('staff.manage') ? Membership::with('user:id,name,email')->get()->map(fn (Membership $member): array => ['id' => $member->user_id, 'name' => $member->user->name, 'email' => $member->user->email]) : [],
        ]);
    }

    private function rules(): array
    {
        return ['name' => ['required', 'string', 'max:255'], 'job_title' => ['nullable', 'string', 'max:255'], 'phone' => ['nullable', 'string', 'max:50'],
            'user_id' => ['nullable', 'integer', Rule::exists('memberships', 'user_id')->where('organization_id', app(TenantContext::class)->id()), Rule::unique('staff_members', 'user_id')->where('organization_id', app(TenantContext::class)->id())->ignore(request()->route('staff'))],
            'department_id' => ['nullable', 'integer', Rule::exists('departments', 'id')->where('organization_id', app(TenantContext::class)->id())],
            'basis' => ['required', Rule::in(['hour', 'day', 'month', 'piece'])], 'unit' => ['nullable', 'string', 'max:50'], 'rate' => ['required', 'numeric', 'min:0', 'max:999999', 'regex:/^\d+(\.\d{1,4})?$/'],
            'monthly_allowance' => ['required', 'numeric', 'min:0', 'max:999999', 'regex:/^\d+(\.\d{1,4})?$/'], 'currency' => ['required', 'regex:/^[A-Z]{3}$/'], 'started_on' => ['required', 'date_format:Y-m-d'], 'active' => ['sometimes', 'boolean']];
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless(self::allowed('staff.manage'), 403);
        $request->merge(['currency' => app(TenantContext::class)->organization()->preferences['currency'] ?? 'ILS']);
        $data = $request->validate($this->rules());
        $member = StaffMember::create($data);

        return response()->json(['data' => $member], 201);
    }

    public function update(Request $request, string $staff): JsonResponse
    {
        abort_unless(self::allowed('staff.manage'), 403);
        $existing = StaffMember::findOrFail($staff);
        $request->merge(['currency' => $existing->currency]);
        $data = $request->validate($this->rules());
        $member = DB::transaction(function () use ($staff, $data, $request): StaffMember {
            $member = StaffMember::lockForUpdate()->findOrFail($staff);
            abort_if($data['currency'] !== $member->currency && StaffEntry::where('staff_member_id', $member->id)->exists(), 422);
            if ((isset($data['active']) && ! $data['active']) || array_key_exists('department_id', $data) && (int) $data['department_id'] !== (int) $member->department_id) {
                Department::where('manager_id', $member->id)->update(['manager_id' => null]);
            }
            $before = $member->toArray();
            $member->update($data);
            StaffEntry::create(['staff_member_id' => $member->id, 'created_by' => $request->user()->id, 'request_id' => (string) Str::uuid(), 'kind' => 'terms', 'occurred_on' => today()->toDateString(), 'amount' => 0, 'terms' => ['before' => $before, 'after' => $member->toArray()]]);

            return $member;
        });

        return response()->json(['data' => $member]);
    }

    public function ledger(Request $request, string $staff): JsonResponse
    {
        $member = StaffMember::findOrFail($staff);
        abort_unless(self::allowed('staff.view') || $member->user_id === $request->user()->id, 403);
        $entries = StaffEntry::where('staff_member_id', $member->id);
        $totals = (clone $entries)->selectRaw('kind, SUM(amount) as amount')->groupBy('kind')->pluck('amount', 'kind');

        return response()->json(['member' => $member, 'totals' => $totals, 'balance' => (string) (clone $entries)->sum('amount'), 'entries' => $entries->latest('occurred_on')->latest('id')->paginate(30)]);
    }

    public function record(Request $request, string $staff): JsonResponse
    {
        abort_unless(self::allowed('staff.pay'), 403);
        $data = $request->validate(['request_id' => ['required', 'uuid'], 'kind' => ['required', Rule::in(['work', 'bonus', 'allowance', 'monthly_allowance', 'deduction', 'payment'])], 'occurred_on' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'quantity' => ['required_if:kind,work', 'nullable', 'numeric', 'gt:0', 'max:9999', 'regex:/^\d+(\.\d{1,4})?$/'], 'amount' => ['required_unless:kind,work,monthly_allowance', 'nullable', 'numeric', 'gt:0', 'max:999999999', 'regex:/^\d+(\.\d{1,4})?$/'], 'notes' => ['required', 'string', 'max:2000']]);
        $entry = DB::transaction(function () use ($request, $staff, $data): StaffEntry {
            $member = StaffMember::lockForUpdate()->findOrFail($staff);
            abort_if(! $member->active && in_array($data['kind'], ['work', 'monthly_allowance'], true), 409);
            abort_if(StaffEntry::where('request_id', $data['request_id'])->exists(), 409);
            if ($data['kind'] === 'monthly_allowance' || ($data['kind'] === 'work' && $member->basis === 'month')) {
                abort_unless(substr($data['occurred_on'], 8, 2) === '01', 422);
                abort_if(StaffEntry::where('staff_member_id', $member->id)->where('kind', $data['kind'])->whereDate('occurred_on', $data['occurred_on'])->exists(), 409);
                if ($data['kind'] === 'work') {
                    abort_unless(Decimal::toUnits($data['quantity']) === 10000, 422);
                }
            }
            $amount = $data['kind'] === 'work' ? intdiv(Decimal::toUnits($data['quantity']) * Decimal::toUnits($member->rate) + 5000, 10000) : ($data['kind'] === 'monthly_allowance' ? Decimal::toUnits($member->monthly_allowance) : Decimal::toUnits($data['amount']));
            abort_if($amount <= 0, 422);
            if (in_array($data['kind'], ['deduction', 'payment'], true)) {
                $amount = -$amount;
            }

            return StaffEntry::create([...$data, 'amount' => Decimal::fromUnits($amount), 'quantity' => $data['kind'] === 'work' ? $data['quantity'] : null, 'rate' => $data['kind'] === 'work' ? $member->rate : null, 'staff_member_id' => $member->id, 'created_by' => $request->user()->id, 'terms' => ['basis' => $member->basis, 'unit' => $member->unit, 'currency' => $member->currency, 'monthly_allowance' => $member->monthly_allowance]]);
        });

        return response()->json(['data' => $entry], 201);
    }
}
