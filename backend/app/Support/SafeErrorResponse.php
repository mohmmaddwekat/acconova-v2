<?php

namespace App\Support;

use App\Exceptions\SafeValidationException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class SafeErrorResponse
{
    /**
     * Sanitize rendered failures after Laravel reports the original exception.
     *
     * Stable AccoNova business-error codes are translated safely while unknown
     * exception text, SQL errors, classes, and stack traces never reach users.
     */
    public static function render(
        Response $response,
        Throwable $exception,
        Request $request,
    ): Response {
        $status =
            $response->getStatusCode();

        if (
            $status < 400
        ) {
            return $response;
        }

        $code =
            match ($status) {
                401, 419 => 'session',

                403 => 'forbidden',

                404 => 'not_found',

                409 => 'conflict',

                413 => 'file',

                422 => 'validation',

                429 => 'throttled',

                default => 'unexpected',
            };

        $payload = [
            'message' => __(
                'feedback.'.$code,
            ),

            'code' => $code,
        ];

        if (
            $exception instanceof ValidationException
        ) {
            $failed =
                $exception
                    ->validator
                    ->failed();

            $safeCustomMessages = [
                'password' => [
                    __(
                        'feedback.password_reuse',
                    ) => 'password_reuse',
                ],
            ];

            foreach (
                $exception->errors() as $field => $messages
            ) {
                if (
                    $exception instanceof SafeValidationException
                ) {
                    $safeCodes =
                        $exception
                            ->safeErrorCodes[$field] ?? [];

                    if (
                        $safeCodes !==
                        []
                    ) {
                        $safeCode =
                            $safeCodes[0];

                        $payload['errors'][$field] = [
                            __(
                                'feedback.'
                                    .$safeCode,
                            ),
                        ];

                        $payload['error_codes'][$field] =
                            $safeCodes;

                        continue;
                    }
                }

                $rules =
                    array_map(
                        strtolower(...),
                        array_keys(
                            $failed[$field] ?? [],
                        ),
                    );

                $safeCustomRule =
                    null;

                foreach (
                    $messages as $message
                ) {
                    if (
                        isset(
                            $safeCustomMessages[$field][$message],
                        )
                    ) {
                        $safeCustomRule =
                            $safeCustomMessages[$field][$message];

                        break;
                    }
                }

                $rule =
                    $safeCustomRule
                    ?? (
                        in_array(
                            'unique',
                            $rules,
                            true,
                        )
                        ? (
                            in_array(
                                $field,
                                [
                                    'sku',
                                    'email',
                                ],
                                true,
                            )
                            ? $field
                            : 'unique'
                        )
                        : (
                            in_array(
                                'required',
                                $rules,
                                true,
                            )
                            ? 'required'
                            : 'invalid'
                        )
                    );

                $payload['errors'][$field] = [
                    __(
                        'feedback.'.$rule,
                    ),
                ];

                $payload['error_codes'][$field] =
                    $rules !== []
                    ? $rules
                    : [
                        $rule,
                    ];
            }
        }

        if (
            $request->is(
                'api/*',
            )
            ||
            $request->expectsJson()
        ) {
            $safe =
                response()->json(
                    $payload,
                    $status,
                );

            if (
                $response
                    ->headers
                    ->has(
                        'Retry-After',
                    )
            ) {
                $safe
                    ->headers
                    ->set(
                        'Retry-After',
                        $response
                            ->headers
                            ->get(
                                'Retry-After',
                            ),
                    );
            }

            return $safe;
        }

        return response()->view(
            'errors.safe',
            [
                'message' => $payload['message'],
            ],
            $status,
        );
    }
}
