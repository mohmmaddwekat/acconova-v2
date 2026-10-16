<?php

use App\Http\Controllers\Collections\CollectionFollowUpController;
use App\Http\Controllers\Finance\CashFlowForecastController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

/*
 * Collections follow-up: alert rules, the follow-up queue and the contact log.
 * Alerts stay inside the application; nothing here sends a message.
 */

Route::middleware([
    'auth',
    'verified',
    ResolveOrganization::class,
])->group(function (): void {
    Route::get('collections/follow-ups', [CollectionFollowUpController::class, 'index']);
    Route::get('finance/cash-flow-forecast', [CashFlowForecastController::class, 'show']);
    Route::get('collections/rules', [CollectionFollowUpController::class, 'rules']);
    Route::put('collections/rules/{kind}', [CollectionFollowUpController::class, 'updateRule'])->middleware('throttle:30,1');
    Route::post('collections/alerts/{alert}/snooze', [CollectionFollowUpController::class, 'snooze'])->whereNumber('alert')->middleware('throttle:30,1');
    Route::post('collections/alerts/{alert}/resolve', [CollectionFollowUpController::class, 'resolve'])->whereNumber('alert')->middleware('throttle:30,1');
    Route::get('parties/{party}/collection-contacts', [CollectionFollowUpController::class, 'contacts'])->whereNumber('party');
    Route::post('parties/{party}/collection-contacts', [CollectionFollowUpController::class, 'logContact'])->whereNumber('party')->middleware('throttle:30,1');
});
