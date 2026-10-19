<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Notifications\StaffInvitationNotification;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class StaffInvitationMailTest extends TestCase
{
    use RefreshDatabase;

    private function staff(string $ownerEmail = 'owner@gmail.com', ?string $contactEmail = 'worker@example.com'): int
    {
        $owner = User::factory()->create(['email' => $ownerEmail]);
        $org = Organization::create(['name' => 'Mail workspace']);
        $org->users()->attach($owner->id, ['role' => 'owner']);
        app(TenantContext::class)->set($org, OrganizationRole::Owner);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $org->id]);

        return $this->postJson('/api/staff', ['name' => 'Employee', 'basis' => 'day', 'rate' => '100', 'monthly_allowance' => '0', 'started_on' => '2026-01-01', 'contact_email' => $contactEmail])->assertCreated()->json('data.id');
    }

    public function test_invitation_is_emailed_to_the_address_on_the_employee_profile(): void
    {
        Notification::fake();
        $staff = $this->staff();
        $response = $this->postJson('/api/staff/'.$staff.'/invitation')->assertCreated()->assertJsonPath('email_sent', true);
        Notification::assertSentOnDemand(StaffInvitationNotification::class, function ($notification, $channels, $notifiable) use ($response) {
            return $channels === ['mail'] && $notifiable->routes['mail'] === 'worker@example.com' && $notification->toMail($notifiable)->actionUrl === $response->json('url');
        });
    }

    public function test_an_email_typed_in_the_request_is_ignored(): void
    {
        Notification::fake();
        $staff = $this->staff();
        $this->postJson('/api/staff/'.$staff.'/invitation', ['email' => 'attacker@evil.test'])->assertCreated();
        Notification::assertSentOnDemand(StaffInvitationNotification::class, fn ($notification, $channels, $notifiable) => $notifiable->routes['mail'] === 'worker@example.com');
        $this->assertDatabaseMissing('staff_invitations', ['email' => 'attacker@evil.test']);
    }

    public function test_invitation_requires_an_email_on_the_profile(): void
    {
        Notification::fake();
        $staff = $this->staff('owner@gmail.com', null);
        $this->postJson('/api/staff/'.$staff.'/invitation')->assertStatus(422);
        Notification::assertNothingSent();
    }

    public function test_outside_domains_are_rejected_once_the_company_has_a_domain(): void
    {
        Notification::fake();
        $staff = $this->staff('owner@acme.test', 'worker@acme.test');
        $this->postJson('/api/staff', ['name' => 'Outsider', 'basis' => 'day', 'rate' => '100', 'monthly_allowance' => '0', 'started_on' => '2026-01-01', 'contact_email' => 'someone@evil.test'])->assertStatus(422)->assertJsonValidationErrors('contact_email');
        $this->postJson('/api/staff/'.$staff.'/invitation')->assertCreated();
        Notification::assertSentOnDemand(StaffInvitationNotification::class, fn ($notification, $channels, $notifiable) => $notifiable->routes['mail'] === 'worker@acme.test');
    }

    public function test_email_cannot_be_changed_once_the_employee_has_an_account(): void
    {
        $staff = $this->staff();
        $account = User::factory()->create();
        DB::table('staff_members')->where('id', $staff)->update(['user_id' => $account->id]);
        $this->patchJson('/api/staff/'.$staff, ['name' => 'Employee', 'basis' => 'day', 'rate' => '100', 'monthly_allowance' => '0', 'started_on' => '2026-01-01', 'contact_email' => 'other@example.com'])->assertStatus(422);
    }

    public function test_mail_failure_preserves_a_valid_invitation_and_reports_failure(): void
    {
        $staff = $this->staff();
        Notification::shouldReceive('send')->once()->andThrow(new \RuntimeException('Mail unavailable'));
        $response = $this->postJson('/api/staff/'.$staff.'/invitation')->assertCreated()->assertJsonPath('email_sent', false);
        $this->assertDatabaseHas('staff_invitations', ['email' => 'worker@example.com', 'token_hash' => hash('sha256', basename($response->json('url')))]);
    }
}
