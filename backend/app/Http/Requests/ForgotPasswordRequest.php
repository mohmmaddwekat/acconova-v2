<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ForgotPasswordRequest extends FormRequest
{
    /**
     * Allow guests to request a password recovery email.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Validate the email used to request password recovery.
     *
     * Intentionally avoid an "exists" rule so validation does not reveal
     * whether an email address belongs to an AccoNova account.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'email' => [
                'required',
                'email',
                'max:255',
            ],
        ];
    }

    /**
     * Normalize the email before it reaches Laravel's password broker.
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
