<?php

namespace App\Models;

use App\Enums\OrganizationRole;
use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\MembershipFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Membership extends Model
{
    /** @use HasFactory<MembershipFactory> */
    use BelongsToOrganization, HasFactory;

    protected $fillable = ['user_id', 'role'];

    protected $hidden = ['owner_guard'];

    /**
     * Cast the stored membership role into the OrganizationRole enum.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'role' => OrganizationRole::class,
        ];
    }

    /**
     * Return the user represented by this organization membership.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
