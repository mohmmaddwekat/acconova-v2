<?php

namespace Tests\Feature\Actions\Organizations;

use App\Actions\Organizations\SwitchActiveOrganization;
use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use LogicException;
use Tests\TestCase;

class SwitchActiveOrganizationTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify organization membership and role are resolved correctly while
     * ensuring TenantContext is cleared after the action returns.
     */
    public function test_it_resolves_user_organization_and_clears_context(): void
    {
        $user = User::factory()->create();

        $organization = Organization::create([
            'name' => 'Selected Organization',
        ]);

        $organization->users()->attach(
            $user->id,
            [
                'role' => OrganizationRole::Manager->value,
            ],
        );

        $selection = app(
            SwitchActiveOrganization::class,
        )->execute(
            $user,
            $organization->id,
        );

        $this->assertTrue(
            $selection['organization']->is($organization),
        );

        $this->assertSame(
            OrganizationRole::Manager,
            $selection['role'],
        );

        $this->assertContextCleared();
    }

    /**
     * Verify that users cannot switch into organizations they do not belong
     * to and that failed resolution cannot leak tenant state.
     */
    public function test_it_rejects_foreign_organization_and_clears_context(): void
    {
        $user = User::factory()->create();

        $organization = Organization::create([
            'name' => 'Foreign Organization',
        ]);

        $owner = User::factory()->create();

        $organization->users()->attach(
            $owner->id,
            [
                'role' => OrganizationRole::Owner->value,
            ],
        );

        try {
            app(SwitchActiveOrganization::class)->execute(
                $user,
                $organization->id,
            );

            $this->fail(
                'Foreign organization selection was accepted.',
            );
        } catch (ModelNotFoundException) {
            $this->assertContextCleared();
        }
    }

    /**
     * Verify TenantContext has no active organization or role.
     */
    private function assertContextCleared(): void
    {
        foreach (['id', 'role'] as $method) {
            try {
                app(TenantContext::class)->{$method}();

                $this->fail(
                    'Tenant context leaked after organization selection.',
                );
            } catch (LogicException) {
                $this->assertTrue(true);
            }
        }
    }
}
