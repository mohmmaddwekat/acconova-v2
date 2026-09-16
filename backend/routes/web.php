<?php

use App\Http\Controllers\Auth\EmailVerificationController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\PaymentPlanController;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\WorkspaceNotificationController;
use App\Http\Controllers\WorkspaceRoleController;
use App\Http\Controllers\WorkspaceSettingsController;
use App\Http\Middleware\ResolveOrganization;
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
        fn () => Inertia::render(
            'Auth/Login',
        ),
    )->name('login');

    Route::get(
        '/register',
        fn () => Inertia::render(
            'Auth/Register',
        ),
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
         * Forward Laravel's reset token and account email into React.
         */
        fn (
            Request $request,
            string $token,
        ) => Inertia::render(
            'Auth/ResetPassword',
            [
                'token' => $token,

                'email' => $request
                    ->string(
                        'email',
                    )
                    ->toString(),
            ],
        ),
    )->name('password.reset');
});

/*
 * Authenticated users may access verification pages before verification.
 */
Route::middleware('auth')->group(function (): void {
    Route::get(
        '/verify-email',
        /**
         * Verified users should return to the application immediately.
         */
        function (
            Request $request,
        ) {
            if (
                $request
                    ->user()
                    ->hasVerifiedEmail()
            ) {
                return redirect(
                    '/app',
                );
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
        ->name(
            'verification.verify',
        );
});

/*
 * Normal application pages require authentication and verified email.
 */
Route::middleware([
    'auth',
    'verified',
])->group(function (): void {
    Route::get('/app/staff', fn () => Inertia::render('Staff'))->name('app.staff');
    Route::get('/app/departments', fn () => Inertia::render('Departments'))->name('app.departments');
    Route::get('/app/roles', fn () => Inertia::render('Roles'))->name('app.roles');
    Route::get('/app/settings', fn () => Inertia::render('Settings'))->name('app.settings');
    Route::get('/app/payments', fn () => Inertia::render('Payments'))->name('app.payments');
    Route::get('/app/notifications', fn () => Inertia::render('Notifications'))->name('app.notifications');
    Route::get(
        '/onboarding/workspace',
        fn () => Inertia::render(
            'Onboarding/Workspace',
        ),
    )->name(
        'onboarding.workspace',
    );

    Route::get(
        '/app',
        fn () => Inertia::render(
            'Dashboard',
        ),
    )->name(
        'app.dashboard',
    );

    Route::get(
        '/app/parties',
        fn () => Inertia::render(
            'Parties/Index',
        ),
    )->name(
        'app.parties',
    );

    Route::get(
        '/app/products',
        fn () => Inertia::render(
            'Products/Index',
        ),
    )->name(
        'app.products',
    );

    Route::get(
        '/app/inventory',
        fn () => Inertia::render(
            'Inventory/Index',
        ),
    )->name(
        'app.inventory',
    );
});

/*
 * Session-authenticated JSON APIs retain Laravel's web middleware stack.
 */
Route::prefix('api')->group(function (): void {
    Route::middleware(['auth', 'verified', ResolveOrganization::class])->group(function (): void {
        Route::get('departments', [DepartmentController::class, 'index']);
        Route::post('departments', [DepartmentController::class, 'store']);
        Route::patch('departments/{department}', [DepartmentController::class, 'update'])->whereNumber('department');
        Route::get('staff', [StaffController::class, 'index']);
        Route::post('staff', [StaffController::class, 'store']);
        Route::patch('staff/{staff}', [StaffController::class, 'update'])->whereNumber('staff');
        Route::get('staff/{staff}/ledger', [StaffController::class, 'ledger'])->whereNumber('staff');
        Route::post('staff/{staff}/entries', [StaffController::class, 'record'])->whereNumber('staff');
        Route::get('workspace-roles', [WorkspaceRoleController::class, 'index']);
        Route::patch('workspace-roles/{workspaceRole}', [WorkspaceRoleController::class, 'store'])->whereNumber('workspaceRole');
        Route::post('workspace-roles', [WorkspaceRoleController::class, 'store']);
        Route::post('workspace-roles/assign', [WorkspaceRoleController::class, 'assign']);
        Route::get('workspace-settings', [WorkspaceSettingsController::class, 'show']);
        Route::patch('workspace-settings', [WorkspaceSettingsController::class, 'update']);
        Route::get('notifications', [WorkspaceNotificationController::class, 'index']);
        Route::get('notifications/count', [WorkspaceNotificationController::class, 'count']);
        Route::post('notifications/read-all', [WorkspaceNotificationController::class, 'readAll']);
        Route::patch('notifications/{notification}/read', [WorkspaceNotificationController::class, 'read'])->whereNumber('notification');
    });
    Route::middleware(['auth', 'verified', ResolveOrganization::class])->group(function (): void {
        Route::get('payment-plans', [PaymentPlanController::class, 'index']);
        Route::post('payment-plans', [PaymentPlanController::class, 'store']);
        Route::get('payment-plans/reminders', [PaymentPlanController::class, 'reminders']);
        Route::get('payment-records', [PaymentPlanController::class, 'history']);
        Route::patch('payment-plans/{plan}', [PaymentPlanController::class, 'toggle'])->whereNumber('plan');
        Route::post('payment-plans/{plan}/record', [PaymentPlanController::class, 'record'])->whereNumber('plan');
    });
    require __DIR__
        .'/api/auth.php';

    require __DIR__
        .'/api/organizations.php';

    require __DIR__
        .'/api/memberships.php';

    require __DIR__
        .'/api/parties.php';

    require __DIR__
        .'/api/products.php';

    require __DIR__
        .'/api/inventory.php';
});
