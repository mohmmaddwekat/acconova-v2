<?php

namespace App\Http\Controllers\Account;

use App\Http\Controllers\Controller;
use App\Tenancy\OrganizationAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/**
 * Read-only profile of a colleague in the viewer's active workspace.
 * E-mail and phone are only exposed when their owner chose to show them.
 */
class PublicProfileController extends Controller
{
    public function show(Request $request, int $user): JsonResponse
    {
        $organizationId = $this->sharedOrganizationId($request, $user);

        $person = DB::table('users')->where('id', $user)
            ->first(['id', 'name', 'email', 'phone', 'job_title', 'bio', 'avatar_path', 'show_email', 'show_phone', 'created_at']);
        abort_if($person === null, 404);

        $membership = DB::table('memberships')->where('organization_id', $organizationId)->where('user_id', $user)->first(['role', 'created_at']);

        $hasPhone = trim((string) $person->phone) !== '';

        return response()->json([
            'id' => (int) $person->id,
            'name' => $person->name,
            'job_title' => $person->job_title,
            'bio' => $person->bio,
            'avatar_url' => $person->avatar_path ? route('profile.people.avatar', ['user' => $person->id]) : null,
            'organization' => DB::table('organizations')->where('id', $organizationId)->value('name'),
            'role' => $membership->role ?? null,
            'member_since' => $membership->created_at ?? $person->created_at,
            'is_online' => DB::table('workspace_user_presence')
                ->where('organization_id', $organizationId)->where('user_id', $user)
                ->where('last_seen_at', '>=', now()->subSeconds(45))->exists(),
            'email' => $person->show_email ? $person->email : null,
            'email_hidden' => ! $person->show_email,
            'phone' => $person->show_phone && $hasPhone ? $person->phone : null,
            'phone_hidden' => $hasPhone && ! $person->show_phone,
        ]);
    }

    public function avatar(Request $request, int $user): Response
    {
        $this->sharedOrganizationId($request, $user);

        $path = DB::table('users')->where('id', $user)->value('avatar_path');
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return response()->file(Storage::disk('local')->path($path), [
            'Cache-Control' => 'private, max-age=300',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /**
     * The viewer and the requested person must both belong to the viewer's
     * active workspace; anything else is reported as not found.
     */
    private function sharedOrganizationId(Request $request, int $user): int
    {
        $organizationId = (int) $request->session()->get(OrganizationAccess::SESSION_KEY);

        abort_if($organizationId <= 0, 404);

        $both = DB::table('memberships')->where('organization_id', $organizationId)
            ->whereIn('user_id', [(int) $request->user()->id, $user])->distinct()->count('user_id');

        abort_unless($both === (int) (((int) $request->user()->id) === $user ? 1 : 2), 404);

        return $organizationId;
    }
}
