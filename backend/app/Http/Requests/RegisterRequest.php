<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class RegisterRequest extends FormRequest
{
    /**
     * Allow registration only when the route middleware permits the request.
     *
     * The registration route is already protected by the guest middleware.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Validate the fields accepted when creating an AccoNova user account.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => [
                'required',
                'string',
                'max:255',
            ],

            'email' => [
                'required',
                'email',
                'max:255',
                'unique:users,email',
            ],

            'password' => [
                'required',
                'confirmed',
                Password::min(12),
            ],
        ];
    }

    /**
     * Normalize the email address before uniqueness and format validation.
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
