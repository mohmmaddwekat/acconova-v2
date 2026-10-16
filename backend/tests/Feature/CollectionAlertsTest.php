<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\AiConversation;
use App\Models\Organization;
use App\Models\User;
use App\Services\AI\AiBusinessToolRegistry;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class CollectionAlertsTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Collections Alerts Co']);
        $this->organization->users()->attach($this->owner->id, ['role' => 'owner']);
        $this->as($this->owner);
    }

    protected function tearDown(): void
    {
        $this->travelBack();

        parent::tearDown();
    }

    private function as(User $user, ?Organization $organization = null): void
    {
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => ($organization ?? $this->organization)->id]);
    }

    private function day(int $daysAgo): string
    {
        return now()->subDays($daysAgo)->toDateString();
    }

    private function customer(string $name): int
    {
        return $this->postJson('/api/parties', ['type' => 'company', 'company_name' => $name, 'roles' => ['customer']])
            ->assertCreated()->json('data.id');
    }

    private function invoice(int $partyId, int $amount, int $issuedDaysAgo, int $dueDaysAgo): int
    {
        $id = $this->postJson('/api/finance/documents', [
            'kind' => 'sale_invoice', 'party_id' => $partyId,
            'issue_date' => $this->day($issuedDaysAgo), 'due_date' => $this->day($dueDaysAgo),
            'activity_type' => 'services', 'market_type' => 'local', 'currency' => 'ILS', 'exchange_rate' => '1', 'shipping_total' => '0',
            'lines' => [['description' => 'Service', 'quantity' => '1', 'unit' => 'service', 'unit_price' => (string) $amount,
                'discount_percent' => '0', 'tax_rate' => '0', 'affects_inventory' => false]],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/documents/{$id}/issue", ['acknowledge_warnings' => false])->assertOk();

        return $id;
    }

    private function receipt(int $partyId, int $amount, int $daysAgo, ?int $documentId = null): void
    {
        $id = $this->postJson('/api/finance/cash-movements', [
            'direction' => 'incoming', 'party_id' => $partyId, 'category' => 'customer_receipt', 'amount' => (string) $amount,
            'currency' => 'ILS', 'movement_date' => $this->day($daysAgo), 'method' => 'cash', 'account_label' => 'Main',
            'allocations' => $documentId ? [['financial_document_id' => $documentId, 'amount' => (string) $amount]] : [],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/finance/cash-movements/{$id}/post")->assertOk();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function followUps(): array
    {
        return $this->getJson('/api/collections/follow-ups?refresh=1')->assertOk()->json('data');
    }

    private function notifications(): int
    {
        return DB::table('workspace_notifications')->where('kind', 'collection_alert')->count();
    }

    public function test_rules_have_defaults_can_be_configured_and_are_protected(): void
    {
        $rules = collect($this->getJson('/api/collections/rules')->assertOk()->json('data'))->keyBy('kind');

        $this->assertSame(['overdue', 'stopped_paying', 'missed_promise'], $rules->keys()->all());
        $this->assertSame(7, $rules['overdue']['threshold_days']);
        $this->assertSame(['call'], $rules['overdue']['approved_channels']);

        $this->putJson('/api/collections/rules/overdue', ['threshold_days' => 14, 'min_amount' => '50', 'approved_channels' => ['call', 'email']])
            ->assertOk()->assertJsonPath('data.threshold_days', 14)->assertJsonPath('data.approved_channels', ['call', 'email']);
        $this->putJson('/api/collections/rules/overdue', ['approved_channels' => ['telepathy']])->assertUnprocessable();
        $this->putJson('/api/collections/rules/nothing', ['enabled' => false])->assertNotFound();

        $employee = User::factory()->create();
        $this->organization->users()->attach($employee->id, ['role' => 'employee']);
        $this->as($employee);
        $this->getJson('/api/collections/rules')->assertForbidden();
        $this->putJson('/api/collections/rules/overdue', ['enabled' => false])->assertForbidden();
    }

    public function test_an_overdue_customer_is_listed_with_reason_last_contact_and_next_step(): void
    {
        $party = $this->customer('Late Payer');
        $this->invoice($party, 200, 70, 40);

        $items = $this->followUps();

        $this->assertCount(1, $items);
        $this->assertSame('Late Payer', $items[0]['party']);
        $this->assertSame('200.0000', $items[0]['overdue_amount']);
        $this->assertSame(40, $items[0]['days_late']);
        $this->assertSame('overdue', $items[0]['alerts'][0]['kind']);
        $this->assertSame(['code' => 'overdue', 'days' => 40, 'amount' => '200.0000', 'threshold_days' => 7, 'last_payment_on' => null, 'pending_cheques_total' => '0.0000'], $items[0]['alerts'][0]['reason']);
        $this->assertNull($items[0]['last_contact']);
        $this->assertSame('contact_customer', $items[0]['next_action']['key']);
        $this->assertFalse($items[0]['next_action']['outbound_message_allowed']);
    }

    public function test_the_queue_is_ordered_by_overdue_amount_then_lateness(): void
    {
        $small = $this->customer('Small Old');
        $newBig = $this->customer('Big Recent');
        $oldBig = $this->customer('Big Old');
        $this->invoice($small, 100, 90, 60);
        $this->invoice($newBig, 500, 40, 10);
        $this->invoice($oldBig, 500, 60, 30);

        $this->assertSame(['Big Old', 'Big Recent', 'Small Old'], array_column($this->followUps(), 'party'));
    }

    public function test_debt_that_is_not_due_or_below_the_rule_does_not_alert(): void
    {
        $this->invoice($this->customer('Not Due'), 300, 5, -20);
        $this->invoice($this->customer('Barely Late'), 300, 20, 3);
        $this->invoice($this->customer('Tiny Late'), 20, 60, 30);
        $this->putJson('/api/collections/rules/overdue', ['min_amount' => '50'])->assertOk();

        $this->assertSame([], $this->followUps());

        $this->putJson('/api/collections/rules/overdue', ['enabled' => false, 'min_amount' => '0'])->assertOk();
        $this->assertSame([], $this->followUps());
    }

    public function test_stopped_paying_needs_an_earlier_payment_and_a_long_silence(): void
    {
        $stopped = $this->customer('Stopped Paying');
        $first = $this->invoice($stopped, 100, 120, 100);
        $this->receipt($stopped, 100, 60, $first);
        $this->invoice($stopped, 300, 90, 70);
        $never = $this->customer('Never Paid');
        $this->invoice($never, 300, 90, 70);

        $items = collect($this->followUps())->keyBy('party');
        $kinds = fn (string $party): array => array_column($items[$party]['alerts'], 'kind');

        $this->assertContains('stopped_paying', $kinds('Stopped Paying'));
        $this->assertSame(60, collect($items['Stopped Paying']['alerts'])->firstWhere('kind', 'stopped_paying')['days_late']);
        $this->assertNotContains('stopped_paying', $kinds('Never Paid'));
    }

    public function test_a_missed_promise_raises_its_own_alert_and_suggests_calling_about_it(): void
    {
        $party = $this->customer('Promise Breaker');
        $document = $this->invoice($party, 400, 20, 5);
        DB::table('payment_promises')->insert([
            'organization_id' => $this->organization->id, 'party_id' => $party, 'financial_document_id' => $document,
            'amount' => '400', 'promised_on' => $this->day(2), 'status' => 'open', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $alerts = collect($this->followUps()[0]['alerts'])->keyBy('kind');

        $this->assertSame(2, $alerts['missed_promise']['days_late']);
        $this->assertSame($this->day(2), $alerts['missed_promise']['reason']['promise']['promised_on']);
        $this->assertSame('call_about_missed_promise', $this->followUps()[0]['next_action']['key']);
    }

    public function test_the_same_alert_is_not_sent_again_without_a_reason(): void
    {
        $party = $this->customer('Quiet Case');
        $this->invoice($party, 200, 40, 10);

        $this->followUps();
        $this->assertSame(1, $this->notifications());

        $this->followUps();
        $this->travel(3)->days();
        $this->followUps();
        $this->assertSame(1, $this->notifications(), 'inside the cooling-off period');

        $this->postJson("/api/parties/{$party}/collection-contacts", ['channel' => 'call', 'outcome' => 'no_answer'])->assertCreated();
        $this->travel(6)->days();
        $this->followUps();
        $this->assertSame(1, $this->notifications(), 'someone already contacted the customer since the last alert');

        $this->travel(40)->days();
        $this->followUps();
        $this->assertSame(2, $this->notifications(), 'a higher lateness band always alerts again');
    }

    public function test_without_any_contact_the_alert_repeats_after_the_cooling_off_period(): void
    {
        $this->invoice($this->customer('Ignored Case'), 200, 40, 10);

        $this->followUps();
        $this->travel(8)->days();
        $this->followUps();

        $this->assertSame(2, $this->notifications());
    }

    public function test_logging_a_contact_with_a_next_date_quiets_the_customer_until_then(): void
    {
        $party = $this->customer('Called Today');
        $this->invoice($party, 200, 40, 10);
        $this->followUps();

        $this->postJson("/api/parties/{$party}/collection-contacts", ['channel' => 'call', 'outcome' => 'promised', 'note' => 'Will pay Monday', 'next_contact_on' => now()->addDays(3)->toDateString()])
            ->assertCreated();

        $this->assertSame([], $this->followUps());

        $this->travel(4)->days();
        $item = $this->followUps()[0];
        $this->assertSame('promised', $item['last_contact']['outcome']);
        $this->assertSame('Will pay Monday', $item['last_contact']['note']);
        $this->assertSame(4, $item['last_contact']['days_ago']);

        $this->postJson("/api/parties/{$party}/collection-contacts", ['channel' => 'telegram', 'outcome' => 'reached'])->assertUnprocessable();
        $this->postJson("/api/parties/{$party}/collection-contacts", ['channel' => 'call', 'outcome' => 'reached', 'next_contact_on' => '2020-01-01'])->assertUnprocessable();
        $this->assertCount(1, $this->getJson("/api/parties/{$party}/collection-contacts")->assertOk()->json('data'));
    }

    public function test_alerts_close_when_the_customer_pays_and_can_be_snoozed_or_resolved(): void
    {
        $party = $this->customer('Pays Later');
        $document = $this->invoice($party, 200, 40, 10);
        $other = $this->customer('Snoozed One');
        $this->invoice($other, 300, 40, 10);
        $items = collect($this->followUps())->keyBy('party');

        $this->postJson('/api/collections/alerts/'.$items['Snoozed One']['alerts'][0]['id'].'/snooze', ['until' => now()->subDay()->toDateString()])->assertUnprocessable();
        $this->postJson('/api/collections/alerts/'.$items['Snoozed One']['alerts'][0]['id'].'/snooze', ['until' => now()->addDays(5)->toDateString()])
            ->assertOk()->assertJsonPath('data.status', 'snoozed');
        $this->assertSame(['Pays Later'], array_column($this->followUps(), 'party'));

        $this->receipt($party, 200, 0, $document);
        $this->assertSame([], $this->followUps());
        $this->assertDatabaseHas('collection_alerts', ['party_id' => $party, 'status' => 'resolved']);
    }

    public function test_nothing_is_ever_sent_to_a_customer_automatically(): void
    {
        Mail::fake();
        Notification::fake();
        Http::preventStrayRequests();

        $party = $this->customer('Never Contacted Automatically');
        $this->invoice($party, 200, 40, 10);
        $this->putJson('/api/collections/rules/overdue', ['approved_channels' => ['email', 'whatsapp']])->assertOk();

        $item = $this->followUps()[0];

        Mail::assertNothingSent();
        Mail::assertNothingQueued();
        Notification::assertNothingSent();
        $this->assertFalse($item['next_action']['outbound_message_allowed']);
        $this->assertSame('email', $item['next_action']['suggested_channel']);
        $this->assertTrue($item['next_action']['requires_approval']);
        $this->assertSame(0, DB::table('workspace_notifications')->where('kind', '!=', 'collection_alert')->where('data', 'like', '%Never Contacted%')->count());
    }

    public function test_other_companies_and_unauthorized_users_see_and_change_nothing(): void
    {
        $party = $this->customer('Private Debtor');
        $this->invoice($party, 200, 40, 10);
        $alertId = $this->followUps()[0]['alerts'][0]['id'];

        $other = Organization::create(['name' => 'Competitor']);
        $stranger = User::factory()->create();
        $other->users()->attach($stranger->id, ['role' => 'owner']);
        $this->as($stranger, $other);

        $this->assertSame([], $this->getJson('/api/collections/follow-ups?refresh=1')->assertOk()->json('data'));
        $this->postJson("/api/collections/alerts/{$alertId}/resolve")->assertNotFound();
        $this->postJson("/api/parties/{$party}/collection-contacts", ['channel' => 'call', 'outcome' => 'reached'])->assertNotFound();

        $employee = User::factory()->create();
        $this->organization->users()->attach($employee->id, ['role' => 'employee']);
        $this->as($employee);
        $this->getJson('/api/collections/follow-ups')->assertForbidden();
        $this->postJson("/api/collections/alerts/{$alertId}/resolve")->assertForbidden();
        $this->assertDatabaseHas('collection_alerts', ['id' => $alertId, 'status' => 'open']);
    }

    public function test_the_chat_can_read_the_follow_up_queue(): void
    {
        $this->invoice($this->customer('Chat Debtor'), 250, 40, 10);

        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
        $registry = app(AiBusinessToolRegistry::class);
        $conversation = AiConversation::factory()->for($this->owner)->create();

        $this->assertTrue($registry->available($this->owner, 'collection_follow_ups'));
        $result = $registry->execute($this->owner, 'collection_follow_ups', ['limit' => 5], $conversation);

        $this->assertSame(1, $result['total']);
        $this->assertSame('Chat Debtor', $result['items'][0]['party']);
        $this->assertSame('contact_customer', $result['items'][0]['next_action']);
        $this->assertSame('Nothing is sent to customers automatically.', $result['note']);
    }
}
