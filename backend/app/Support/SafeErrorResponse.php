<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class SafeErrorResponse
{
    /**
     * Sanitize rendered failures after Laravel reports the original exception.
     *
     * Only explicitly allowlisted domain validation messages may survive.
     * Unknown custom messages are replaced with safe translated copy so SQL,
     * stack traces, class names, and implementation details never reach users.
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

            /*
             * These messages originate from our own translated domain catalog,
             * not from arbitrary exception text.
             */
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

                /*
                 * Stable error codes allow the React application to translate
                 * or specialize feedback without trusting raw server messages.
                 */
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
            ) ||
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
