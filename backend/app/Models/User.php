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
use Laravel\Passport\Contracts\OAuthenticatable;
use Laravel\Passport\HasApiTokens;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements MustVerifyEmail, OAuthenticatable
{
    public const PLATFORM_ROLE_USER = 'user';

    public const PLATFORM_ROLE_ADMIN = 'admin';

    public const PLATFORM_ROLE_SUPER_ADMIN = 'super_admin';

    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Cast persisted authentication attributes into their application types.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'previous_login_at' => 'datetime',
            'last_login_at' => 'datetime',

            'password' => 'hashed',
        ];
    }

    /**
     * Determine whether this identity can administer the AccoNova platform.
     *
     * Platform roles intentionally live on users rather than memberships:
     * membership roles control one organization, while this role controls the
     * SaaS platform itself. The configured email list remains a temporary
     * backwards-compatible bootstrap path for existing installations.
     */
    public function isPlatformAdmin(): bool
    {
        if (in_array($this->platform_role, [
            self::PLATFORM_ROLE_ADMIN,
            self::PLATFORM_ROLE_SUPER_ADMIN,
        ], true)) {
            return true;
        }

        $email = strtolower(trim((string) $this->email));
        $legacyAdminEmails = array_values(array_filter(array_map(
            static fn ($value): string => strtolower(trim((string) $value)),
            (array) config('platform_admin.emails', []),
        )));

        return in_array($email, $legacyAdminEmails, true);
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
