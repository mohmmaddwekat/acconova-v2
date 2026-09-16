<?php

namespace App\Exceptions;

use Illuminate\Validation\ValidationException;

class SafeValidationException extends ValidationException
{
    /**
     * Stable, explicitly allowlisted business-validation codes keyed by field.
     *
     * @var array<string, list<string>>
     */
    public array $safeErrorCodes = [];

    /**
     * Build one translated business-validation error without exposing internal
     * exception text to API consumers.
     */
    public static function forField(string $field, string $code): self
    {
        /** @var self $exception */
        $exception = self::withMessages([
            $field => [
                __('feedback.'.$code),
            ],
        ]);

        $exception->safeErrorCodes = [
            $field => [
                $code,
            ],
        ];

        return $exception;
    }
}
