<?php

namespace App\Http\Controllers;

use App\Services\ConversationAdmins;
use App\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class WorkspaceConversationSettingsController extends Controller
{
    private function conversation(Request $request, string $conversation): object
    {
        $row = DB::table('workspace_conversations')->where('organization_id', app(TenantContext::class)->id())->where('id', $conversation)->first();
        abort_unless($row && DB::table('workspace_conversation_members')->where('conversation_id', $conversation)->where('user_id', $request->user()->id)->exists(), 404);

        return $row;
    }

    private function visibleMessages(Request $request, string $conversation): Builder
    {
        return DB::table('workspace_messages as m')->where('m.conversation_id', $conversation)->whereNull('m.deleted_at')
            ->whereNotExists(fn (Builder $query): Builder => $query->selectRaw('1')->from('workspace_message_user_hides as h')->whereColumn('h.message_id', 'm.id')->where('h.user_id', $request->user()->id));
    }

    public function show(Request $request, string $conversation): JsonResponse
    {
        $row = $this->conversation($request, $conversation);
        $member = DB::table('workspace_conversation_members')->where('conversation_id', $conversation)->where('user_id', $request->user()->id)->first();
        $isAdmin = app(ConversationAdmins::class)->contains($row, (int) $request->user()->id);
        $visible = $this->visibleMessages($request, $conversation);
        $muted = $member->notifications_muted && (! $member->notifications_muted_until || Carbon::parse($member->notifications_muted_until)->isFuture());

        return response()->json([
            'theme' => $row->theme, 'quick_reaction' => $row->quick_reaction,
            'can_customize' => $row->kind === 'direct' || $isAdmin,
            'avatar_url' => $row->avatar_path ? route('team-space.avatar', ['conversation' => $row->id, 'version' => strtotime($row->updated_at)]) : null,
            'notifications_muted' => $muted, 'notifications_muted_until' => $member->notifications_muted_until ? Carbon::parse($member->notifications_muted_until)->toIso8601String() : null,
            'read_receipts' => (bool) $member->read_receipts,
            'nicknames' => DB::table('workspace_conversation_members')->where('conversation_id', $conversation)->pluck('nickname', 'user_id'),
            'pins' => (clone $visible)->join('users as u', 'u.id', '=', 'm.user_id')->whereNotNull('m.pinned_at')->latest('m.pinned_at')->get(['m.id', 'm.body', 'u.name']),
            'reports' => $isAdmin ? DB::table('workspace_conversation_reports as r')->join('users as u', 'u.id', '=', 'r.user_id')->where('r.conversation_id', $conversation)->latest('r.id')->limit(50)->get(['r.id', 'r.reason', 'u.name', 'r.created_at']) : [],
        ]);
    }

    public function library(Request $request, string $conversation): JsonResponse
    {
        $this->conversation($request, $conversation);
        $data = $request->validate(['kind' => ['required', Rule::in(['media', 'files', 'links'])], 'page' => ['sometimes', 'integer', 'min:1']]);
        $query = $this->visibleMessages($request, $conversation);
        if ($data['kind'] === 'links') {
            $result = $query->where('m.body', 'like', '%http%')->latest('m.id')->select(['m.id', 'm.body'])->paginate(30);
        } else {
            $result = $query->join('workspace_message_attachments as a', 'a.message_id', '=', 'm.id')
                ->when($data['kind'] === 'media', fn (Builder $query): Builder => $query->whereIn('a.kind', ['image', 'video']))
                ->latest('a.id')->select(['a.id', 'a.kind', 'a.original_name as name', 'a.size'])->paginate(30);
            $result->through(fn (object $item): array => (array) $item + ['url' => url('/api/team-space/'.$conversation.'/messages').'?attachment='.$item->id]);
        }

        return response()->json($result);
    }

    public function avatar(Request $request, string $conversation): StreamedResponse
    {
        $row = $this->conversation($request, $conversation);
        abort_unless($row->avatar_path && Storage::disk('local')->exists($row->avatar_path), 404);

        return Storage::disk('local')->response($row->avatar_path, null, ['Cache-Control' => 'private, max-age=300']);
    }

    public function update(Request $request, string $conversation): JsonResponse
    {
        $row = $this->conversation($request, $conversation);
        $data = $request->validate(['action' => ['required', Rule::in(['name', 'avatar', 'theme', 'emoji', 'nickname', 'notifications', 'receipts', 'pin', 'report', 'leave'])]]);
        $action = $data['action'];
        $members = DB::table('workspace_conversation_members')->where('conversation_id', $conversation);
        $mine = (clone $members)->where('user_id', $request->user()->id);
        if (in_array($action, ['name', 'avatar'], true)) {
            abort_unless(app(ConversationAdmins::class)->contains($row, (int) $request->user()->id), 403);
        }
        if ($action === 'name') {
            $values = $request->validate(['name' => ['required', 'string', 'max:120']]);
            DB::table('workspace_conversations')->where('id', $conversation)->update(['name' => trim($values['name']), 'updated_at' => now()]);
        } elseif ($action === 'avatar') {
            $request->validate(['avatar' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048']]);
            $path = $request->file('avatar')->store('conversation-avatars', 'local');
            try {
                DB::table('workspace_conversations')->where('id', $conversation)->update(['avatar_path' => $path, 'updated_at' => now()]);
            } catch (\Throwable $exception) {
                Storage::disk('local')->delete($path);
                throw $exception;
            }
            if ($row->avatar_path) {
                Storage::disk('local')->delete($row->avatar_path);
            }
        } elseif ($action === 'theme' || $action === 'emoji') {
            $values = $request->validate(['value' => ['required', Rule::in($action === 'theme' ? ['green', 'blue', 'purple', 'rose', 'dark'] : ['👍', '❤️', '😂', '🎉', '😮', '😢'])]]);
            DB::table('workspace_conversations')->where('id', $conversation)->update([$action === 'theme' ? 'theme' : 'quick_reaction' => $values['value'], 'updated_at' => now()]);
        } elseif ($action === 'nickname') {
            $values = $request->validate(['user_id' => ['required', 'integer'], 'nickname' => ['nullable', 'string', 'max:80']]);
            abort_unless((clone $members)->where('user_id', $values['user_id'])->exists(), 404);
            (clone $members)->where('user_id', $values['user_id'])->update(['nickname' => $values['nickname'] ?? null]);
        } elseif ($action === 'notifications') {
            $values = $request->validate(['muted' => ['required', 'boolean'], 'until' => ['nullable', 'date', 'after:now']]);
            $mine->update(['notifications_muted' => $values['muted'], 'notifications_muted_until' => isset($values['until']) ? Carbon::parse($values['until'])->utc()->format('Y-m-d H:i:s') : null]);
        } elseif ($action === 'receipts') {
            $values = $request->validate(['enabled' => ['required', 'boolean']]);
            $mine->update(['read_receipts' => $values['enabled']]);
        } elseif ($action === 'pin') {
            $values = $request->validate(['message_id' => ['required', 'integer'], 'pinned' => ['required', 'boolean']]);
            $message = $this->visibleMessages($request, $conversation)->where('m.id', $values['message_id'])->first();
            abort_unless($message, 404);
            DB::table('workspace_messages')->where('id', $message->id)->update(['pinned_at' => $values['pinned'] ? now() : null]);
        } elseif ($action === 'report') {
            abort_unless($row->kind === 'group' && ! app(ConversationAdmins::class)->contains($row, (int) $request->user()->id), 422);
            $values = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:2000']]);
            DB::transaction(function () use ($values, $row, $request): void {
                $id = DB::table('workspace_conversation_reports')->insertGetId(['organization_id' => $row->organization_id, 'conversation_id' => $row->id, 'user_id' => $request->user()->id, 'reason' => $values['reason'], 'created_at' => now(), 'updated_at' => now()]);
                foreach (app(ConversationAdmins::class)->query($row)->pluck('cm.user_id') as $adminId) {
                    DB::table('workspace_notifications')->insert(['organization_id' => $row->organization_id, 'user_id' => $adminId, 'event_key' => 'conversation-report:'.$id,
                        'kind' => 'conversation_report', 'category' => 'messages', 'data' => json_encode(['name' => $request->user()->name, 'detail' => $row->name], JSON_THROW_ON_ERROR),
                        'url' => route('app.team-space', ['conversation' => $row->id, 'reports' => 1]), 'created_at' => now(), 'updated_at' => now()]);
                }
            });
        } elseif ($action === 'leave') {
            abort_unless($row->kind === 'group', 422);
            DB::transaction(function () use ($conversation, $request): void {
                $locked = DB::table('workspace_conversations')->where('id', $conversation)->lockForUpdate()->first();
                $next = DB::table('workspace_conversation_members')->where('conversation_id', $conversation)->where('user_id', '!=', $request->user()->id)->orderByDesc('is_admin')->orderBy('user_id')->value('user_id');
                if ((int) $locked->created_by === (int) $request->user()->id && $next) {
                    DB::table('workspace_conversations')->where('id', $conversation)->update(['created_by' => $next, 'updated_at' => now()]);
                }
                DB::table('workspace_conversation_members')->where('conversation_id', $conversation)->where('user_id', $request->user()->id)->delete();
                DB::table('workspace_notifications')->where('organization_id', $locked->organization_id)->where('user_id', $request->user()->id)->where('url', route('app.team-space', ['conversation' => $conversation]))->delete();
            });
        }

        return response()->json(['saved' => true]);
    }
}
