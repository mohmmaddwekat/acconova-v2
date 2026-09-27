<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class McpProtocolCompatibility
{
    private const CURRENT_VERSION = '2025-11-25';

    /** @var list<string> */
    private const SUPPORTED_VERSIONS = [
        self::CURRENT_VERSION,
        '2025-06-18',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $method = (string) $request->input('method', '');
        $selectedVersion = $this->selectedVersion($request);
        $headerVersion = trim((string) $request->header('MCP-Protocol-Version', ''));

        if (
            $method !== 'initialize'
            && $headerVersion !== ''
            && ! in_array($headerVersion, self::SUPPORTED_VERSIONS, true)
        ) {
            return response()->json([
                'jsonrpc' => '2.0',
                'id' => $request->input('id'),
                'error' => [
                    'code' => -32600,
                    'message' => 'Unsupported MCP protocol version.',
                    'data' => [
                        'supported' => self::SUPPORTED_VERSIONS,
                    ],
                ],
            ], 400)->header('MCP-Protocol-Version', self::CURRENT_VERSION);
        }

        if (
            $request->input('id') === null
            && str_starts_with($method, 'notifications/')
        ) {
            return response('', 202)
                ->header('MCP-Protocol-Version', $selectedVersion);
        }

        $response = $next($request);

        if ($method === 'initialize' && $response instanceof JsonResponse) {
            $payload = $response->getData(true);

            if (isset($payload['result']) && is_array($payload['result'])) {
                $payload['result']['protocolVersion'] = $selectedVersion;

                foreach (['tools', 'resources', 'prompts'] as $capability) {
                    if (isset($payload['result']['capabilities'][$capability])) {
                        $payload['result']['capabilities'][$capability]['listChanged'] = false;
                    }
                }

                $response->setData($payload);
            }
        }

        $response->headers->set('MCP-Protocol-Version', $selectedVersion);

        return $response;
    }

    private function selectedVersion(Request $request): string
    {
        $requested = trim((string) $request->input('params.protocolVersion', ''));

        if (in_array($requested, self::SUPPORTED_VERSIONS, true)) {
            return $requested;
        }

        $header = trim((string) $request->header('MCP-Protocol-Version', ''));

        if (in_array($header, self::SUPPORTED_VERSIONS, true)) {
            return $header;
        }

        return self::CURRENT_VERSION;
    }
}
