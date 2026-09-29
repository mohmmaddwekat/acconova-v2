<?php

namespace Tests\Feature;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class StaffImportTemplateTest extends TestCase
{
    public function test_staff_import_template_route_is_registered(): void
    {
        $route = Route::getRoutes()->getByName('staff-import.template');

        $this->assertNotNull($route);
        $this->assertSame('api/staff-import/template', $route->uri());
        $this->assertContains('auth', $route->gatherMiddleware());
        $this->assertContains('verified', $route->gatherMiddleware());
    }

    public function test_staff_import_commit_uses_practical_rate_limit(): void
    {
        $route = Route::getRoutes()->match(
            Request::create('/api/staff-import/commit', 'POST'),
        );

        $middleware = $route->gatherMiddleware();

        $this->assertContains('throttle:15,1', $middleware);
        $this->assertNotContains('throttle:6,1', $middleware);
    }
}
