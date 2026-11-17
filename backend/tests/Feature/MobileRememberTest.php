<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Database\Seeders\PassportMobileClientSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Passport\Passport;
use Tests\TestCase;

class MobileRememberTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        if (! is_file(Passport::keyPath('oauth-private.key'))) {
            $this->artisan('passport:keys');
        }
        $this->seed(PassportMobileClientSeeder::class);

        $this->user = User::factory()->create(['password' => 'Secret-Passw0rd!']);
        $organization = Organization::create(['name' => 'Mobile Co']);
        $organization->users()->attach($this->user->id, ['role' => 'owner']);
    }

    public function test_mobile_login_keeps_the_user_signed_in_for_a_year_by_default(): void
    {
        $this->postJson('/api/mobile/login', $this->credentials())->assertOk()->assertJsonStructure(['token']);

        $this->assertTokenExpiresInDays(365);
    }

    public function test_mobile_login_without_remember_me_expires_after_one_day(): void
    {
        $this->postJson('/api/mobile/login', $this->credentials(['remember' => false]))->assertOk();

        $this->assertTokenExpiresInDays(1);
    }

    public function test_a_short_login_does_not_shorten_the_next_remembered_one(): void
    {
        $this->postJson('/api/mobile/login', $this->credentials(['remember' => false]))->assertOk();
        $this->postJson('/api/mobile/login', $this->credentials(['remember' => true]))->assertOk();

        $lifetimes = DB::table('oauth_access_tokens')->orderBy('id')->pluck('expires_at')
            ->map(fn ($expires) => (int) round(now()->diffInDays($expires)))->all();

        $this->assertSame([1, 365], $lifetimes);
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function credentials(array $extra = []): array
    {
        return ['email' => $this->user->email, 'password' => 'Secret-Passw0rd!', ...$extra];
    }

    private function assertTokenExpiresInDays(int $days): void
    {
        $expires = DB::table('oauth_access_tokens')->where('user_id', $this->user->id)->latest('id')->value('expires_at');

        $this->assertEqualsWithDelta($days, now()->diffInDays($expires), 1.0);
    }
}
