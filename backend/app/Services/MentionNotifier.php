<?php

namespace App\Services;

use App\Models\Membership;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class MentionNotifier
{
    public function notify(
        int $organizationId,
        User $actor,
        string $text,
        string $eventKey,
        string $url,
    ): void {
        $text = trim($text);

        if ($text === '' || ! str_contains($text, '@')) {
            return;
        }

        $members = Membership::withoutGlobalScopes()
            ->where('organization_id', $organizationId)
            ->with('user:id,name,email')
            ->get();

        foreach ($members as $membership) {
            $user = $membership->user;

            if (! $user || $user->id === $actor->id) {
                continue;
            }

            $firstName = trim(Str::before($user->name, ' '));

            $mentioned =
                Str::contains(
                    Str::lower($text),
                    Str::lower('@'.$user->name),
                )
                || (
                    $firstName !== ''
                    && Str::contains(
                        Str::lower($text),
                        Str::lower('@'.$firstName),
                    )
                );

            if (! $mentioned) {
                continue;
            }

            DB::table('workspace_notifications')->insertOrIgnore([
                'organization_id' => $organizationId,
                'user_id' => $user->id,
                'event_key' => 'mention:'.$eventKey.':'.$user->id,
                'kind' => 'mention',
                'category' => 'messages',
                'data' => json_encode([
                    'name' => $actor->name,
                    'detail' => Str::limit($text, 160),
                ], JSON_THROW_ON_ERROR),
                'url' => $url,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }
}
