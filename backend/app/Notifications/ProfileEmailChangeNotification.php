<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ProfileEmailChangeNotification extends Notification
{
    public function __construct(public string $url) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)->subject('AccoNova — Confirm email change')->line('Confirm this email address for your AccoNova account. The link expires in 60 minutes.')->action('Confirm email address', $this->url);
    }
}
