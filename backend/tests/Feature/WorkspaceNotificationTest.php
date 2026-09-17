<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Events\StockMovementRecorded;
use App\Models\Organization;
use App\Models\PaymentPlan;
use App\Models\PaymentRecord;
use App\Models\Product;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\NotificationCenter;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class WorkspaceNotificationTest extends TestCase
{
    use DatabaseMigrations;

    protected function tearDown(): void
    {
        DB::table('party_roles')->where('role', 'contact')->delete();
        DB::table('parties')->where('type', 'other')->update(['type' => 'person']);

        parent::tearDown();
    }

    public function test_stock_events_generate_deduplicated_notifications_and_reads_are_per_user(): void
    {
        [$owner, $organization] = $this->workspace();
        $other = User::factory()->create();
        $organization->users()->attach($other->id, ['role' => 'employee']);
        $product = Product::factory()->create(['type' => 'product']);
        $warehouse = Warehouse::create(['name' => 'Main', 'code' => 'WH-001']);
        $event = new StockMovementRecorded($organization->id, $product->id, $warehouse->id, 99, 'adjustment', '10', '1', '3', $owner->id);
        event($event);
        event($event);
        $this->assertDatabaseCount('workspace_notifications', 2);
        $response = $this->getJson('/api/notifications?unread=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.kind', 'low_stock');
        $id = $response->json('data.0.id');
        $this->patchJson('/api/notifications/'.$id.'/read')->assertOk();
        $this->getJson('/api/notifications/count')->assertJsonPath('count', 0);
        $this->actingAs($other);
        $this->patchJson('/api/notifications/'.$id.'/read')->assertNotFound();
        $this->getJson('/api/notifications/count')->assertJsonPath('count', 1);
        $this->postJson('/api/notifications/read-all')->assertOk();
        $this->getJson('/api/notifications/count')->assertJsonPath('count', 0);
    }

    public function test_exact_stock_threshold_creates_one_alert_without_repeating_below_it(): void
    {
        [$owner,$organization] = $this->workspace();
        $product = Product::factory()->create(['type' => 'raw_material', 'track_inventory' => true, 'unit' => 'kg', 'low_stock_threshold' => '10']);
        $warehouse = Warehouse::create(['name' => 'Threshold warehouse', 'code' => 'TH']);
        event(new StockMovementRecorded($organization->id, $product->id, $warehouse->id, 101, 'adjustment', '11', '10', '10', $owner->id));
        $this->getJson('/api/notifications?unread=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.kind', 'low_stock');
        event(new StockMovementRecorded($organization->id, $product->id, $warehouse->id, 102, 'adjustment', '10', '9', '10', $owner->id));
        $this->getJson('/api/notifications?unread=1')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_due_alerts_are_unique_and_resolved_after_recording_payment(): void
    {
        $this->travelTo(now()->setDate(2026, 1, 29));
        $this->workspace();
        $plan = PaymentPlan::factory()->create();
        $this->getJson('/api/notifications/count')->assertOk()->assertJsonPath('count', 1);
        $this->getJson('/api/notifications/count')->assertOk()->assertJsonPath('count', 1);
        $this->travelTo(now()->setDate(2026, 1, 31));
        $this->getJson('/api/notifications?unread=1')->assertJsonCount(1, 'data')->assertJsonPath('data.0.kind', 'payment_due');
        $this->postJson('/api/payment-plans/'.$plan->id.'/record', [
            'due_on' => '2026-01-31', 'paid_on' => '2026-01-31', 'amount' => '100', 'method' => 'cash',
        ])->assertCreated();
        $this->getJson('/api/notifications?unread=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.kind', 'payment_recorded');
    }

    public function test_rolled_back_records_do_not_generate_notifications(): void
    {
        $this->workspace();
        $plan = PaymentPlan::factory()->create(['next_due_on' => '2099-01-31']);
        try {
            DB::transaction(function () use ($plan): void {
                PaymentRecord::factory()->create(['payment_plan_id' => $plan->id]);
                throw new \RuntimeException('Rollback');
            });
        } catch (\RuntimeException) {
        }
        $this->assertDatabaseCount('workspace_notifications', 0);
        $this->assertDatabaseCount('payment_records', 0);
    }

    public function test_notifications_are_tenant_isolated_and_financial_alerts_are_hidden_from_employees(): void
    {
        [$owner, $organization] = $this->workspace();
        $employee = User::factory()->create();
        $organization->users()->attach($employee->id, ['role' => 'employee']);
        app(NotificationCenter::class)->publish($organization->id, 'private', 'payment_due', 'payments', ['name' => 'Rent'], '/app/payments', true);
        $id = $this->getJson('/api/notifications')->assertOk()->json('data.0.id');
        $this->actingAs($employee);
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(0, 'data');
        $this->patchJson('/api/notifications/'.$id.'/read')->assertNotFound();
        $this->workspace();
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(0, 'data');
        $this->patchJson('/api/notifications/'.$id.'/read')->assertNotFound();
    }

    public function test_general_contact_can_be_selected_for_service_operations(): void
    {
        $this->workspace();
        $service = Product::factory()->create(['type' => 'service']);
        $party = $this->postJson('/api/parties', ['type' => 'other', 'name' => 'Public transport', 'roles' => ['contact']])
            ->assertCreated()->assertJsonPath('data.roles.0', 'contact')->json('data.id');
        $this->getJson('/api/parties?role=contact')->assertOk()->assertJsonCount(1, 'data');
        $this->postJson('/api/products/'.$service->id.'/service-operations', [
            'party_id' => $party, 'performed_on' => '2026-09-16', 'quantity' => '2', 'unit_price' => '25',
        ])->assertCreated();
        $this->getJson('/api/notifications')->assertOk()->assertJsonPath('data.0.kind', 'service');
    }

    /** @return array{User, Organization} */
    private function workspace(): array
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Notification workspace']);
        $organization->users()->attach($user->id, ['role' => 'owner']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

        return [$user, $organization];
    }
}
