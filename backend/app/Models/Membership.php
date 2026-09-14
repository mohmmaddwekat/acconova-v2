<?php

namespace App\Models;

use App\Enums\OrganizationRole;
use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Membership extends Model
{
    use BelongsToOrganization;

    protected $fillable = ['user_id', 'role'];

    protected $hidden = ['owner_guard'];

    protected function casts(): array
    {
        return ['role' => OrganizationRole::class];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
