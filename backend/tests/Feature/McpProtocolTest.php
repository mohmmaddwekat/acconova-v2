<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Services\Mcp\McpTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class McpProtocolTest extends TestCase
{
    use RefreshDatabase;

    public function test_tools_list_only_advertises_scoped_tools(): void
    {
        [$user, $organization] = $this->workspace();
        $token = $this->token($organization, $user, 'read', ['business.morning_brief']);

        $response = $this->mcp($token['token'], 'tools/list')
            ->assertOk()
            ->assertJsonPath('jsonrpc', '2.0');

        $names = collect($response->json('result.tools'))->pluck('name')->all();

        $this->assertContains('business.morning_brief', $names);
        $this->assertNotContains('business.ceo_snapshot', $names);
        $this->assertNotContains('customers.get_360', $names);
        $this->assertNotContains('invoices.create_draft', $names);
    }

    public function test_read_only_token_never_advertises_write_tools_even_with_wildcard_scope(): void
    {
        [$user, $organization] = $this->workspace();
        $token = $this->token($organization, $user, 'read', ['*']);

        $response = $this->mcp($token['token'], 'tools/list')->assertOk();
        $names = collect($response->json('result.tools'))->pluck('name')->all();

        $this->assertNotContains('invoices.create_draft', $names);
        $this->assertNotContains('tasks.create', $names);
        $this->assertNotContains('crm.meeting_note', $names);
        $this->assertNotContains('documents.link', $names);
        $this->assertContains('business.ceo_snapshot', $names);
    }

    public function test_resource_and_prompt_discovery_respects_token_scope(): void
    {
        [$user, $organization] = $this->workspace();
        $token = $this->token($organization, $user, 'read', ['business.morning_brief']);

        $resources = $this->mcp($token['token'], 'resources/list')->assertOk();
        $resourceUris = collect($resources->json('result.resources'))->pluck('uri')->all();

        $this->assertNotContains('acconova://workspace/summary', $resourceUris);
        $this->assertContains('acconova://capabilities', $resourceUris);
        $this->assertContains('acconova://usage', $resourceUris);

        $prompts = $this->mcp($token['token'], 'prompts/list')->assertOk();
        $promptNames = collect($prompts->json('result.prompts'))->pluck('name')->all();

        $this->assertContains('morning-brief', $promptNames);
        $this->assertNotContains('ceo-snapshot', $promptNames);
        $this->assertNotContains('collections-review', $promptNames);
    }

    public function test_tool_call_outside_token_scope_returns_mcp_forbidden_error(): void
    {
        [$user, $organization] = $this->workspace();
        $token = $this->token($organization, $user, 'read', ['business.morning_brief']);

        $this->mcp($token['token'], 'tools/call', [
            'name' => 'business.ceo_snapshot',
            'arguments' => [],
        ])
            ->assertOk()
            ->assertJsonPath('error.code', -32003);
    }

    public function test_usage_resource_isolated_to_current_token(): void
    {
        [$user, $organization] = $this->workspace();
        $first = $this->token($organization, $user, 'read', ['business.morning_brief']);
        $second = $this->token($organization, $user, 'read', ['business.morning_brief']);

        $this->audit($organization->id, $user->id, $first['record']->id, 'success', 2);
        $this->audit($organization->id, $user->id, $second['record']->id, 'error', 9);

        $response = $this->mcp($first['token'], 'resources/read', [
            'uri' => 'acconova://usage',
        ])->assertOk();

        $usage = json_decode((string) $response->json('result.contents.0.text'), true, 512, JSON_THROW_ON_ERROR);

        $this->assertSame(1, $usage['calls_30d']);
        $this->assertSame(0, $usage['errors_30d']);
        $this->assertSame(2, $usage['cost_units_30d']);
    }

    public function test_token_is_rejected_after_owner_loses_workspace_membership(): void
    {
        [$user, $organization] = $this->workspace();
        $token = $this->token($organization, $user, 'read', ['business.morning_brief']);

        DB::table('memberships')
            ->where('organization_id', $organization->id)
            ->where('user_id', $user->id)
            ->delete();

        $this->mcp($token['token'], 'ping')->assertForbidden();
    }

    /** @return array{0: User, 1: Organization} */
    private function workspace(): array
    {
        $user = User::factory()->create();
        $organization = Organization::query()->create(['name' => 'MCP Test Workspace']);

        DB::table('memberships')->insert([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
            'role' => 'owner',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$user, $organization];
    }

    /** @return array{token: string, record: object} */
    private function token(Organization $organization, User $user, string $mode, array $scopes): array
    {
        return app(McpTokenService::class)->create($organization->id, $user->id, [
            'name' => 'Feature test MCP key',
            'kind' => 'agent',
            'mode' => $mode,
            'scopes' => $scopes,
        ]);
    }

    private function mcp(string $token, string $method, array $params = [])
    {
        return $this->postJson('/mcp', [
            'jsonrpc' => '2.0',
            'id' => 1,
            'method' => $method,
            'params' => $params,
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);
    }

    private function audit(int $organizationId, int $userId, int $tokenId, string $status, int $costUnits): void
    {
        DB::table('mcp_audit_logs')->insert([
            'organization_id' => $organizationId,
            'user_id' => $userId,
            'mcp_access_token_id' => $tokenId,
            'capability' => 'business.morning_brief',
            'action' => 'tools/call',
            'status' => $status,
            'input' => json_encode([]),
            'output_summary' => json_encode([]),
            'duration_ms' => 1,
            'cost_units' => $costUnits,
            'created_at' => now(),
        ]);
    }
}
