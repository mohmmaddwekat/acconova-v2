<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class TranslateMarketingResponse
{
    /**
     * Translate the server-rendered public marketing surface after Blade has
     * produced HTML. Arabic therefore remains visible in the initial HTML for
     * people, search crawlers and answer engines rather than being injected by
     * client-side JavaScript after load.
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

        $translations = array_merge(
            (array) config('marketing_translations.ar', []),
            (array) config('marketing_solution_translations.ar', []),
        );

        if ($translations !== []) {
            /*
             * Longest strings are replaced first so a short shared label such
             * as "Pricing" cannot partially alter a longer sentence before
             * that sentence receives its intended Arabic copy.
             */
            uksort(
                $translations,
                static fn (string $left, string $right): int => strlen($right) <=> strlen($left),
            );
            $content = strtr($content, $translations);
        }

        $response->setContent($content);
        $response->headers->set('Content-Language', 'ar');

        return $response;
    }
}
