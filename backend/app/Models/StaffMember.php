<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StaffMember extends Model
{
    use BelongsToOrganization;

    public function entries(): HasMany
    {
        return $this->hasMany(StaffEntry::class);
    }

    protected $guarded = ['id', 'organization_id'];

    protected function casts(): array
    {
        return ['rate' => 'decimal:4', 'monthly_allowance' => 'decimal:4', 'active' => 'boolean'];
    }
}
