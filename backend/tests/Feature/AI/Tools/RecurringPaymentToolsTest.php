<?php

namespace Tests\Feature\AI\Tools;

use App\Enums\OrganizationRole;
use App\Models\AiConversation;
use App\Models\Organization;
use App\Models\PaymentPlan;
use App\Models\PaymentRecord;
use App\Models\User;
use App\Services\AI\AiWriteToolRegistry;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class RecurringPaymentToolsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Organization $organization;

    private AiConversation $conversation;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Rent Co']);
        $this->organization->users()->attach($this->owner->id, ['role' => 'owner']);
        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);

        $this->conversation = AiConversation::factory()->for($this->owner)->create();
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    /**
     * @param  array<string, mixed>  $arguments
     * @return array<string, mixed>
     */
    private function callTool(string $tool, array $arguments, ?User $user = null): array
    {
        return app(AiWriteToolRegistry::class)->execute($user ?? $this->owner, $tool, $arguments, $this->conversation);
    }

    /**
     * @return array<string, mixed>
     */
    private function rent(array $overrides = []): array
    {
        return ['title' => 'Office rent', 'direction' => 'outgoing', 'amount' => '1500', 'frequency' => 'monthly', 'next_due_on' => now()->addDays(10)->toDateString(), ...$overrides];
    }

    public function test_a_recurring_payment_is_created_with_the_page_defaults_and_audited(): void
    {
        $result = $this->callTool('recurring_payment_create', ['fields' => $this->rent(['counterparty' => 'Landlord'])]);

        $this->assertSame('created', $result['status']);
        $this->assertSame('1500.0000', $result['record']['amount']);
        $this->assertSame(1, $result['record']['interval_count']);
        $this->assertSame(3, $result['record']['reminder_days']);
        $this->assertSame('ILS', $result['record']['currency']);
        $this->assertNull($result['audit']['before']);
        $this->assertDatabaseHas('payment_plans', ['title' => 'Office rent', 'active' => true, 'anchor_day' => now()->addDays(10)->day]);
    }

    public function test_missing_or_invalid_values_are_reported_and_nothing_is_saved(): void
    {
        foreach ([
            ['title' => null],
            ['direction' => 'sideways'],
            ['amount' => '0'],
            ['frequency' => 'fortnightly'],
            ['next_due_on' => '10/10/2026'],
            ['reminder_days' => '99'],
        ] as $override) {
            $this->assertSame('invalid', $this->callTool('recurring_payment_create', ['fields' => $this->rent($override)])['status']);
        }

        $this->assertSame('invalid', $this->callTool('recurring_payment_create', ['fields' => [...$this->rent(), 'currency' => 'USD']])['status']);
        $this->assertDatabaseCount('payment_plans', 0);
    }

    public function test_a_same_name_active_plan_needs_confirmation_before_a_second_one(): void
    {
        $this->callTool('recurring_payment_create', ['fields' => $this->rent()]);

        $this->assertSame('duplicate', $this->callTool('recurring_payment_create', ['fields' => $this->rent(['title' => 'office RENT'])])['status']);
        $this->assertSame('created', $this->callTool('recurring_payment_create', ['fields' => $this->rent(['title' => 'office RENT']), 'allow_duplicate' => true])['status']);
        $this->assertDatabaseCount('payment_plans', 2);
    }

    public function test_update_finds_the_plan_by_name_and_clarifies_when_unsure(): void
    {
        $this->callTool('recurring_payment_create', ['fields' => $this->rent()]);
        $this->callTool('recurring_payment_create', ['fields' => $this->rent(['title' => 'Office internet'])]);

        $updated = $this->callTool('recurring_payment_update', ['lookup' => 'Office rent', 'changes' => ['amount' => '1600']]);
        $this->assertSame('updated', $updated['status']);
        $this->assertSame('1500.0000', $updated['audit']['before']['amount']);
        $this->assertSame('1600.0000', $updated['audit']['after']['amount']);

        $ambiguous = $this->callTool('recurring_payment_update', ['lookup' => 'Office', 'changes' => ['amount' => '1']]);
        $this->assertSame('needs_clarification', $ambiguous['status']);
        $this->assertCount(2, $ambiguous['candidates']);
        $this->assertSame('invalid', $this->callTool('recurring_payment_update', ['lookup' => 'Office rent', 'changes' => ['currency' => 'USD']])['status']);
        $this->assertEquals(1600, PaymentPlan::query()->where('title', 'Office rent')->value('amount'));
    }

    public function test_pausing_needs_a_confirmed_plan_and_resuming_restores_it(): void
    {
        $id = $this->callTool('recurring_payment_create', ['fields' => $this->rent()])['record']['id'];

        $plan = $this->callTool('recurring_payment_archive', ['record_id' => $id]);
        $this->assertSame('confirmation_required', $plan['status']);
        $this->assertDatabaseHas('payment_plans', ['id' => $id, 'active' => true]);

        $paused = $this->callTool('recurring_payment_archive', ['record_id' => $id, 'confirm_token' => $plan['confirm_token']]);
        $this->assertSame('archived', $paused['status']);
        $this->assertSame('recurring_payment_restore', $paused['restore_with']);
        $this->assertArrayNotHasKey('restore_center', $paused);
        $this->assertDatabaseHas('payment_plans', ['id' => $id, 'active' => false]);

        $this->assertSame('not_found', $this->callTool('recurring_payment_archive', ['record_id' => $id, 'confirm_token' => $plan['confirm_token']])['status'], 'already paused: nothing to do');
        $this->assertSame('restored', $this->callTool('recurring_payment_restore', ['lookup' => 'Office rent'])['status']);
        $this->assertDatabaseHas('payment_plans', ['id' => $id, 'active' => true]);
    }

    public function test_a_one_time_payment_that_was_recorded_cannot_be_resumed(): void
    {
        $id = $this->callTool('recurring_payment_create', ['fields' => $this->rent(['frequency' => 'once'])])['record']['id'];
        PaymentRecord::create([
            'payment_plan_id' => $id, 'created_by' => $this->owner->id, 'title' => 'Office rent', 'direction' => 'outgoing',
            'currency' => 'ILS', 'method' => 'cash', 'amount' => '1500', 'due_on' => now()->toDateString(), 'paid_on' => now()->toDateString(),
        ]);
        PaymentPlan::query()->whereKey($id)->update(['active' => false]);

        $result = $this->callTool('recurring_payment_restore', ['record_id' => $id]);

        $this->assertSame('invalid', $result['status']);
        $this->assertDatabaseHas('payment_plans', ['id' => $id, 'active' => false]);
    }

    public function test_users_without_the_permission_or_from_another_company_cannot_use_the_tools(): void
    {
        $employee = User::factory()->create();
        $this->organization->users()->attach($employee->id, ['role' => 'employee']);
        app(TenantContext::class)->set($this->organization, OrganizationRole::Employee);

        $names = array_column(app(AiWriteToolRegistry::class)->definitionsFor($employee), 'name');
        $this->assertNotContains('recurring_payment_create', $names);

        try {
            $this->callTool('recurring_payment_create', ['fields' => $this->rent()], $employee);
            $this->fail('an employee must not create recurring payments');
        } catch (RuntimeException) {
            $this->assertDatabaseCount('payment_plans', 0);
        }

        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
        $id = $this->callTool('recurring_payment_create', ['fields' => $this->rent()])['record']['id'];

        $other = Organization::create(['name' => 'Other Co']);
        $other->users()->attach($this->owner->id, ['role' => 'admin']);
        app(TenantContext::class)->set($other, OrganizationRole::Admin);

        $this->assertSame('not_found', $this->callTool('recurring_payment_archive', ['record_id' => $id])['status']);
        $this->assertSame('not_found', $this->callTool('recurring_payment_update', ['lookup' => 'Office rent', 'changes' => ['amount' => '1']])['status']);
    }
}
