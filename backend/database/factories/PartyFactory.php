<?php

namespace Database\Factories;

use App\Enums\PartyType;
use App\Models\Party;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Party>
 */
class PartyFactory extends Factory
{
    public function definition(): array
    {
        $type = fake()->randomElement([
            PartyType::Person,
            PartyType::Company,
        ]);

        $organizationId = app(TenantContext::class)->id();

        return [
            'organization_id' => $organizationId,
            'type' => $type,
            'name' => $type === PartyType::Person ? fake()->name() : null,
            'company_name' => $type === PartyType::Company ? fake()->company() : null,
            'email' => fake()->unique()->safeEmail(),
            'phone' => fake()->phoneNumber(),
            'tax_number' => fake()->unique()->numerify('###########'),
            'address_line_1' => fake()->streetAddress(),
            'address_line_2' => fake()->optional(0.3)->secondaryAddress(),
            'city' => fake()->city(),
            'state' => fake()->state(),
            'postal_code' => fake()->postcode(),
            'country_code' => fake()->countryCode(),
        ];
    }

    public function person(): static
    {
        return $this->state(function (array $attributes) {
            return [
                'type' => PartyType::Person,
                'name' => fake()->name(),
                'company_name' => null,
            ];
        });
    }

    public function company(): static
    {
        return $this->state(function (array $attributes) {
            return [
                'type' => PartyType::Company,
                'name' => null,
                'company_name' => fake()->company(),
            ];
        });
    }
}
