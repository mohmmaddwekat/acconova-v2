<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    /**
     * Allow login validation when the guest route accepts the request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Validate the credentials required for session authentication.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'email' => [
                'required',
                'email',
            ],

            'password' => [
                'required',
                'string',
            ],
        ];
    }

    /**
     * Normalize email casing and surrounding whitespace before authentication.
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
