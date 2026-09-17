<?php

namespace App\Http\Controllers;

use App\Services\MessageRestrictions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class WorkspaceMessageMemberController extends Controller
{
    private function conversation(Request $request, string $conversation, string $member): object
    {
        $row = DB::table('workspace_conversations')->where('organization_id', app(TenantContext::class)->id())->where('id', $conversation)->first();
        abort_unless($row, 404);
        foreach ([(int) $request->user()->id, (int) $member] as $userId) {
            abort_unless(DB::table('workspace_conversation_members')->where('conversation_id', $row->id)->where('user_id', $userId)->exists(), 404);
            abort_unless(DB::table('memberships')->where('organization_id', $row->organization_id)->where('user_id', $userId)->exists(), 404);
        }

        return $row;
    }

    public function show(Request $request, string $conversation, string $member, MessageRestrictions $restrictions): JsonResponse
    {
        $row = $this->conversation($request, $conversation, $member);
        $user = DB::table('users')->where('id', $member)->first(['id', 'name', 'job_title', 'bio', 'avatar_path']);
        $active = $restrictions->active((int) $row->organization_id)->where('user_id', $member);
        $direct = (clone $active)->where('scope', 'direct')->where('context_id', $request->user()->id)->first();
        $group = $row->kind === 'group' ? (clone $active)->where('scope', 'group')->where('context_id', $row->id)->first() : null;
        $serialize = static fn (?object $item): ?array => $item ? ['expires_at' => $item->expires_at ? Carbon::parse($item->expires_at)->toIso8601String() : null] : null;

        return response()->json(['id' => (int) $user->id, 'name' => $user->name, 'job_title' => $user->job_title, 'bio' => $user->bio,
            'avatar_url' => $user->avatar_path ? route('team-space.member-avatar', ['conversation' => $row->id, 'member' => $member]) : null,
            'can_mute_group' => $row->kind === 'group' && (int) $row->created_by === (int) $request->user()->id && (int) $member !== (int) $request->user()->id,
            'direct_block' => $serialize($direct), 'group_mute' => $serialize($group)]);
    }

    public function avatar(Request $request, string $conversation, string $member): StreamedResponse
    {
        $this->conversation($request, $conversation, $member);
        $path = DB::table('users')->where('id', $member)->value('avatar_path');
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response($path, null, ['Cache-Control' => 'private, max-age=300', 'X-Content-Type-Options' => 'nosniff']);
    }

    public function update(Request $request, string $conversation, string $member): JsonResponse
    {
        $row = $this->conversation($request, $conversation, $member);
        abort_if((int) $member === (int) $request->user()->id, 422);
        $data = $request->validate(['scope' => ['required', Rule::in(['group', 'direct'])], 'enabled' => ['required', 'boolean'],
            'expires_at' => ['nullable', 'date', 'after:now']]);
        if ($data['scope'] === 'group') {
            abort_unless($row->kind === 'group' && (int) $row->created_by === (int) $request->user()->id, 403);
        }
        $key = ['organization_id' => $row->organization_id, 'scope' => $data['scope'],
            'context_id' => $data['scope'] === 'group' ? $row->id : $request->user()->id, 'user_id' => (int) $member];
        if ($data['enabled']) {
            DB::table('workspace_message_restrictions')->upsert([$key + ['muted_by' => $request->user()->id,
                'expires_at' => isset($data['expires_at']) ? Carbon::parse($data['expires_at'])->utc()->format('Y-m-d H:i:s') : null,
                'created_at' => now(), 'updated_at' => now()]], array_keys($key), ['muted_by', 'expires_at', 'updated_at']);
        } else {
            DB::table('workspace_message_restrictions')->where($key)->delete();
        }

        return response()->json(['saved' => true]);
    }
}
