<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\HttpFoundation\Response;

final class ValidateMcpProtocolRequest
{
    public function handle(Request $request, Closure $next): Response
    {
        $validator = Validator::make($request->all(), [
            'jsonrpc' => ['required', 'in:2.0'],
            'id' => ['nullable'],
            'method' => ['required', 'string', 'max:120'],
            'params' => ['nullable', 'array'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'jsonrpc' => '2.0',
                'id' => $request->input('id'),
                'error' => [
                    'code' => -32600,
                    'message' => 'Invalid JSON-RPC request.',
                    'data' => [
                        'fields' => $validator->errors()->keys(),
                    ],
                ],
            ]);
        }

        return $next($request);
    }
}
