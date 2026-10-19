<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_colleague_profile_hides_email_and_phone_until_the_owner_shows_them(): void
    {
        [$viewer, $colleague] = $this->workspace();
        $colleague->forceFill(['phone' => '+962790000000', 'job_title' => 'Accountant', 'bio' => 'Closes the books.'])->save();

        $this->actingAs($viewer)->getJson("/api/profile/people/{$colleague->id}")
            ->assertOk()
            ->assertJsonPath('name', $colleague->name)
            ->assertJsonPath('job_title', 'Accountant')
            ->assertJsonPath('bio', 'Closes the books.')
            ->assertJsonPath('email', null)
            ->assertJsonPath('email_hidden', true)
            ->assertJsonPath('phone', null)
            ->assertJsonPath('phone_hidden', true);

        $this->actingAs($colleague)->patchJson('/api/profile/privacy', ['show_email' => true, 'show_phone' => true])
            ->assertOk()
            ->assertJsonPath('user.show_email', true)
            ->assertJsonPath('user.show_phone', true);

        $this->actingAs($viewer)->getJson("/api/profile/people/{$colleague->id}")
            ->assertOk()
            ->assertJsonPath('email', $colleague->email)
            ->assertJsonPath('phone', '+962790000000')
            ->assertJsonPath('email_hidden', false)
            ->assertJsonPath('phone_hidden', false);

        $this->actingAs($colleague)->patchJson('/api/profile/privacy', ['show_phone' => false])->assertOk();

        $this->actingAs($viewer)->getJson("/api/profile/people/{$colleague->id}")
            ->assertJsonPath('email', $colleague->email)
            ->assertJsonPath('phone', null)
            ->assertJsonPath('phone_hidden', true);
    }

    public function test_people_outside_the_active_workspace_are_not_found(): void
    {
        [$viewer] = $this->workspace();
        $stranger = User::factory()->create();

        $this->actingAs($viewer)->getJson("/api/profile/people/{$stranger->id}")->assertNotFound();
        $this->actingAs($viewer)->getJson('/api/profile/people/999999')->assertNotFound();
    }

    public function test_privacy_choices_must_be_booleans(): void
    {
        [$viewer] = $this->workspace();

        $this->actingAs($viewer)->patchJson('/api/profile/privacy', ['show_email' => 'maybe'])->assertUnprocessable();
    }

    /** @return array{User, User, Organization} */
    private function workspace(): array
    {
        $viewer = User::factory()->create();
        $colleague = User::factory()->create();
        $organization = Organization::create(['name' => 'Profile workspace']);
        $organization->users()->attach($viewer->id, ['role' => 'owner']);
        $organization->users()->attach($colleague->id, ['role' => 'employee']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $this->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        return [$viewer, $colleague, $organization];
    }
}
