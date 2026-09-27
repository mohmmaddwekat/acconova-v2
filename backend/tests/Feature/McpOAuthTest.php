<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Services\Mcp\McpTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Passport\Passport;
use Tests\TestCase;

class McpOAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_mcp_oauth_discovery_advertises_pkce_registration_and_scope(): void
    {
        $this->getJson('/.well-known/oauth-authorization-server')
            ->assertOk()
            ->assertJsonPath('authorization_endpoint', url('/oauth/authorize'))
            ->assertJsonPath('token_endpoint', url('/oauth/token'))
            ->assertJsonPath('registration_endpoint', url('/oauth/register'))
            ->assertJsonPath('code_challenge_methods_supported.0', 'S256')
            ->assertJsonPath('scopes_supported.0', 'mcp:use');
    }

    public function test_unauthenticated_oauth_protocol_request_returns_mcp_oauth_challenge(): void
    {
        $connectionId = (string) Str::uuid();

        $response = $this->postJson('/mcp/oauth/'.$connectionId, $this->payload('ping'));

        $response->assertUnauthorized();
        $this->assertStringContainsString('Bearer realm="mcp"', (string) $response->headers->get('WWW-Authenticate'));
        $this->assertStringContainsString('resource_metadata=', (string) $response->headers->get('WWW-Authenticate'));
    }

    public function test_oauth_protocol_uses_bound_workspace_and_shadow_token_scope(): void
    {
        [$user, $organization] = $this->workspace();
        $connection = $this->connection($organization, $user, 'read', ['business.morning_brief']);

        Passport::actingAs($user, ['mcp:use']);

        $response = $this->postJson(
            '/mcp/oauth/'.$connection['public_id'],
            $this->payload('tools/list'),
            ['MCP-Protocol-Version' => '2025-11-25'],
        )->assertOk();

        $names = collect($response->json('result.tools'))->pluck('name')->all();

        $this->assertContains('business.morning_brief', $names);
        $this->assertNotContains('business.ceo_snapshot', $names);
        $this->assertNotContains('invoices.create_draft', $names);

        $this->assertDatabaseHas('mcp_oauth_connections', [
            'id' => $connection['id'],
            'organization_id' => $organization->id,
            'user_id' => $user->id,
        ]);
        $this->assertNotNull(DB::table('mcp_oauth_connections')->where('id', $connection['id'])->value('last_used_at'));
    }

    public function test_oauth_connection_cannot_be_used_by_another_authenticated_user(): void
    {
        [$owner, $organization] = $this->workspace();
        $connection = $this->connection($organization, $owner, 'read', ['*']);
        $otherUser = User::factory()->create();

        DB::table('memberships')->insert([
            'organization_id' => $organization->id,
            'user_id' => $otherUser->id,
            'role' => 'employee',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Passport::actingAs($otherUser, ['mcp:use']);

        $this->postJson('/mcp/oauth/'.$connection['public_id'], $this->payload('ping'))
            ->assertForbidden();
    }

    public function test_oauth_connection_stops_working_after_revocation(): void
    {
        [$user, $organization] = $this->workspace();
        $connection = $this->connection($organization, $user, 'read', ['*']);

        DB::table('mcp_oauth_connections')
            ->where('id', $connection['id'])
            ->update([
                'status' => 'revoked',
                'revoked_at' => now(),
                'updated_at' => now(),
            ]);

        app(McpTokenService::class)->revoke($organization->id, $connection['token_id']);
        Passport::actingAs($user, ['mcp:use']);

        $this->postJson('/mcp/oauth/'.$connection['public_id'], $this->payload('ping'))
            ->assertNotFound();
    }

    public function test_nested_protected_resource_metadata_points_to_requested_mcp_endpoint(): void
    {
        $connectionId = (string) Str::uuid();
        $path = 'mcp/oauth/'.$connectionId;

        $this->getJson('/.well-known/oauth-protected-resource/'.$path)
            ->assertOk()
            ->assertJsonPath('resource', url('/'.$path))
            ->assertJsonPath('authorization_servers.0', url('/'))
            ->assertJsonPath('scopes_supported.0', 'mcp:use');
    }

    /** @return array{0: User, 1: Organization} */
    private function workspace(): array
    {
        $user = User::factory()->create();
        $organization = Organization::query()->create(['name' => 'OAuth MCP Test Workspace']);

        DB::table('memberships')->insert([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
            'role' => 'owner',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$user, $organization];
    }

    /** @return array{id: int, public_id: string, token_id: int} */
    private function connection(Organization $organization, User $user, string $mode, array $scopes): array
    {
        $publicId = (string) Str::uuid();
        $token = app(McpTokenService::class)->create($organization->id, $user->id, [
            'name' => 'OAuth feature-test shadow key',
            'kind' => 'agent',
            'mode' => $mode,
            'scopes' => $scopes,
            'metadata' => [
                'authentication' => 'oauth',
                'public_id' => $publicId,
            ],
        ]);

        $id = DB::table('mcp_oauth_connections')->insertGetId([
            'public_id' => $publicId,
            'organization_id' => $organization->id,
            'user_id' => $user->id,
            'mcp_access_token_id' => $token['record']->id,
            'name' => 'OAuth test connection',
            'provider' => 'custom',
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [
            'id' => $id,
            'public_id' => $publicId,
            'token_id' => (int) $token['record']->id,
        ];
    }

    private function payload(string $method, array $params = []): array
    {
        return [
            'jsonrpc' => '2.0',
            'id' => 1,
            'method' => $method,
            'params' => $params,
        ];
    }
}
