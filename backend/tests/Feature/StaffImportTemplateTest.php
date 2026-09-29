<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

class StaffImportTemplateTest extends TestCase
{
    use RefreshDatabase;

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

    public function test_owner_can_download_compatible_staff_import_workbook(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Import template test']);
        $organization->users()->attach($user->id, ['role' => 'owner']);

        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $this->actingAs($user)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);

        $response = $this
            ->get('/api/staff-import/template')
            ->assertOk()
            ->assertDownload('acconova-staff-import-template.xlsx');

        $temporaryPath = tempnam(sys_get_temp_dir(), 'acconova-staff-template-');
        $this->assertNotFalse($temporaryPath);

        try {
            file_put_contents($temporaryPath, $response->streamedContent());
            $workbook = IOFactory::load($temporaryPath);

            $this->assertSame(
                ['الموظفون', 'الحضور', 'الرواتب', 'تعليمات'],
                $workbook->getSheetNames(),
            );
            $this->assertSame(
                'اسم الموظف',
                $workbook->getSheetByName('الموظفون')?->getCell('A1')->getValue(),
            );
            $this->assertSame(
                'معرّف الموظف',
                $workbook->getSheetByName('الحضور')?->getCell('A1')->getValue(),
            );
            $this->assertSame(
                'نوع العملية',
                $workbook->getSheetByName('الرواتب')?->getCell('B1')->getValue(),
            );

            $workbook->disconnectWorksheets();
        } finally {
            @unlink($temporaryPath);
        }
    }
}
