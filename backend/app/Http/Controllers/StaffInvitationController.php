<?php

namespace App\Http\Controllers;

use App\Models\Membership;
use App\Models\Organization;
use App\Models\StaffMember;
use App\Models\WorkspaceRole;
use App\Notifications\StaffInvitationNotification;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class StaffInvitationController extends Controller
{
    public function store(Request $request, string $staff): JsonResponse
    {
        abort_unless(app(TenantContext::class)->role()->value === 'owner', 403);
        $data = $request->validate(['email' => ['required', 'email', 'max:255'], 'workspace_role_id' => ['nullable', 'integer', Rule::exists('workspace_roles', 'id')->where('organization_id', app(TenantContext::class)->id())]]);
        $token = Str::random(64);
        DB::transaction(function () use ($staff, $data, $token): void {
            $member = StaffMember::lockForUpdate()->findOrFail($staff);
            abort_unless($member->active && ! $member->user_id, 409);
            DB::table('staff_invitations')->where('organization_id', $member->organization_id)->where('staff_member_id', $member->id)->whereNull('accepted_at')->delete();
            DB::table('staff_invitations')->insert(['organization_id' => $member->organization_id, 'staff_member_id' => $member->id, 'workspace_role_id' => $data['workspace_role_id'] ?? null, 'email' => strtolower(trim($data['email'])), 'token_hash' => hash('sha256', $token), 'expires_at' => now()->addDays(7), 'created_at' => now(), 'updated_at' => now()]);
        });

        $url = route('staff.invitation', ['token' => $token]);
        $payload = ['url' => $url, 'expires_in_days' => 7, 'email_sent' => false];
        $response = response()->json($payload, 201);
        $organizationName = app(TenantContext::class)->organization()->name;
        $locale = app()->getLocale();
        DB::afterCommit(function () use ($data, $url, $organizationName, $locale, $response, $payload): void {
            try {
                Notification::route('mail', strtolower(trim($data['email'])))->notify((new StaffInvitationNotification($url, $organizationName))->locale($locale));
                $response->setData([...$payload, 'email_sent' => true]);
            } catch (\Throwable $exception) {
                report($exception);
            }
        });

        return $response;
    }

    private function lookup(string $token): object
    {
        abort_unless(preg_match('/^[A-Za-z0-9]{64}$/', $token), 404);
        $invite = DB::table('staff_invitations')->where('token_hash', hash('sha256', $token))->whereNull('accepted_at')->where('expires_at', '>', now())->first();
        abort_unless($invite, 404);

        return $invite;
    }

    public function show(Request $request, string $token): Response
    {
        $invite = $this->lookup($token);
        $org = Organization::findOrFail($invite->organization_id);
        $staff = StaffMember::withoutGlobalScopes()->where('organization_id', $org->id)->findOrFail($invite->staff_member_id);
        abort_unless($staff->active && ! $staff->user_id, 404);
        $request->session()->put('staff_invitation_return', route('staff.invitation', ['token' => $token], false));

        return Inertia::render('StaffInvitation', ['invitation' => ['name' => $staff->name, 'email' => $invite->email, 'organization' => $org->name, 'token' => $token]]);
    }

    public function accept(Request $request, string $token): JsonResponse
    {
        $invite = $this->lookup($token);
        abort_unless(strtolower($request->user()->email) === $invite->email, 403);
        $organization = Organization::findOrFail($invite->organization_id);
        DB::transaction(function () use ($request, $invite, $organization): void {
            $row = DB::table('staff_invitations')->where('id', $invite->id)->lockForUpdate()->first();
            abort_unless($row && ! $row->accepted_at && $row->expires_at > now()->toDateTimeString(), 409);
            $staff = StaffMember::withoutGlobalScopes()->where('organization_id', $organization->id)->lockForUpdate()->findOrFail($row->staff_member_id);
            abort_unless($staff->active && ! $staff->user_id, 409);
            abort_if(StaffMember::withoutGlobalScopes()->where('organization_id', $organization->id)->where('user_id', $request->user()->id)->exists(), 409);
            $membership = Membership::withoutGlobalScopes()->where('organization_id', $organization->id)->where('user_id', $request->user()->id)->lockForUpdate()->first();
            abort_if($membership && $membership->role->value === 'owner', 403);
            $role = $row->workspace_role_id ? WorkspaceRole::withoutGlobalScopes()->where('organization_id', $organization->id)->findOrFail($row->workspace_role_id) : null;
            if ($membership) {
                DB::table('memberships')->where('id', $membership->id)->update(['role' => $role?->base_role ?? 'employee', 'workspace_role_id' => $role?->id, 'updated_at' => now()]);
            } else {
                DB::table('memberships')->insert(['organization_id' => $organization->id, 'user_id' => $request->user()->id, 'role' => $role?->base_role ?? 'employee', 'workspace_role_id' => $role?->id, 'created_at' => now(), 'updated_at' => now()]);
            }
            DB::table('staff_members')->where('id', $staff->id)->where('organization_id', $organization->id)->update(['user_id' => $request->user()->id, 'updated_at' => now()]);
            DB::table('staff_invitations')->where('id', $row->id)->update(['accepted_at' => now(), 'updated_at' => now()]);
        });
        $request->session()->put(OrganizationAccess::SESSION_KEY, $organization->id);
        $request->session()->forget('staff_invitation_return');

        return response()->json(['url' => route('app.staff')]);
    }
}
