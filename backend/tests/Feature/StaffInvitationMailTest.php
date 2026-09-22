<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Notifications\StaffInvitationNotification;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class StaffInvitationMailTest extends TestCase
{
    use RefreshDatabase;

    private function staff(): int
    {
        $owner = User::factory()->create();
        $org = Organization::create(['name' => 'Mail workspace']);
        $org->users()->attach($owner->id, ['role' => 'owner']);
        app(TenantContext::class)->set($org, OrganizationRole::Owner);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $org->id]);

        return $this->postJson('/api/staff', ['name' => 'Employee', 'basis' => 'day', 'rate' => '100', 'monthly_allowance' => '0', 'started_on' => '2026-01-01'])->assertCreated()->json('data.id');
    }

    public function test_invitation_is_emailed_after_commit(): void
    {
        Notification::fake();
        $staff = $this->staff();
        $response = $this->postJson('/api/staff/'.$staff.'/invitation', ['email' => 'worker@example.com'])->assertCreated()->assertJsonPath('email_sent', true);
        Notification::assertSentOnDemand(StaffInvitationNotification::class, function ($notification, $channels, $notifiable) use ($response) {
            return $channels === ['mail'] && $notifiable->routes['mail'] === 'worker@example.com' && $notification->toMail($notifiable)->actionUrl === $response->json('url');
        });
    }

    public function test_mail_failure_preserves_a_valid_invitation_and_reports_failure(): void
    {
        $staff = $this->staff();
        Notification::shouldReceive('send')->once()->andThrow(new \RuntimeException('Mail unavailable'));
        $response = $this->postJson('/api/staff/'.$staff.'/invitation', ['email' => 'worker@example.com'])->assertCreated()->assertJsonPath('email_sent', false);
        $this->assertDatabaseHas('staff_invitations', ['email' => 'worker@example.com', 'token_hash' => hash('sha256', basename($response->json('url')))]);
    }
}
