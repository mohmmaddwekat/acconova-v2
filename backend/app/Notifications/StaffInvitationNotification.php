<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class StaffInvitationNotification extends Notification
{
    public function __construct(public string $invitationUrl, public string $organizationName) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $ar = app()->getLocale() === 'ar';

        return (new MailMessage)->subject(($ar ? 'دعوتك للانضمام إلى ' : 'Invitation to ').$this->organizationName)->line(($ar ? 'تمت دعوتك للانضمام إلى فريق ' : 'You are invited to join ').$this->organizationName)->action($ar ? 'قبول الدعوة وتجهيز حسابك' : 'Accept invitation and set up your account', $this->invitationUrl)->line($ar ? 'الرابط صالح لمدة 7 أيام. أنشئ حسابك أو سجّل الدخول بنفس هذا البريد، ثم أكّد بريدك واقبل الدعوة.' : 'This link expires in 7 days. Register or sign in with this email, verify it, then accept the invitation.');
    }
}
