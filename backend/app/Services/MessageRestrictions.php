<?php

namespace App\Services;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class MessageRestrictions
{
    public function active(int $organizationId): Builder
    {
        return DB::table('workspace_message_restrictions')->where('organization_id', $organizationId)
            ->where(fn (Builder $query): Builder => $query->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }

    /** @return array{scope: string, by: string, expires_at: ?string}|null */
    public function forSender(object $conversation, int $userId): ?array
    {
        $query = $this->active((int) $conversation->organization_id)->where('user_id', $userId);
        if ($conversation->kind === 'group') {
            $query->where('scope', 'group')->where('context_id', $conversation->id);
        } else {
            $recipients = DB::table('workspace_conversation_members')->where('conversation_id', $conversation->id)
                ->where('user_id', '!=', $userId)->pluck('user_id');
            $query->where('scope', 'direct')->whereIn('context_id', $recipients);
        }
        $restriction = $query->first();
        if (! $restriction) {
            return null;
        }

        return ['scope' => $restriction->scope, 'by' => (string) DB::table('users')->where('id', $restriction->muted_by)->value('name'),
            'expires_at' => $restriction->expires_at ? Carbon::parse($restriction->expires_at)->toIso8601String() : null];
    }
}
