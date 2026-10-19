<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LiveDataVersionTest extends TestCase
{
    use RefreshDatabase;

    public function test_successful_writes_bump_only_their_own_organization_marker(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Live Org']);
        $other = Organization::create(['name' => 'Other Org']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        $other->users()->attach($user->id, ['role' => 'owner']);

        $this->actingAs($user)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);

        $before = $this->getJson('/api/live/version')
            ->assertOk()
            ->json('version');

        $write = $this->postJson('/api/parties', [
            'type' => 'other',
            'name' => 'Live supplier',
            'roles' => ['supplier'],
        ])->assertCreated();

        $version = $write->headers->get('X-Data-Version');

        $this->assertNotNull($version);
        $this->assertNotSame($before, $version);

        $this->getJson('/api/live/version')
            ->assertOk()
            ->assertJsonPath('version', $version);

        $this->postJson('/api/parties', [
            'type' => 'other',
            'name' => '',
            'roles' => ['supplier'],
        ])->assertUnprocessable();

        $this->getJson('/api/live/version')
            ->assertJsonPath('version', $version);

        $this->withSession([OrganizationAccess::SESSION_KEY => $other->id])
            ->getJson('/api/live/version')
            ->assertOk()
            ->assertJsonPath('version', '0');
    }
}
