<?php

use App\Http\Controllers\Auth\EmailVerificationController;
use App\Http\Controllers\CashMovementController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\FinanceDocumentController;
use App\Http\Controllers\FinanceLookupController;
use App\Http\Controllers\PaymentPlanController;
use App\Http\Controllers\TaxComplianceController;
use App\Http\Controllers\ProfileCenterController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\StaffCorrectionController;
use App\Http\Controllers\StaffImportController;
use App\Http\Controllers\StaffInvitationController;
use App\Http\Controllers\StaffWorkforceController;
use App\Http\Controllers\WorkspaceConversationController;
use App\Http\Controllers\WorkspaceConversationSettingsController;
use App\Http\Controllers\WorkspaceMessageMemberController;
use App\Http\Controllers\WorkspaceNotificationController;
use App\Http\Controllers\WorkspaceRoleController;
use App\Http\Controllers\WorkspaceSettingsController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

require __DIR__.'/tasks.php';

Route::get(
    '/join-staff/{token}',
    [
        StaffInvitationController::class,
        'show',
    ],
)
    ->middleware(
        'throttle:30,1',
    )
    ->name(
        'staff.invitation',
    );

Route::post(
    '/api/staff-invitations/{token}/accept',
    [
        StaffInvitationController::class,
        'accept',
    ],
)->middleware([
    'auth',
    'verified',
    'throttle:10,1',
]);

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
Route::middleware(
    'guest',
)->group(function (): void {
    Route::get(
        '/login',
        fn () => Inertia::render(
            'Auth/Login',
        ),
    )->name(
        'login',
    );

    Route::get(
        '/register',
        fn () => Inertia::render(
            'Auth/Register',
        ),
    )->name(
        'register',
    );

    Route::get(
        '/forgot-password',
        fn () => Inertia::render(
            'Auth/ForgotPassword',
        ),
    )->name(
        'password.request',
    );

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
    )->name(
        'password.reset',
    );
});

/*
 * Authenticated users may access verification pages before verification.
 */
Route::middleware(
    'auth',
)->group(function (): void {
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
    )->name(
        'verification.notice',
    );

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
    Route::get('/app/profile', fn () => Inertia::render('Profile'))->name('app.profile');
    Route::get('/app/team-space', fn () => Inertia::render('TeamSpace'))->name('app.team-space');
    Route::get(
        '/app/staff',
        fn () => Inertia::render(
            'StaffHub',
            [
                'staffView' => 'overview',
            ],
        ),
    )->name(
        'app.staff',
    );

    Route::get(
        '/app/staff/directory',
        fn () => Inertia::render(
            'Staff',
        ),
    )->name(
        'app.staff.directory',
    );

    Route::get(
        '/app/staff/attendance',
        fn () => Inertia::render(
            'StaffHub',
            [
                'staffView' => 'attendance',
            ],
        ),
    )->name(
        'app.staff.attendance',
    );

    Route::get(
        '/app/staff/payroll',
        fn () => Inertia::render(
            'StaffHub',
            [
                'staffView' => 'payroll',
            ],
        ),
    )->name(
        'app.staff.payroll',
    );

    Route::get(
        '/app/staff/insights',
        fn () => Inertia::render(
            'StaffHub',
            [
                'staffView' => 'insights',
            ],
        ),
    )->name(
        'app.staff.insights',
    );

    Route::get(
        '/app/staff/import',
        fn () => Inertia::render(
            'StaffImport',
        ),
    )->name(
        'app.staff.import',
    );

    Route::get(
        '/app/departments',
        fn () => Inertia::render(
            'Departments',
        ),
    )->name(
        'app.departments',
    );

    Route::get(
        '/app/roles',
        fn () => Inertia::render(
            'Roles',
        ),
    )->name(
        'app.roles',
    );

    Route::get(
        '/app/settings',
        fn () => Inertia::render(
            'Settings',
        ),
    )->name(
        'app.settings',
    );

    Route::get(
        '/app/invoices',
        fn () => Inertia::render('Finance/Index', ['financeView' => 'sales-list']),
    )->name('app.invoices');

    Route::get(
        '/app/invoices/sales/create',
        fn () => Inertia::render('Finance/Index', ['financeView' => 'sales-create']),
    )->name('app.invoices.sales.create');

    Route::get(
        '/app/invoices/sales/{document}',
        fn (string $document) => Inertia::render('Finance/Index', ['financeView' => 'sales-detail', 'recordId' => (int) $document]),
    )->whereNumber('document')->name('app.invoices.sales.show');

    Route::get(
        '/app/invoices/purchases',
        fn () => Inertia::render('Finance/Index', ['financeView' => 'purchase-list']),
    )->name('app.invoices.purchases');

    Route::get(
        '/app/invoices/purchases/create',
        fn () => Inertia::render('Finance/Index', ['financeView' => 'purchase-create']),
    )->name('app.invoices.purchases.create');

    Route::get(
        '/app/invoices/purchases/{document}',
        fn (string $document) => Inertia::render('Finance/Index', ['financeView' => 'purchase-detail', 'recordId' => (int) $document]),
    )->whereNumber('document')->name('app.invoices.purchases.show');

    Route::get(
        '/app/payments/recurring',
        fn () => Inertia::render('Payments'),
    )->name('app.payments.recurring');

    Route::get(
        '/app/payments',
        fn () => Inertia::render('Finance/Index', ['financeView' => 'payment-list']),
    )->name('app.payments');

    Route::get(
        '/app/payments/create',
        fn () => Inertia::render('Finance/Index', ['financeView' => 'payment-create']),
    )->name('app.payments.create');

    Route::get(
        '/app/payments/{movement}',
        fn (string $movement) => Inertia::render('Finance/Index', ['financeView' => 'payment-detail', 'recordId' => (int) $movement]),
    )->whereNumber('movement')->name('app.payments.show');

    Route::get(
        '/app/receipts',
        fn () => Inertia::render('Finance/Index', ['financeView' => 'receipt-list']),
    )->name('app.receipts');

    Route::get(
        '/app/receipts/create',
        fn () => Inertia::render('Finance/Index', ['financeView' => 'receipt-create']),
    )->name('app.receipts.create');

    Route::get(
        '/app/receipts/{movement}',
        fn (string $movement) => Inertia::render('Finance/Index', ['financeView' => 'receipt-detail', 'recordId' => (int) $movement]),
    )->whereNumber('movement')->name('app.receipts.show');

    Route::get(
        '/app/finance/taxes',
        fn () => Inertia::render('Finance/Index', ['financeView' => 'taxes']),
    )->name('app.finance.taxes');

    Route::get(
        '/app/notifications',
        fn () => Inertia::render(
            'Notifications',
        ),
    )->name(
        'app.notifications',
    );

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

    /*
     * Production is part of Inventory but gets its own operating surface.
     */
    Route::get(
        '/app/inventory/production',
        fn () => Inertia::render(
            'Production/Index',
        ),
    )->name(
        'app.inventory.production',
    );
});

