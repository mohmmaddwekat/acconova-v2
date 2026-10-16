<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\Product;
use App\Models\ProductionRun;
use App\Models\User;
use App\Models\Warehouse;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class InventoryDataTransferTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $owner = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Factory']);
        $organization = $this->organization;
        $organization->users()->attach($owner->id, ['role' => 'owner']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);
    }

    private Organization $organization;

    private function scope(): void
    {
        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
    }

    private function csv(string $content): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('rows.csv', $content);
    }

    public function test_warehouses_export_template_preview_and_import(): void
    {
        $this->postJson('/api/warehouses', ['name' => 'Main'])->assertCreated();

        $this->get('/api/warehouses/import-template')->assertOk()->assertDownload('acconova-warehouses-import-template.xlsx');
        $this->get('/api/warehouses/export/xlsx')->assertOk();
        $this->get('/api/warehouses/export/print')->assertOk()->assertSee('Main');
        $this->get('/api/warehouses/export/pdf')->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->get('/api/warehouses/export/csv')->assertNotFound();

        $file = "name\nMain\nRaw materials\nraw MATERIALS\n\nFinished goods\n";
        $preview = $this->post('/api/warehouses/import/preview', ['file' => $this->csv($file), 'duplicate_mode' => 'skip'], ['Accept' => 'application/json'])->assertOk();
        $this->assertSame(2, $preview->json('valid_rows'));
        $this->assertSame(2, $preview->json('duplicate_rows'), 'one existing name and one repeated name in the file');
        $this->scope();
        $this->assertSame(0, Warehouse::query()->where('name', 'Raw materials')->count(), 'preview writes nothing');

        $this->post('/api/warehouses/import', ['file' => $this->csv($file), 'duplicate_mode' => 'skip'], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.created', 2)->assertJsonPath('data.skipped', 2);
        $this->scope();
        $this->assertSame(3, Warehouse::query()->count());

        $this->post('/api/warehouses/import', ['file' => $this->csv($file), 'duplicate_mode' => 'skip'], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.created', 0);
        $this->scope();
        $this->assertSame(3, Warehouse::query()->count(), 'running the same file again adds nothing');
    }

    public function test_production_runs_import_as_drafts_with_checks_and_no_duplicates(): void
    {
        $this->postJson('/api/warehouses', ['name' => 'Main'])->assertCreated();
        $this->scope();
        Product::factory()->create(['type' => 'product', 'name' => 'Red Box', 'sku' => 'RED', 'unit' => 'piece', 'track_inventory' => true]);
        $this->scope();
        Product::factory()->create(['type' => 'raw_material', 'name' => 'Plastic', 'sku' => 'PLA', 'unit' => 'kg', 'track_inventory' => true]);
        $this->scope();
        Product::factory()->create(['type' => 'raw_material', 'name' => 'Dye', 'sku' => 'DYE', 'unit' => 'kg', 'track_inventory' => true]);

        $this->get('/api/production-runs/import-template')->assertOk()->assertDownload('acconova-production-import-template.xlsx');

        $today = now()->toDateString();
        $file = "run_ref,date,note,output_sku,output_warehouse,output_quantity,material_sku,material_warehouse,material_quantity\n"
            ."B-1,{$today},Morning,RED,Main,100,PLA,Main,26.4\n"
            ."B-1,{$today},Morning,RED,Main,100,DYE,,0.9\n"
            ."B-2,{$today},Bad,NOPE,Main,5,PLA,Main,1\n"
            ."B-3,{$today},Bad warehouse,RED,Nowhere,5,PLA,Main,1\n";

        $preview = $this->post('/api/production-runs/import/preview', ['file' => $this->csv($file), 'duplicate_mode' => 'skip'], ['Accept' => 'application/json'])->assertOk();
        $this->assertSame(4, $preview->json('total_rows'));
        $this->assertSame(2, $preview->json('valid_rows'));
        $this->assertSame(2, $preview->json('error_rows'));
        $this->scope();
        $this->assertSame(0, ProductionRun::query()->count(), 'preview writes nothing');

        $this->post('/api/production-runs/import', ['file' => $this->csv($file), 'duplicate_mode' => 'skip'], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.created', 1);

        $this->scope();

        $run = ProductionRun::query()->with('outputs.materials')->firstOrFail();
        $this->assertSame('draft', $run->status->value);
        $this->assertStringContainsString('[import:B-1]', (string) $run->note);
        $this->assertCount(1, $run->outputs);
        $this->assertCount(2, $run->outputs->first()->materials);
        $this->assertDatabaseCount('stock_movements', 0);

        $again = $this->post('/api/production-runs/import', ['file' => $this->csv($file), 'duplicate_mode' => 'skip'], ['Accept' => 'application/json'])->assertOk();
        $this->assertSame(0, $again->json('data.created'));
        $this->scope();
        $this->assertSame(1, ProductionRun::query()->count(), 'the same file never creates the run twice');

        $this->get('/api/production-runs/export/xlsx')->assertOk();
        $this->get('/api/production-runs/export/print')->assertOk()->assertSee('B-1', false)->assertDontSee('NOPE');
    }

    public function test_members_without_inventory_rights_cannot_import(): void
    {
        $employee = User::factory()->create();
        Organization::query()->firstOrFail()->users()->attach($employee->id, ['role' => 'employee']);
        $this->actingAs($employee);
        $file = $this->csv("name\nNope\n");

        $this->post('/api/warehouses/import', ['file' => $file], ['Accept' => 'application/json'])->assertForbidden();
        $this->post('/api/production-runs/import', ['file' => $file], ['Accept' => 'application/json'])->assertForbidden();
        $this->scope();
        $this->assertSame(0, Warehouse::query()->count());
    }
}
