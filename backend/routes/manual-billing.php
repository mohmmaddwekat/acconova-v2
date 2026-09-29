<?php

use App\Http\Controllers\Billing\BillingManualPaymentRequestController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

Route::middleware([
    'auth',
    'verified',
    ResolveOrganization::class,
])
    ->prefix('api/billing/manual-payment-requests')
    ->group(function (): void {
        Route::get('/current', [BillingManualPaymentRequestController::class, 'current']);
        Route::post('/', [BillingManualPaymentRequestController::class, 'store'])
            ->middleware('throttle:20,1');
        Route::delete('/{payment}', [BillingManualPaymentRequestController::class, 'cancel'])
            ->whereNumber('payment')
            ->middleware('throttle:20,1');
    });
