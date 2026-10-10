<?php

namespace Tests\Feature;

use App\Models\AiImportDraft;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AiImportDraftTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();
        parent::tearDown();
    }

    public function test_draft_is_scoped_to_the_current_organization(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Draft Organization A']);
        $otherOrganization = Organization::create(['name' => 'Draft Organization B']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        $otherOrganization->users()->attach($user->id, ['role' => 'owner']);

        app(OrganizationAccess::class)->resolve($user, $organization->id, app(TenantContext::class));
        $draft = AiImportDraft::factory()->create();

        app(TenantContext::class)->clear();
        app(OrganizationAccess::class)->resolve($user, $otherOrganization->id, app(TenantContext::class));

        $this->assertNull(AiImportDraft::find($draft->id));
    }

    public function test_draft_json_fields_round_trip_through_casts(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Draft Round Trip']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        app(OrganizationAccess::class)->resolve($user, $organization->id, app(TenantContext::class));

        $draft = AiImportDraft::factory()->create([
            'extracted_rows' => [['name' => 'Jane']],
            'field_mapping' => ['name' => 'full_name'],
            'commit_summary' => ['created' => 1],
            'status' => AiImportDraft::STATUS_DRAFT,
        ]);

        $fresh = $draft->fresh();

        $this->assertSame([['name' => 'Jane']], $fresh->extracted_rows);
        $this->assertSame(['name' => 'full_name'], $fresh->field_mapping);
        $this->assertSame(['created' => 1], $fresh->commit_summary);
        $this->assertSame(AiImportDraft::STATUS_DRAFT, $fresh->status);
    }
}
