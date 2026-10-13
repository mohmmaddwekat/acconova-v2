<?php

namespace Tests\Feature;

use App\Services\Workspace\WorkspaceFeaturePermissions;
use Tests\TestCase;

class WorkspaceFeaturePermissionsTest extends TestCase
{
    public function test_ai_business_data_write_depends_on_business_data_use(): void
    {
        $groups = WorkspaceFeaturePermissions::groups();
        $permission = collect($groups['ai']['permissions'])->firstWhere('key', 'ai.business_data.write');

        $this->assertNotNull($permission);
        $this->assertSame(['ai.business_data.use'], $permission['depends']);
        $this->assertArrayNotHasKey('builtin', $permission);
    }
}
