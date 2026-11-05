<?php

namespace Tests\Feature;

use App\Http\Middleware\ValidateCsrfToken as AppValidateCsrfToken;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Tests\TestCase;

class MobileCsrfExemptionTest extends TestCase
{
    /**
     * The web group must run the app's CSRF middleware, which exempts bearer-token mobile
     * requests. If the framework's own class stays in the group, every mobile write returns 419.
     */
    public function test_web_group_uses_the_mobile_aware_csrf_middleware(): void
    {
        $web = app(Kernel::class)->getMiddlewareGroups()['web'];

        $this->assertContains(AppValidateCsrfToken::class, $web);
        $this->assertNotContains(PreventRequestForgery::class, $web);
    }
}
