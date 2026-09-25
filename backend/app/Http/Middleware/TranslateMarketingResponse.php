<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class TranslateMarketingResponse
{
    /**
     * Translate the server-rendered public marketing surface after Blade has
     * produced HTML. This keeps Arabic content visible to crawlers while the
     * underlying English templates remain the canonical copy source.
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (app()->getLocale() !== 'ar') {
            return $response;
        }

        $contentType = (string) $response->headers->get('Content-Type', '');

        if ($contentType !== '' && ! str_contains(strtolower($contentType), 'text/html')) {
            return $response;
        }

        if (! method_exists($response, 'getContent') || ! method_exists($response, 'setContent')) {
            return $response;
        }

        $content = $response->getContent();

        if (! is_string($content) || $content === '') {
            return $response;
        }

        $translations = config('marketing_translations.ar', []);

        if (is_array($translations) && $translations !== []) {
            $content = strtr($content, $translations);
        }

        $response->setContent($content);
        $response->headers->set('Content-Language', 'ar');

        return $response;
    }
}
