<?php

use App\Http\Controllers\AiCreditSettingsController;
use App\Http\Controllers\BillingGrowthController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified', ResolveOrganization::class])->group(function (): void {
    Route::get('/api/billing/growth', [BillingGrowthController::class, 'show']);
    Route::post('/api/billing/addons/purchase', [BillingGrowthController::class, 'purchaseAddon'])->middleware('throttle:10,1');
    Route::post('/api/billing/ai-credits/checkout', [BillingGrowthController::class, 'purchaseAiCredits'])->middleware('throttle:10,1');
    Route::put('/api/billing/ai-credits/auto-recharge', [AiCreditSettingsController::class, 'update'])->middleware('throttle:20,1');
    Route::post('/api/billing/growth/trial/extend', [BillingGrowthController::class, 'extendTrial'])->middleware('throttle:5,1');
    Route::post('/api/billing/growth/cancel', [BillingGrowthController::class, 'cancel'])->middleware('throttle:5,1');
    Route::post('/api/billing/growth/resume-renewal', [BillingGrowthController::class, 'resumeRenewal'])->middleware('throttle:5,1');
    Route::post('/api/billing/growth/pause', [BillingGrowthController::class, 'pause'])->middleware('throttle:5,1');
    Route::post('/api/billing/growth/resume', [BillingGrowthController::class, 'resume'])->middleware('throttle:5,1');
    Route::put('/api/billing/growth/spend-cap', [BillingGrowthController::class, 'spendCap'])->middleware('throttle:20,1');
    Route::post('/api/billing/growth/referrals', [BillingGrowthController::class, 'referral'])->middleware('throttle:10,1');
    Route::post('/api/billing/growth/offers/redeem', [BillingGrowthController::class, 'redeem'])->middleware('throttle:10,1');
    Route::get('/app/billing/invoices/{invoice}', [BillingGrowthController::class, 'invoice'])
        ->whereNumber('invoice')
        ->name('billing.invoice.local');
});
