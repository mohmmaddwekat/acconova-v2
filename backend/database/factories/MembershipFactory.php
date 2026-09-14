<?php

namespace Database\Factories;

use App\Enums\OrganizationRole;
use App\Models\Membership;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Membership>
 */
class MembershipFactory extends Factory
{
    protected $model = Membership::class;

    /**
     * Define a normal organization membership for tenant-aware tests.
     *
     * organization_id is intentionally omitted because the Membership model's
     * tenant protection assigns it from TenantContext during persistence.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'role' => OrganizationRole::Employee->value,
        ];
    }
}
