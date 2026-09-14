<?php

namespace App\Models\Concerns;

use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use LogicException;

trait BelongsToOrganization
{
    protected static function bootBelongsToOrganization(): void
    {
        static::addGlobalScope('organization', function (Builder $query): void {
            $query->where($query->qualifyColumn('organization_id'), app(TenantContext::class)->id());
        });

        static::saving(function (Model $model): void {
            $tenantId = app(TenantContext::class)->id();
            if ($model->exists && (int) $model->getRawOriginal('organization_id') !== $tenantId) {
                throw new LogicException('Cannot save a record belonging to another organization.');
            }
            if ($model->organization_id !== null && (int) $model->organization_id !== $tenantId) {
                throw new LogicException('Cannot change a record organization.');
            }
            $model->organization_id = $tenantId;
        });

        static::deleting(function (Model $model): void {
            if ((int) $model->getRawOriginal('organization_id') !== app(TenantContext::class)->id()) {
                throw new LogicException('Cannot delete a record belonging to another organization.');
            }
        });
    }
}
