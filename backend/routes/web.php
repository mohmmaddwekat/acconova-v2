<?php

use Illuminate\Support\Facades\Route;

Route::get(
    '/',
    fn () => response()->json([
        'name' => 'AccoNova',
        'phase' => 0,
    ]),
);

/*
 * AccoNova's JSON API currently uses Laravel's session authentication.
 *
 * Keeping these routes loaded from web.php preserves the web middleware
 * stack, including encrypted cookies, session state, and CSRF protection.
 * The individual route files only separate business modules for maintainability.
 */
Route::prefix('api')->group(function (): void {
    require __DIR__.'/api/auth.php';
    require __DIR__.'/api/organizations.php';
    require __DIR__.'/api/memberships.php';
    require __DIR__.'/api/parties.php';
});