/*
 * Session-authenticated JSON APIs retain Laravel's web middleware stack.
 */
Route::prefix(
    'api',
)->group(function (): void {
    Route::middleware([
        'auth',
        'verified',
        ResolveOrganization::class,
    ])->group(function (): void {
        Route::get(
            'departments',
            [
                DepartmentController::class,
                'index',
            ],
        );

        Route::post(
            'departments',
            [
                DepartmentController::class,
                'store',
            ],
        );

        Route::patch(
            'departments/{department}',
            [
                DepartmentController::class,
                'update',
            ],
        )->whereNumber(
            'department',
        );

        Route::post(
            'staff/{staff}/invitation',
            [
                StaffInvitationController::class,
                'store',
            ],
        )
            ->whereNumber(
                'staff',
            )
            ->middleware(
                'throttle:10,1',
            );

        Route::post(
            'staff/{staff}/accrue',
            [
                StaffController::class,
                'accrue',
            ],
        )->whereNumber(
            'staff',
        );

        Route::delete('staff/{staff}', [StaffCorrectionController::class, 'destroy'])->whereNumber('staff');
        Route::match(['PATCH', 'DELETE'], 'staff/{staff}/entries/{entry}', [StaffCorrectionController::class, 'entry'])->whereNumber(['staff', 'entry']);
        Route::match(['PATCH', 'DELETE'], 'staff/{staff}/attendance/{attendance}', [StaffCorrectionController::class, 'attendance'])->whereNumber(['staff', 'attendance']);
        Route::match(['PATCH', 'DELETE'], 'staff/{staff}/adjustments/{adjustment}/correct', [StaffCorrectionController::class, 'adjustment'])->whereNumber(['staff', 'adjustment']);
        Route::get('team-space', [WorkspaceConversationController::class, 'index']);
        Route::get('team-space/people', [WorkspaceConversationController::class, 'people']);
        Route::put('team-space/{conversation}/people/{member}/admin', [WorkspaceMessageMemberController::class, 'admin'])->whereNumber(['conversation', 'member'])->middleware('throttle:30,1');
        Route::get('team-space/{conversation}/settings', [WorkspaceConversationSettingsController::class, 'show'])->whereNumber('conversation');
        Route::post('team-space/{conversation}/settings', [WorkspaceConversationSettingsController::class, 'update'])->whereNumber('conversation')->middleware('throttle:30,1');
        Route::get('team-space/{conversation}/library', [WorkspaceConversationSettingsController::class, 'library'])->whereNumber('conversation');
        Route::get('team-space/{conversation}/avatar', [WorkspaceConversationSettingsController::class, 'avatar'])->whereNumber('conversation')->name('team-space.avatar');
        Route::get('team-space/{conversation}/people/{member}', [WorkspaceMessageMemberController::class, 'show'])->whereNumber(['conversation', 'member']);
        Route::get('team-space/{conversation}/people/{member}/avatar', [WorkspaceMessageMemberController::class, 'avatar'])->whereNumber(['conversation', 'member'])->name('team-space.member-avatar');
        Route::put('team-space/{conversation}/people/{member}/restriction', [WorkspaceMessageMemberController::class, 'update'])->whereNumber(['conversation', 'member'])->middleware('throttle:30,1');
        Route::post('team-space', [WorkspaceConversationController::class, 'store'])->middleware('throttle:10,1');
        Route::get('team-space/{conversation}/messages', [WorkspaceConversationController::class, 'messages'])->whereNumber('conversation');
        Route::post('team-space/{conversation}/messages', [WorkspaceConversationController::class, 'send'])->whereNumber('conversation')->middleware('throttle:60,1');
        Route::patch('team-space/{conversation}/members', [WorkspaceConversationController::class, 'members'])->whereNumber('conversation');
        Route::match(['PATCH', 'DELETE'], 'team-space/{conversation}/messages/{message}', [WorkspaceConversationController::class, 'updateMessage'])->whereNumber(['conversation', 'message']);
        Route::get(
            'staff',
            [
                StaffController::class,
                'index',
            ],
        );

        Route::get(
            'staff-overview',
            [
                StaffController::class,
                'overview',
            ],
        );

        Route::post(
            'staff-import/preview',
            [
                StaffImportController::class,
                'preview',
            ],
        )->middleware(
            'throttle:12,1',
        );

        Route::post(
            'staff-import/commit',
            [
                StaffImportController::class,
                'commit',
            ],
        )->middleware(
            'throttle:6,1',
        );

        Route::post(
            'staff',
            [
                StaffController::class,
                'store',
            ],
        );

        Route::patch(
            'staff/{staff}',
            [
                StaffController::class,
                'update',
            ],
        )->whereNumber(
            'staff',
        );

        Route::get(
            'staff/{staff}/ledger',
            [
                StaffController::class,
                'ledger',
            ],
        )->whereNumber(
            'staff',
        );

        Route::get('staff/{staff}/workforce', [StaffWorkforceController::class, 'index'])->whereNumber('staff');
        Route::post('staff/{staff}/attendance', [StaffWorkforceController::class, 'attendance'])->whereNumber('staff');
        Route::post('staff/{staff}/adjustments', [StaffWorkforceController::class, 'adjustment'])->whereNumber('staff');
        Route::patch('staff/{staff}/adjustments/{adjustment}', [StaffWorkforceController::class, 'stopAdjustment'])->whereNumber(['staff', 'adjustment']);
        Route::post('staff/{staff}/adjustments/accrue', [StaffWorkforceController::class, 'accrue'])->whereNumber('staff');
        Route::post(
            'staff/{staff}/entries',
            [
                StaffController::class,
                'record',
            ],
        )->whereNumber(
            'staff',
        );

        Route::get('finance/lookups', FinanceLookupController::class);

        Route::get('finance/documents', [FinanceDocumentController::class, 'index']);
        Route::post('finance/documents', [FinanceDocumentController::class, 'store']);
        Route::get('finance/documents/{document}', [FinanceDocumentController::class, 'show'])->whereNumber('document');
        Route::patch('finance/documents/{document}', [FinanceDocumentController::class, 'update'])->whereNumber('document');
        Route::post('finance/documents/{document}/issue', [FinanceDocumentController::class, 'issue'])->whereNumber('document');
        Route::post('finance/documents/{document}/correct', [FinanceDocumentController::class, 'correct'])->whereNumber('document');
        Route::post('finance/documents/{document}/void', [FinanceDocumentController::class, 'void'])->whereNumber('document');

        Route::get('finance/cash-movements', [CashMovementController::class, 'index']);
        Route::post('finance/cash-movements', [CashMovementController::class, 'store']);
        Route::get('finance/cash-movements/{movement}', [CashMovementController::class, 'show'])->whereNumber('movement');
        Route::patch('finance/cash-movements/{movement}', [CashMovementController::class, 'update'])->whereNumber('movement');
        Route::post('finance/cash-movements/{movement}/post', [CashMovementController::class, 'post'])->whereNumber('movement');
        Route::post('finance/cash-movements/{movement}/reverse', [CashMovementController::class, 'reverse'])->whereNumber('movement');
        Route::post('finance/cash-movements/{movement}/correct', [CashMovementController::class, 'correct'])->whereNumber('movement');
        Route::patch('finance/cash-movements/{movement}/check-status', [CashMovementController::class, 'checkStatus'])->whereNumber('movement');

        Route::get('finance/taxes', [TaxComplianceController::class, 'index']);
        Route::post('finance/tax-rules', [TaxComplianceController::class, 'storeRule']);
        Route::patch('finance/tax-rules/{taxRule}', [TaxComplianceController::class, 'updateRule'])->whereNumber('taxRule');
        Route::post('finance/government-obligations', [TaxComplianceController::class, 'storeObligation']);

        Route::get(
            'workspace-roles',
            [
                WorkspaceRoleController::class,
                'index',
            ],
        );

        Route::patch(
            'workspace-roles/{workspaceRole}',
            [
                WorkspaceRoleController::class,
                'store',
            ],
        )->whereNumber(
            'workspaceRole',
        );

        Route::post(
            'workspace-roles',
            [
                WorkspaceRoleController::class,
                'store',
            ],
        );

        Route::post(
            'workspace-roles/preview',
            [
                WorkspaceRoleController::class,
                'preview',
            ],
        );

        Route::post(
            'workspace-roles/assign',
            [
                WorkspaceRoleController::class,
                'assign',
            ],
        );

        Route::get(
            'workspace-settings',
            [
                WorkspaceSettingsController::class,
                'show',
            ],
        );

        Route::patch(
            'workspace-settings',
            [
                WorkspaceSettingsController::class,
                'update',
            ],
        );

        Route::get(
            'notifications',
            [
                WorkspaceNotificationController::class,
                'index',
            ],
        );

        Route::get(
            'notifications/count',
            [
                WorkspaceNotificationController::class,
                'count',
            ],
        );

        Route::post(
            'notifications/read-all',
            [
                WorkspaceNotificationController::class,
                'readAll',
            ],
        );

        Route::patch(
            'notifications/{notification}/read',
            [
                WorkspaceNotificationController::class,
                'read',
            ],
        )->whereNumber(
            'notification',
        );
    });

    Route::middleware([
        'auth',
        'verified',
        ResolveOrganization::class,
    ])->group(function (): void {
        Route::get(
            'payment-plans',
            [
                PaymentPlanController::class,
                'index',
            ],
        );

        Route::post(
            'payment-plans',
            [
                PaymentPlanController::class,
                'store',
            ],
        );

        Route::get(
            'payment-plans/reminders',
            [
                PaymentPlanController::class,
                'reminders',
            ],
        );

        Route::get(
            'payment-records',
            [
                PaymentPlanController::class,
                'history',
            ],
        );

        Route::patch(
            'payment-plans/{plan}',
            [
                PaymentPlanController::class,
                'toggle',
            ],
        )->whereNumber(
            'plan',
        );

        Route::post(
            'payment-plans/{plan}/record',
            [
                PaymentPlanController::class,
                'record',
            ],
        )->whereNumber(
            'plan',
        );
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

Route::middleware(['auth', 'throttle:30,1'])->prefix('api/profile')->group(function (): void {
    Route::get('/center', [ProfileCenterController::class, 'show']);
    Route::get('/preferences', [ProfileCenterController::class, 'preferenceSettings']);
    Route::put('/preferences', [ProfileCenterController::class, 'preferences']);
    Route::post('/files', [ProfileCenterController::class, 'upload']);
    Route::patch('/files/{file}', [ProfileCenterController::class, 'updateFile'])->whereNumber('file');
    Route::get('/files/{file}/download', [ProfileCenterController::class, 'download'])->whereNumber('file')->name('profile.files.download');
    Route::get('/', [ProfileController::class, 'show']);
    Route::patch('/', [ProfileController::class, 'update']);
    Route::get('/avatar', [ProfileController::class, 'avatar'])->name('profile.avatar');
    Route::post('/avatar', [ProfileController::class, 'uploadAvatar']);
    Route::patch('/password', [ProfileController::class, 'password'])->middleware('throttle:6,1');
    Route::delete('/sessions', [ProfileController::class, 'sessions'])->middleware('throttle:6,1');
    Route::post('/email', [ProfileController::class, 'email'])->middleware('throttle:6,1');
    Route::get('/email/confirm', [ProfileController::class, 'confirmEmail'])->middleware('signed')->name('profile.email.confirm');
});
