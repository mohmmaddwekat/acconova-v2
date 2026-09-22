<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AppNavigationSmokeTest extends TestCase
{
    use RefreshDatabase;

    public function test_primary_app_routes_render_for_an_active_owner_workspace(): void
    {
        $owner = User::factory()->create();
        $organization = Organization::create(['name' => 'Navigation Smoke']);
        $organization->users()->attach($owner->id, ['role' => 'owner']);

        $this->actingAs($owner)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);

        foreach ([
            '/app',
            '/app/ai',
            '/app/parties',
            '/app/products',
            '/app/inventory',
            '/app/inventory/production',
            '/app/finance',
            '/app/roles',
            '/app/settings',
        ] as $path) {
            $this
                ->withHeader('X-Inertia', 'true')
                ->get($path)
                ->assertOk()
                ->assertHeader('X-Inertia', 'true');
        }
    }
}
