<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\InventoryBalance;
use App\Models\Organization;
use App\Models\Product;
use App\Models\User;
use App\Models\Warehouse;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class WorkforceOperationsTest extends TestCase
{
    use RefreshDatabase;

    private function workspace(): void
    {
        $owner = User::factory()->create();
        $org = Organization::create(['name' => 'Factory']);
        $org->users()->attach($owner->id, ['role' => 'owner']);
        app(TenantContext::class)->set($org, OrganizationRole::Owner);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $org->id]);
        $this->travelTo(now()->setDate(2026, 9, 17));
    }

    private function staff(string $basis = 'day', string $rate = '100'): int
    {
        return $this->postJson('/api/staff', ['name' => 'Worker '.$basis, 'basis' => $basis, 'rate' => $rate, 'monthly_allowance' => '0', 'started_on' => '2026-01-01'])->assertCreated()->json('data.id');
    }

    private function attendance(int $staff, array $extra = []): TestResponse
    {
        return $this->postJson('/api/staff/'.$staff.'/attendance', [...['occurred_on' => '2026-09-16', 'status' => 'present', 'quantity' => '10', 'overtime_hours' => '0', 'overtime_rate' => '0'], ...$extra]);
    }

    public function test_attendance_earns_by_basis_and_overtime_without_paying(): void
    {
        $this->workspace();
        foreach (['day' => ['100', '100'], 'hour' => ['10', '100'], 'piece' => ['2', '20'], 'month' => ['3000', '0']] as $basis => [$rate,$expected]) {
            $staff = $this->staff($basis, $rate);
            $this->attendance($staff)->assertCreated();
            $this->getJson('/api/staff/'.$staff.'/ledger')->assertOk()->assertJsonPath('balance', $expected);
            $this->attendance($staff)->assertConflict();
        }
        $hour = $this->staff('hour', '10');
        $this->attendance($hour, ['overtime_hours' => '2', 'overtime_rate' => '15'])->assertCreated();
        $this->getJson('/api/staff/'.$hour.'/ledger')->assertJsonPath('balance', '130');
        $this->assertDatabaseHas('staff_entries', ['staff_member_id' => $hour, 'kind' => 'overtime', 'amount' => '30']);
        $this->assertDatabaseMissing('staff_entries', ['kind' => 'payment']);
    }

    public function test_absence_invalid_hours_and_manual_double_counting(): void
    {
        $this->workspace();
        $id = $this->staff('hour', '10');
        $this->attendance($id, ['quantity' => '23', 'overtime_hours' => '2', 'overtime_rate' => '15'])->assertUnprocessable();
        $this->attendance($id, ['status' => 'absent', 'overtime_hours' => '1'])->assertUnprocessable();
        $this->attendance($id, ['status' => 'absent'])->assertCreated();
        $this->getJson('/api/staff/'.$id.'/ledger')->assertJsonPath('balance', '0');
        $this->postJson('/api/staff/'.$id.'/entries', ['request_id' => (string) Str::uuid(), 'kind' => 'work', 'occurred_on' => '2026-09-16', 'quantity' => '10', 'notes' => 'Duplicate'])->assertConflict();
    }

    public function test_advances_partial_payment_and_balance_carry_forward(): void
    {
        $this->workspace();
        $id = $this->staff();
        $entry = ['occurred_on' => '2026-09-15', 'notes' => 'Approved'];
        $this->postJson('/api/staff/'.$id.'/entries', [...$entry, 'request_id' => (string) Str::uuid(), 'kind' => 'advance', 'amount' => '40'])->assertCreated();
        $this->getJson('/api/staff/'.$id.'/ledger')->assertJsonPath('balance', '-40');
        $this->attendance($id)->assertCreated();
        $this->postJson('/api/staff/'.$id.'/entries', [...$entry, 'request_id' => (string) Str::uuid(), 'kind' => 'payment', 'amount' => '30'])->assertCreated();
        $this->getJson('/api/staff/'.$id.'/ledger')->assertJsonPath('balance', '30');
    }

    public function test_recurring_named_adjustments_are_approved_once_and_stop(): void
    {
        $this->workspace();
        $id = $this->staff();
        $rule = $this->postJson('/api/staff/'.$id.'/adjustments', ['label' => 'Transport', 'kind' => 'allowance', 'amount' => '50', 'starts_on' => '2026-07-01'])->assertCreated()->json('id');
        $this->postJson('/api/staff/'.$id.'/adjustments', ['label' => 'Approved deduction', 'kind' => 'deduction', 'amount' => '10', 'starts_on' => '2026-07-01', 'ends_on' => '2026-07-31'])->assertCreated();
        $this->postJson('/api/staff/'.$id.'/adjustments/accrue', ['through' => '2026-08'])->assertOk()->assertJsonPath('created', 3);
        $this->postJson('/api/staff/'.$id.'/adjustments/accrue', ['through' => '2026-08'])->assertOk()->assertJsonPath('created', 0);
        $this->getJson('/api/staff/'.$id.'/ledger')->assertJsonPath('balance', '90');
        $this->patchJson('/api/staff/'.$id.'/adjustments/'.$rule, ['ends_on' => '2026-07-01'])->assertUnprocessable();
        $this->patchJson('/api/staff/'.$id.'/adjustments/'.$rule, ['ends_on' => '2026-08-31'])->assertOk();
        $this->postJson('/api/staff/'.$id.'/adjustments/accrue', ['through' => '2026-09'])->assertUnprocessable();
    }

    public function test_workforce_is_tenant_scoped_and_searchable(): void
    {
        $this->workspace();
        $id = $this->staff();
        $this->staff('hour');
        $this->getJson('/api/staff?search=hour&basis=hour&active=1')->assertOk()->assertJsonCount(1, 'data.data')->assertJsonCount(0, 'accounts');
        $this->getJson('/api/staff?include_accounts=1')->assertOk()->assertJsonCount(1, 'accounts');
        $this->workspace();
        $this->attendance($id)->assertNotFound();
        $this->getJson('/api/staff/'.$id.'/workforce')->assertNotFound();
    }

    public function test_historical_pay_rate_is_used_and_regular_members_cannot_write_payroll(): void
    {
        $this->workspace();
        $id = $this->staff();
        $this->patchJson('/api/staff/'.$id, ['name' => 'Worker day', 'basis' => 'day', 'rate' => '200', 'monthly_allowance' => '0', 'started_on' => '2026-01-01', 'active' => true])->assertOk();
        $this->attendance($id)->assertCreated();
        $this->attendance($id, ['occurred_on' => '2026-09-17'])->assertCreated();
        $this->getJson('/api/staff/'.$id.'/ledger')->assertJsonPath('balance', '300');
        $reader = User::factory()->create();
        Organization::query()->firstOrFail()->users()->attach($reader->id, ['role' => 'employee']);
        $this->actingAs($reader);
        $this->attendance($id, ['occurred_on' => '2026-09-14'])->assertForbidden();
        $this->postJson('/api/staff/'.$id.'/adjustments', ['label' => 'Unauthorized', 'kind' => 'bonus', 'amount' => '50', 'starts_on' => '2026-09-01'])->assertForbidden();
        $this->getJson('/api/staff/'.$id.'/workforce')->assertForbidden();
    }

    public function test_draft_deletion_duplicate_outputs_and_catalog_stock(): void
    {
        $this->workspace();
        $product = Product::factory()->create(['type' => 'product', 'track_inventory' => true]);
        $raw = Product::factory()->create(['type' => 'raw_material', 'track_inventory' => true]);
        $warehouse = Warehouse::create(['name' => 'Main', 'code' => 'M']);
        InventoryBalance::create(['product_id' => $raw->id, 'warehouse_id' => $warehouse->id, 'on_hand' => '2000', 'reserved' => '10']);
        $output = ['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => '2', 'materials' => [['raw_material_id' => $raw->id, 'warehouse_id' => $warehouse->id, 'actual_quantity' => '1']]];
        $payload = ['occurred_on' => '2026-09-17', 'outputs' => [$output, $output]];
        $this->postJson('/api/production-runs', $payload)->assertUnprocessable()->assertJsonValidationErrors('outputs.0.product_id');
        $payload['outputs'] = [$output];
        $run = $this->postJson('/api/production-runs', $payload)->assertCreated()->json('data');
        $this->deleteJson('/api/production-runs/'.$run['id'], ['expected_revision' => $run['revision'] + 1])->assertUnprocessable();
        $this->deleteJson('/api/production-runs/'.$run['id'], ['expected_revision' => $run['revision']])->assertNoContent();
        $this->getJson('/api/production-runs/'.$run['id'])->assertNotFound();
        $this->assertDatabaseCount('stock_movements', 0);
        $row = collect($this->getJson('/api/products')->assertOk()->json('data'))->firstWhere('id', $raw->id);
        $this->assertSame(2000.0, (float) $row['stock_on_hand']);
        $this->assertSame(10.0, (float) $row['stock_reserved']);
        $run = $this->postJson('/api/production-runs', $payload)->assertCreated()->json('data');
        $posted = $this->postJson('/api/production-runs/'.$run['id'].'/post', ['expected_revision' => $run['revision']])->assertOk()->json('data');
        $this->deleteJson('/api/production-runs/'.$run['id'], ['expected_revision' => $posted['revision']])->assertStatus(422);
    }
}
