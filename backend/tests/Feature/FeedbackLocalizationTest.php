<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Tests\TestCase;

class FeedbackLocalizationTest extends TestCase
{
    /** Technical exception details remain private even when development debug is enabled. */
    public function test_unexpected_api_errors_are_sanitized_in_both_languages(): void
    {
        config(['app.debug' => true]);
        Route::get('/api/feedback-test', function (): never {
            throw new RuntimeException('SQLSTATE secret database credentials and stack trace');
        });

        foreach (['en', 'ar'] as $locale) {
            $this->withHeader('X-Locale', $locale)->getJson('/api/feedback-test')
                ->assertStatus(500)
                ->assertExactJson(['code' => 'unexpected', 'message' => __('feedback.unexpected', [], $locale)])
                ->assertDontSee('SQLSTATE');
        }
    }

    /** Field identity and stable validation rule codes survive without raw validator messages. */
    public function test_validation_returns_translated_fields_and_structured_rules(): void
    {
        Route::post('/api/feedback-test', function (): never {
            Validator::make([], ['name' => 'required'], ['name.required' => 'SQLSTATE internal detail'])->validate();
            throw new RuntimeException('Unreachable');
        });

        $this->withHeader('X-Locale', 'ar')->postJson('/api/feedback-test')
            ->assertUnprocessable()
            ->assertJsonPath('message', __('feedback.validation', [], 'ar'))
            ->assertJsonPath('errors.name.0', __('feedback.required', [], 'ar'))
            ->assertJsonPath('error_codes.name.0', 'required')
            ->assertDontSee('SQLSTATE');
    }

    /** Custom business validation can never accidentally return database internals. */
    public function test_custom_validation_is_sanitized_without_losing_field_keys(): void
    {
        Route::post('/api/feedback-test', function (): never {
            throw ValidationException::withMessages(['sku' => ['SQLSTATE[23000] secret table']]);
        });

        $this->postJson('/api/feedback-test')->assertUnprocessable()
            ->assertJsonValidationErrors('sku')->assertDontSee('SQLSTATE');
    }

    /** Locale is allowlisted and reset per request instead of leaking across a worker. */
    public function test_locale_preference_and_error_statuses_are_preserved(): void
    {
        Route::get('/api/feedback-test', function (): never {
            abort(403, 'Internal policy class details');
        });

        $this->withHeader('X-Locale', 'ar')->getJson('/api/feedback-test')->assertForbidden()
            ->assertJsonPath('message', __('feedback.forbidden', [], 'ar'));
        $this->withHeader('X-Locale', '../../unknown')->getJson('/api/feedback-test')->assertForbidden()
            ->assertJsonPath('message', __('feedback.forbidden', [], 'en'));
    }

    /** Browser error pages are safe too, including requests that do not ask for JSON. */
    public function test_browser_errors_do_not_expose_debug_html(): void
    {
        config(['app.debug' => true]);
        Route::get('/feedback-test', function (): never {
            throw new RuntimeException('SQLSTATE private connection');
        });

        $this->withHeader('X-Locale', 'ar')->get('/feedback-test')->assertStatus(500)
            ->assertSee('dir="rtl"', false)
            ->assertSee(__('feedback.unexpected', [], 'ar'))
            ->assertDontSee('SQLSTATE');
    }
}
