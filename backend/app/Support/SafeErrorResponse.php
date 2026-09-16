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
     * Sanitize rendered errors after Laravel reports the original exception.
     *
     * Authorization, status codes and tenant resolution remain owned by
     * Laravel. Only explicitly allowlisted business-validation codes may
     * preserve specific translated field feedback.
     */
    public static function render(Response $response, Throwable $exception, Request $request): Response
    {
        $status = $response->getStatusCode();

        if ($status < 400) {
            return $response;
        }

        $code = match ($status) {
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
            'message' => __('feedback.'.$code),
            'code' => $code,
        ];

        if ($exception instanceof SafeValidationException) {
            foreach ($exception->safeErrorCodes as $field => $codes) {
                $safeCode = $codes[0] ?? 'invalid';

                $payload['errors'][$field] = [
                    __('feedback.'.$safeCode),
                ];

                $payload['error_codes'][$field] = [
                    $safeCode,
                ];
            }
        } elseif ($exception instanceof ValidationException) {
            $failed = $exception->validator->failed();

            foreach ($exception->errors() as $field => $messages) {
                $rules = array_map(
                    strtolower(...),
                    array_keys(
                        $failed[$field] ?? [],
                    ),
                );

                $rule = in_array('unique', $rules, true)
                    ? (
                        in_array($field, ['sku', 'email'], true)
                            ? $field
                            : 'unique'
                    )
                    : (
                        in_array('required', $rules, true)
                            ? 'required'
                            : 'invalid'
                    );

                $payload['errors'][$field] = [
                    __('feedback.'.$rule),
                ];

                $payload['error_codes'][$field] = $rules;
            }
        }

        if ($request->is('api/*') || $request->expectsJson()) {
            $safe = response()->json(
                $payload,
                $status,
            );

            if ($response->headers->has('Retry-After')) {
                $safe->headers->set(
                    'Retry-After',
                    $response->headers->get('Retry-After'),
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
