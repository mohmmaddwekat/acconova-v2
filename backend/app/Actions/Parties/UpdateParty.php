<?php

namespace App\Actions\Parties;

use App\Enums\PartyRole as PartyRoleEnum;
use App\Enums\PartyType;
use App\Events\PartyUpdated;
use App\Models\Party;
use App\Models\PartyRole;
use Illuminate\Support\Facades\DB;

class UpdateParty
{
    /**
     * Update Party details and optionally synchronize customer/supplier roles
     * inside one atomic transaction.
     *
     * @param  array<string, mixed>  $data
     */
    public function execute(
        Party $party,
        array $data,
    ): Party {
        return DB::transaction(function () use ($party, $data): Party {
            $record = Party::query()
                ->lockForUpdate()
                ->findOrFail($party->id);

            $roles = $data['roles'] ?? null;

            unset($data['roles']);

            /*
             * Changing Party type must clear the identity field belonging to
             * the previous type so stale person/company names never coexist.
             */
            if (array_key_exists('type', $data)) {
                if (in_array($data['type'], [PartyType::Person->value, PartyType::Other->value], true)) {
                    $data['company_name'] = null;
                } elseif ($data['type'] === PartyType::Company->value) {
                    $data['name'] = null;
                }
            }

            $record->update($data);

            $attributesChanged = $record->wasChanged();
            $rolesChanged = false;

            if (is_array($roles)) {
                $rolesChanged = $this->syncRoles(
                    $record,
                    $roles,
                );
            }

            if ($attributesChanged || $rolesChanged) {
                PartyUpdated::dispatch(
                    (int) $record->organization_id,
                    $record->id,
                );
            }

            return $record
                ->refresh()
                ->load('roles');
        });
    }

    /**
     * Synchronize Party roles without deleting and recreating unchanged role
     * rows, and report whether the effective role set changed.
     *
     * @param  list<string|PartyRoleEnum>  $roles
     */
    private function syncRoles(
        Party $party,
        array $roles,
    ): bool {
        $desiredRoles = collect($roles)
            ->map(
                fn ($role): string => $role instanceof PartyRoleEnum
                    ? $role->value
                    : (string) $role,
            )
            ->unique()
            ->sort()
            ->values();

        $currentRoles = $party->roles()
            ->get()
            ->map(
                fn (PartyRole $role): string => $role->role->value,
            )
            ->sort()
            ->values();

        if ($desiredRoles->all() === $currentRoles->all()) {
            return false;
        }

        $rolesToRemove = $currentRoles->diff(
            $desiredRoles,
        );

        if ($rolesToRemove->isNotEmpty()) {
            $party->roles()
                ->whereIn(
                    'role',
                    $rolesToRemove->all(),
                )
                ->get()
                ->each(
                    /**
                     * Delete each role as a model so tenant-protection model
                     * hooks continue to execute.
                     */
                    function (PartyRole $role): void {
                        $role->delete();
                    },
                );
        }

        $rolesToAdd = $desiredRoles->diff(
            $currentRoles,
        );

        foreach ($rolesToAdd as $role) {
            $party->roles()->create([
                'role' => $role,
            ]);
        }

        return true;
    }
}
