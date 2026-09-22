<?php

namespace App\Http\Controllers;

use App\Services\Billing\BillingWebhookService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use Throwable;

class BillingWebhookController extends Controller
{
    public function __invoke(
        Request $request,
        BillingWebhookService $webhooks,
    ): JsonResponse {
        try {
            $webhooks->handle($request);
        } catch (InvalidArgumentException $exception) {
            report($exception);

            return response()->json([
                'message' => 'Invalid webhook request.',
            ], 400);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Webhook processing failed.',
            ], 500);
        }

        return response()->json([
            'received' => true,
        ]);
    }
}
