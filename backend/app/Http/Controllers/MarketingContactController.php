<?php

namespace App\Http\Controllers;

use App\Models\MarketingContactMessage;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Throwable;

final class MarketingContactController extends Controller
{
    public function __invoke(Request $request): RedirectResponse
    {
        if ($request->filled('company_website')) {
            return back()->with(
                'contact_success',
                app()->getLocale() === 'ar'
                    ? 'شكرًا — تم استلام رسالتك.'
                    : 'Thanks — your message has been received.',
            );
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email:rfc', 'max:190'],
            'company' => ['nullable', 'string', 'max:150'],
            'subject' => ['required', 'string', 'max:120'],
            'message' => ['required', 'string', 'min:10', 'max:5000'],
        ]);

        $entry = MarketingContactMessage::query()->create([
            'name' => (string) $data['name'],
            'email' => (string) $data['email'],
            'company' => isset($data['company']) ? (string) $data['company'] : null,
            'subject' => trim(str_replace(["\r", "\n"], ' ', (string) $data['subject'])),
            'message' => (string) $data['message'],
            'locale' => app()->getLocale(),
            'status' => 'new',
        ]);

        $recipient = config('marketing.contact_email');

        if (is_string($recipient) && trim($recipient) !== '') {
            try {
                $body = implode("\n", [
                    'New AccoNova website enquiry',
                    '',
                    'Message ID: '.$entry->id,
                    'Name: '.$entry->name,
                    'Email: '.$entry->email,
                    'Company: '.($entry->company ?: 'Not provided'),
                    'Subject: '.$entry->subject,
                    '',
                    $entry->message,
                ]);

                Mail::raw($body, function ($mail) use ($recipient, $entry): void {
                    $mail->to($recipient)
                        ->replyTo($entry->email, $entry->name)
                        ->subject('[AccoNova] '.$entry->subject);
                });
            } catch (Throwable $exception) {
                report($exception);
            }
        }

        return back()->with(
            'contact_success',
            app()->getLocale() === 'ar'
                ? 'شكرًا — تم حفظ رسالتك وسيتابعها فريق AccoNova.'
                : 'Thanks — your message has been saved and the AccoNova team can follow up.',
        );
    }
}
