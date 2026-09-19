<?php

use App\Http\Controllers\TaskManagementController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

/*
 * Task Management is registered by its own provider so the existing large
 * routes/web.php file does not need to be replaced.
 */

Route::middleware([
    'web',
    'auth',
    'verified',
    ResolveOrganization::class,
])->group(function (): void {
    Route::get(
        '/app/task-management',
        [
            TaskManagementController::class,
            'page',
        ],
    )->name(
        'tasks.dashboard',
    );

    Route::get(
        '/app/task-management/tasks',
        [
            TaskManagementController::class,
            'page',
        ],
    )->name(
        'tasks.index',
    );

    Route::get(
        '/app/task-management/projects',
        [
            TaskManagementController::class,
            'page',
        ],
    )->name(
        'tasks.projects',
    );

    Route::get(
        '/app/task-management/team',
        [
            TaskManagementController::class,
            'page',
        ],
    )->name(
        'tasks.team',
    );

    Route::get(
        '/app/task-management/departments',
        [
            TaskManagementController::class,
            'page',
        ],
    )->name(
        'tasks.departments',
    );

    Route::get(
        '/app/task-management/create',
        [
            TaskManagementController::class,
            'page',
        ],
    )->name(
        'tasks.create',
    );

    Route::get(
        '/app/task-management/{task}',
        [
            TaskManagementController::class,
            'page',
        ],
    )
        ->whereNumber(
            'task',
        )
        ->name(
            'tasks.show',
        );

    Route::get(
        '/app/task-management/{task}/edit',
        [
            TaskManagementController::class,
            'page',
        ],
    )
        ->whereNumber(
            'task',
        )
        ->name(
            'tasks.edit',
        );

    Route::prefix(
        '/api/task-management',
    )->group(function (): void {
        Route::get(
            '',
            [
                TaskManagementController::class,
                'index',
            ],
        );

        Route::get(
            'meta',
            [
                TaskManagementController::class,
                'meta',
            ],
        );

        Route::get(
            'dashboard',
            [
                TaskManagementController::class,
                'dashboard',
            ],
        );

        Route::get(
            'tasks',
            [
                TaskManagementController::class,
                'index',
            ],
        );

        Route::post(
            'tasks',
            [
                TaskManagementController::class,
                'store',
            ],
        );

        Route::get(
            'tasks/{task}',
            [
                TaskManagementController::class,
                'show',
            ],
        )->whereNumber(
            'task',
        );

        Route::patch(
            'tasks/{task}',
            [
                TaskManagementController::class,
                'update',
            ],
        )->whereNumber(
            'task',
        );

        Route::delete(
            'tasks/{task}',
            [
                TaskManagementController::class,
                'archive',
            ],
        )->whereNumber(
            'task',
        );

        Route::post(
            'tasks/{task}/comments',
            [
                TaskManagementController::class,
                'comment',
            ],
        )->whereNumber(
            'task',
        );

        Route::post(
            'tasks/{task}/subtasks',
            [
                TaskManagementController::class,
                'subtask',
            ],
        )->whereNumber(
            'task',
        );

        Route::patch(
            'tasks/{task}/subtasks/{subtask}',
            [
                TaskManagementController::class,
                'toggleSubtask',
            ],
        )->whereNumber([
            'task',
            'subtask',
        ]);

        Route::post(
            'tasks/{task}/attachments',
            [
                TaskManagementController::class,
                'attachment',
            ],
        )->whereNumber(
            'task',
        );

        Route::get(
            'tasks/{task}/attachments/{attachment}',
            [
                TaskManagementController::class,
                'downloadAttachment',
            ],
        )
            ->whereNumber([
                'task',
                'attachment',
            ])
            ->name(
                'tasks.attachments.download',
            );

        Route::get(
            'projects',
            [
                TaskManagementController::class,
                'projects',
            ],
        );

        Route::post(
            'projects',
            [
                TaskManagementController::class,
                'storeProject',
            ],
        );

        Route::get(
            'team',
            [
                TaskManagementController::class,
                'team',
            ],
        );

        Route::get(
            'departments-summary',
            [
                TaskManagementController::class,
                'departmentsSummary',
            ],
        );
    });
});
