<?php

namespace Tests\Feature;

use App\Http\Middleware\ValidateCsrfToken;
use App\Models\Organization;
use App\Models\User;
use Database\Seeders\PassportMobileClientSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Laravel\Passport\Passport;
use ReflectionMethod;
use Tests\TestCase;

class MobileApiAccessTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Organization $organization;

    protected function setUp(): void
    {
        parent::setUp();

        if (! is_file(Passport::keyPath('oauth-private.key'))) {
            $this->artisan('passport:keys');
        }
        $this->seed(PassportMobileClientSeeder::class);

        $this->user = User::factory()->create(['password' => 'Secret-Passw0rd!']);
        $this->organization = Organization::create(['name' => 'Mobile Co']);
        $this->organization->users()->attach($this->user->id, ['role' => 'owner']);
    }

    /**
     * @return array<string, string>
     */
    private function bearer(User $user, string $tokenName = 'mobile'): array
    {
        return ['Authorization' => 'Bearer '.$user->createToken($tokenName)->accessToken];
    }

    public function test_login_returns_the_organizations_the_app_can_use(): void
    {
        $this->postJson('/api/mobile/login', [
            'email' => $this->user->email,
            'password' => 'Secret-Passw0rd!',
        ])
            ->assertOk()
            ->assertJsonPath('organizations.0.id', $this->organization->id)
            ->assertJsonPath('organizations.0.role', 'owner');
    }

    public function test_mobile_token_reads_business_data_in_the_default_organization(): void
    {
        $this->getJson('/api/parties', $this->bearer($this->user))
            ->assertOk();
    }

    public function test_mobile_token_can_write_without_a_csrf_token(): void
    {
        $this->postJson('/api/parties', [
            'type' => 'company',
            'company_name' => 'Mobile Customer',
            'roles' => ['customer'],
        ], $this->bearer($this->user))
            ->assertCreated();

        $this->assertDatabaseHas('parties', ['organization_id' => $this->organization->id]);
    }

    public function test_explicit_organization_header_selects_the_tenant(): void
    {
        $second = Organization::create(['name' => 'Second Co']);
        $second->users()->attach($this->user->id, ['role' => 'owner']);

        $this->postJson('/api/parties', [
            'type' => 'company',
            'company_name' => 'Second Customer',
            'roles' => ['customer'],
        ], $this->bearer($this->user) + ['X-Organization-Id' => (string) $second->id])
            ->assertCreated();

        $this->assertDatabaseHas('parties', ['organization_id' => $second->id]);
        $this->assertDatabaseMissing('parties', ['organization_id' => $this->organization->id]);
    }

    public function test_organization_header_for_a_non_member_workspace_is_rejected(): void
    {
        $foreign = Organization::create(['name' => 'Foreign Co']);

        $this->getJson('/api/parties', $this->bearer($this->user) + ['X-Organization-Id' => (string) $foreign->id])
            ->assertNotFound();
    }

    public function test_non_mobile_tokens_cannot_reach_the_business_api(): void
    {
        $this->getJson('/api/parties', $this->bearer($this->user, 'something-else'))
            ->assertUnauthorized();
    }

    public function test_requests_without_credentials_remain_unauthorized(): void
    {
        $this->getJson('/api/parties')->assertUnauthorized();
        $this->postJson('/api/parties', [])->assertUnauthorized();
    }

    public function test_only_mobile_token_requests_are_exempt_from_csrf(): void
    {
        $middleware = app(ValidateCsrfToken::class);
        $exempt = new ReflectionMethod($middleware, 'inExceptArray');

        $sessionRequest = Request::create('/api/parties', 'POST');
        $this->assertFalse($exempt->invoke($middleware, $sessionRequest));

        $tokenRequest = Request::create('/api/parties', 'POST');
        $tokenRequest->attributes->set('mobile_token_auth', true);
        $this->assertTrue($exempt->invoke($middleware, $tokenRequest));
    }
}
