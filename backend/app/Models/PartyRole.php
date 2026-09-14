<?php

namespace App\Models;

use App\Enums\PartyRole as PartyRoleEnum;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class PartyRole extends Model
{
    protected $fillable = ['role'];

    protected $table = 'party_roles';

    protected static function booted(): void
    {
        static::addGlobalScope('organization', function (Builder $builder): void {
            $organizationId = app(TenantContext::class)->id();

            $builder->whereHas('party', function (Builder $partyQuery) use ($organizationId): void {
                $partyQuery->where('organization_id', $organizationId);
            });
        });

        static::saving(function (PartyRole $partyRole): void {
            $partyRole->assertPartyBelongsToCurrentOrganization();
        });

        static::deleting(function (PartyRole $partyRole): void {
            $partyRole->assertPartyBelongsToCurrentOrganization();
        });
    }

    protected function casts(): array
    {
        return [
            'role' => PartyRoleEnum::class,
        ];
    }

    public function party(): BelongsTo
    {
        return $this->belongsTo(Party::class);
    }

    private function assertPartyBelongsToCurrentOrganization(): void
    {
        if (! $this->party_id) {
            throw new LogicException('Party role must belong to a party.');
        }

        $organizationId = app(TenantContext::class)->id();

        $belongsToCurrentOrganization = Party::withTrashed()
            ->whereKey($this->party_id)
            ->where('organization_id', $organizationId)
            ->exists();

        if (! $belongsToCurrentOrganization) {
            throw new LogicException('Cannot modify a party role outside the current organization.');
        }
    }
}
