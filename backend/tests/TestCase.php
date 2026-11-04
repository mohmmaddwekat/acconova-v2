<?php

namespace Tests;

use App\Services\Workspace\WorkspacePermissions;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // The custom-role cache is static and otherwise only reset per HTTP
        // request. Databases that reuse row ids after a rolled-back test
        // (SQLite) would serve one test's role to the next.
        WorkspacePermissions::flushCustomCache();
    }
}
