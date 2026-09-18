<?php

namespace App\Services;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class ConversationAdmins
{
    public function query(object $conversation): Builder
    {
        return DB::table('workspace_conversation_members as cm')
            ->join('memberships as membership', 'membership.user_id', '=', 'cm.user_id')
            ->where('membership.organization_id', $conversation->organization_id)
            ->where('cm.conversation_id', $conversation->id)
            ->whereRaw($conversation->kind === 'group' ? '1 = 1' : '1 = 0')
            ->where(fn (Builder $query): Builder => $query->where('cm.is_admin', true)->orWhere('cm.user_id', $conversation->created_by));
    }

    public function contains(object $conversation, int $userId): bool
    {
        return $this->query($conversation)->where('cm.user_id', $userId)->exists();
    }
}
