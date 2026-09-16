<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Cast persisted authentication attributes into their application types.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',

            'password' => 'hashed',
        ];
    }

    /**
     * Return every organization membership belonging to this user.
     *
     * Membership discovery deliberately bypasses the active-tenant global
     * scope because choosing a tenant requires seeing the user's memberships
     * before a tenant has necessarily been selected.
     */
    public function memberships(): HasMany
    {
        $relation =
            $this->hasMany(
                Membership::class,
            );

        $relation
            ->getQuery()
            ->withoutGlobalScope(
                'organization',
            );

        return $relation;
    }

    /**
     * Return every organization the user is authorized to enter.
     */
    public function organizations(): BelongsToMany
    {
        return $this
            ->belongsToMany(
                Organization::class,
                'memberships',
            )
            ->withPivot(
                'role',
            )
            ->withTimestamps();
    }
}
