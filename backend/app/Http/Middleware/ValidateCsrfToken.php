<?php

namespace App\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken as BaseValidateCsrfToken;
use Illuminate\Http\Request;

/**
 * CSRF protects cookie-authenticated browsers. Requests authenticated by a
 * mobile bearer token carry no ambient credentials, so they are exempt.
 */
class ValidateCsrfToken extends BaseValidateCsrfToken
{
    /**
     * @param  Request  $request
     */
    protected function inExceptArray($request): bool
    {
        return $request->attributes->get('mobile_token_auth') === true
            || parent::inExceptArray($request);
    }
}
