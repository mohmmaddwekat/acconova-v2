<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class ResetPasswordRequest extends FormRequest
{
    /**
     * Allow guests holding a valid password-reset token to submit a reset.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Validate the token, account email, and replacement password.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'token' => [
                'required',
                'string',
            ],

            'email' => [
                'required',
                'email',
                'max:255',
            ],

            'password' => [
                'required',
                'confirmed',
                Password::min(12),
            ],
        ];
    }

    /**
     * Normalize the account email before token validation.
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('email')) {
            $this->merge([
                'email' => strtolower(
                    trim((string) $this->input('email')),
                ),
            ]);
        }
    }
}
