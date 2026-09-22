<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\PaymentPlan;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PaymentPlanTest extends TestCase
{
    use RefreshDatabase;

    public function test_expenses_and_collections_do_not_require_customers_or_suppliers(): void
    {
        $this->workspace();
        $payload = ['title' => 'Electricity', 'direction' => 'outgoing', 'amount' => '100.25', 'currency' => 'ILS', 'frequency' => 'monthly', 'next_due_on' => '2026-01-31', 'reminder_days' => 3];
        $this->postJson('/api/payment-plans', $payload)->assertCreated()->assertJsonPath('data.amount', '100.2500');
        $this->postJson('/api/payment-plans', [...$payload, 'title' => 'Subscription', 'direction' => 'incoming'])->assertCreated();
        $this->postJson('/api/payment-plans', [...$payload, 'amount' => '-1'])->assertUnprocessable();
        $this->getJson('/api/payment-plans?direction=incoming')->assertOk()->assertJsonCount(1, 'data');
        $this->assertDatabaseCount('parties', 0);
    }

    public function test_month_end_is_preserved_and_each_payment_has_its_own_provider_and_amount(): void
    {
        $this->workspace();
        $plan = PaymentPlan::factory()->create();
        $path = '/api/payment-plans/'.$plan->id.'/record';
        $first = ['due_on' => '2026-01-31', 'paid_on' => '2026-01-31', 'amount' => '95.5', 'counterparty' => 'Shop A', 'method' => 'cash'];
        $this->postJson($path, $first)->assertCreated()->assertJsonPath('data.amount', '95.5000');
        $this->postJson($path, $first)->assertConflict();
        $this->getJson('/api/payment-plans')->assertOk()->assertJsonPath('data.0.next_due_on', '2026-02-28')->assertJsonPath('data.0.amount', '100.0000');
        $this->postJson($path, [...$first, 'due_on' => '2026-02-28', 'paid_on' => '2026-02-28', 'counterparty' => 'Bank', 'method' => 'bank', 'amount' => '110'])
            ->assertCreated()->assertJsonPath('data.counterparty', 'Bank');
        $this->getJson('/api/payment-plans')->assertOk()->assertJsonPath('data.0.next_due_on', '2026-03-31');
        $this->getJson('/api/payment-records')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_one_time_items_complete_and_paused_items_cannot_be_recorded(): void
    {
        $this->workspace();
        $once = PaymentPlan::factory()->create(['frequency' => 'once']);
        $paused = PaymentPlan::factory()->create(['active' => false]);
        $data = ['due_on' => '2026-01-31', 'paid_on' => '2026-01-31', 'amount' => '100', 'method' => 'electronic'];
        $this->postJson('/api/payment-plans/'.$once->id.'/record', $data)->assertCreated();
        $this->postJson('/api/payment-plans/'.$once->id.'/record', $data)->assertConflict();
        $this->patchJson('/api/payment-plans/'.$once->id, ['active' => true])->assertConflict();
        $this->postJson('/api/payment-plans/'.$paused->id.'/record', $data)->assertConflict();
        $this->getJson('/api/payment-plans?status=inactive')->assertOk()->assertJsonCount(2, 'data');
        $this->assertDatabaseCount('payment_records', 1);
    }

    public function test_weekly_and_yearly_schedules_advance_from_due_date(): void
    {
        $this->workspace();
        $weekly = PaymentPlan::factory()->create(['frequency' => 'weekly']);
        $yearly = PaymentPlan::factory()->create(['frequency' => 'yearly', 'next_due_on' => '2024-02-29', 'anchor_day' => 29, 'direction' => 'incoming']);
        $data = ['due_on' => '2026-01-31', 'paid_on' => '2026-03-01', 'amount' => '100', 'method' => 'bank'];
        $this->postJson('/api/payment-plans/'.$weekly->id.'/record', $data)->assertCreated();
        $this->getJson('/api/payment-plans')->assertOk()->assertJsonFragment(['next_due_on' => '2026-02-07']);
        $this->postJson('/api/payment-plans/'.$yearly->id.'/record', [...$data, 'due_on' => '2024-02-29'])->assertCreated()->assertJsonPath('data.direction', 'incoming');
        $this->getJson('/api/payment-plans')->assertOk()->assertJsonFragment(['next_due_on' => '2025-02-28']);
    }

    public function test_reminders_include_upcoming_and_overdue_but_exclude_paused_and_foreign_items(): void
    {
        $this->travelTo(now()->setDate(2026, 1, 29));
        $this->workspace();
        $foreign = PaymentPlan::factory()->create();
        PaymentPlan::factory()->create(['next_due_on' => '2026-01-01']);
        PaymentPlan::factory()->create(['next_due_on' => '2026-02-10']);
        PaymentPlan::factory()->create(['active' => false]);
        $this->getJson('/api/payment-plans/reminders')->assertOk()->assertJsonPath('count', 2);
        $this->workspace();
        $this->getJson('/api/payment-plans/reminders')->assertOk()->assertJsonPath('count', 0);
        $this->patchJson('/api/payment-plans/'.$foreign->id, ['active' => false])->assertNotFound();
        $this->postJson('/api/payment-plans/'.$foreign->id.'/record', [])->assertNotFound();
        $this->getJson('/api/payment-records')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_employee_has_no_access_to_payment_data(): void
    {
        $this->workspace(OrganizationRole::Employee);
        $this->getJson('/api/payment-plans')->assertForbidden();
        $this->getJson('/api/payment-records')->assertForbidden();
        $this->getJson('/api/payment-plans/reminders')->assertForbidden();
        $this->postJson('/api/payment-plans', [])->assertForbidden();
    }

    public function test_custom_intervals_preserve_month_end_and_validate_bounds(): void
    {
        $this->workspace();
        foreach ([['weekly', 2, '2026-02-14'], ['weekly', 3, '2026-02-21'], ['monthly', 3, '2026-04-30']] as [$frequency, $interval, $expected]) {
            $plan = $this->postJson('/api/payment-plans', [
                'title' => 'Custom schedule', 'direction' => 'outgoing', 'amount' => '100', 'currency' => 'ILS',
                'frequency' => $frequency, 'interval_count' => $interval, 'next_due_on' => '2026-01-31', 'reminder_days' => 3,
            ])->assertCreated()->assertJsonPath('data.interval_count', $interval)->json('data.id');
            $this->postJson('/api/payment-plans/'.$plan.'/record', [
                'due_on' => '2026-01-31', 'paid_on' => '2026-01-31', 'amount' => '100', 'method' => 'cash',
            ])->assertCreated();
            $this->assertDatabaseHas('payment_plans', ['id' => $plan, 'next_due_on' => $expected.' 00:00:00']);
        }
        foreach ([0, 366, 1.5] as $interval) {
            $this->postJson('/api/payment-plans', ['interval_count' => $interval])->assertUnprocessable()->assertJsonValidationErrors('interval_count');
        }
    }

    public function test_workspace_defaults_are_authorized_validated_and_tenant_isolated(): void
    {
        $this->workspace();
        $this->patchJson('/api/workspace-settings', ['currency' => 'USD', 'reminder_days' => 7])->assertOk()->assertJsonPath('currency', 'USD');
        $this->getJson('/api/workspace-settings')->assertOk()->assertJsonPath('reminder_days', 7);
        $this->patchJson('/api/workspace-settings', ['currency' => 'INVALID', 'reminder_days' => 31])->assertUnprocessable();
        $this->workspace(OrganizationRole::Employee);
        $this->getJson('/api/workspace-settings')->assertForbidden();
        $this->patchJson('/api/workspace-settings', ['currency' => 'EUR', 'reminder_days' => 1])->assertForbidden();
    }

    private function workspace(OrganizationRole $role = OrganizationRole::Owner): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Payment workspace']);
        $organization->users()->attach($user->id, ['role' => $role->value]);
        app(TenantContext::class)->set($organization, $role);
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);

    }
}
