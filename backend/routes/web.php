<?php

use App\Http\Controllers\Auth\EmailVerificationController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get(
    '/',
    fn () => response()->json([
        'name' => 'AccoNova',
        'phase' => 0,
    ]),
);

/*
 * Guest browser authentication and account-recovery pages.
 */
Route::middleware('guest')->group(function (): void {
    Route::get(
        '/login',
        fn () => Inertia::render('Auth/Login'),
    )->name('login');

    Route::get(
        '/register',
        fn () => Inertia::render('Auth/Register'),
    )->name('register');

    Route::get(
        '/forgot-password',
        fn () => Inertia::render(
            'Auth/ForgotPassword',
        ),
    )->name('password.request');

    Route::get(
        '/reset-password/{token}',
        /**
         * Forward Laravel's secure reset token and account email into the
         * React reset-password surface.
         */
        fn (
            Request $request,
            string $token,
        ) => Inertia::render(
            'Auth/ResetPassword',
            [
                'token' => $token,
                'email' => $request
                    ->string('email')
                    ->toString(),
            ],
        ),
    )->name('password.reset');
});

/*
 * An authenticated user may access verification screens before their email
 * has been verified.
 */
Route::middleware('auth')->group(function (): void {
    Route::get(
        '/verify-email',
        /**
         * Verified users have no reason to remain on the verification notice.
         */
        function (Request $request) {
            if (
                $request->user()
                    ->hasVerifiedEmail()
            ) {
                return redirect('/app');
            }

            return Inertia::render(
                'Auth/VerifyEmail',
            );
        },
    )->name('verification.notice');

    Route::get(
        '/verify-email/{id}/{hash}',
        [
            EmailVerificationController::class,
            'verify',
        ],
    )
        ->middleware([
            'signed',
            'throttle:6,1',
        ])
        ->name('verification.verify');
});

/*
 * Normal application pages require both authentication and verified email.
 */
Route::middleware([
    'auth',
    'verified',
])->group(function (): void {
    Route::get(
        '/onboarding/workspace',
        fn () => Inertia::render(
            'Onboarding/Workspace',
        ),
    )->name('onboarding.workspace');

    Route::get(
        '/app',
        fn () => Inertia::render(
            'Dashboard',
        ),
    )->name('app.dashboard');

    Route::get(
        '/app/parties',
        fn () => Inertia::render(
            'Parties/Index',
        ),
    )->name('app.parties');
});

/*
 * Session-authenticated JSON APIs retain Laravel's web middleware stack.
 */
Route::prefix('api')->group(function (): void {
    require __DIR__.'/api/auth.php';
    require __DIR__.'/api/organizations.php';
    require __DIR__.'/api/memberships.php';
    require __DIR__.'/api/parties.php';
});
