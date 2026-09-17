<?php

namespace App\Exceptions;

use Illuminate\Validation\ValidationException;

class ProductionRunValidationException extends ValidationException
{
    /**
     * Stable business error codes safe for production-run API consumers.
     *
     * @var array<string, list<string>>
     */
    public array $safeErrorCodes = [];

    /**
     * Create one localized production-run validation failure.
     */
    public static function forField(
        string $field,
        string $code,
    ): self {
        /** @var self $exception */
        $exception =
            self::withMessages([
                $field => [
                    __(
                        'production_runs.'
                            .$code,
                    ),
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
