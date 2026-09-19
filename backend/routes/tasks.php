<?php

use App\Http\Controllers\TaskManagementController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified', ResolveOrganization::class])->group(function (): void {
    Route::get('/app/task-management', [TaskManagementController::class, 'page'])->name('tasks.dashboard');
    Route::get('/app/task-management/tasks', [TaskManagementController::class, 'page'])->defaults('view', 'list')->name('tasks.index');
    Route::get('/app/task-management/projects', [TaskManagementController::class, 'page'])->defaults('view', 'projects')->name('tasks.projects');
    Route::get('/app/task-management/team', [TaskManagementController::class, 'page'])->defaults('view', 'team')->name('tasks.team');
    Route::get('/app/task-management/teams', [TaskManagementController::class, 'page'])->defaults('view', 'teams')->name('tasks.teams');
    Route::get('/app/task-management/teams/create', [TaskManagementController::class, 'page'])->defaults('view', 'teams-create')->name('tasks.teams.create');
    Route::get('/app/task-management/teams/{team}/members', [TaskManagementController::class, 'page'])->whereNumber('team')->defaults('view', 'teams-members')->name('tasks.teams.members');
    Route::get('/app/task-management/teams/{team}', [TaskManagementController::class, 'page'])->whereNumber('team')->defaults('view', 'teams-detail')->name('tasks.teams.show');
    Route::get('/app/task-management/create', [TaskManagementController::class, 'page'])->defaults('view', 'create')->name('tasks.create');
    Route::get('/app/task-management/{task}/edit', [TaskManagementController::class, 'page'])->whereNumber('task')->defaults('view', 'edit')->name('tasks.edit');
    Route::get('/app/task-management/{task}', [TaskManagementController::class, 'page'])->whereNumber('task')->defaults('view', 'detail')->name('tasks.show');

    Route::prefix('api/task-management')->group(function (): void {
        Route::get('/', [TaskManagementController::class, 'index']);
        Route::post('/tasks', [TaskManagementController::class, 'store'])->middleware('throttle:30,1');
        Route::post('/projects', [TaskManagementController::class, 'storeProject'])->middleware('throttle:30,1');
        Route::post('/teams', [TaskManagementController::class, 'storeTeam'])->middleware('throttle:20,1');
        Route::patch('/teams/{team}', [TaskManagementController::class, 'updateTeam'])->whereNumber('team')->middleware('throttle:60,1');
        Route::post('/teams/{team}/transfer-member', [TaskManagementController::class, 'transferTeamMember'])->whereNumber('team')->middleware('throttle:30,1');
        Route::delete('/teams/{team}', [TaskManagementController::class, 'destroyTeam'])->whereNumber('team')->middleware('throttle:20,1');
        Route::get('/tasks/{task}', [TaskManagementController::class, 'show'])->whereNumber('task');
        Route::patch('/tasks/{task}', [TaskManagementController::class, 'update'])->whereNumber('task')->middleware('throttle:60,1');
        Route::delete('/tasks/{task}', [TaskManagementController::class, 'destroy'])->whereNumber('task');
        Route::post('/tasks/{task}/comments', [TaskManagementController::class, 'comment'])->whereNumber('task')->middleware('throttle:30,1');
        Route::post('/tasks/{task}/attachments', [TaskManagementController::class, 'upload'])->whereNumber('task')->middleware('throttle:20,1');
        Route::get('/tasks/{task}/attachments/{attachment}', [TaskManagementController::class, 'download'])->whereNumber(['task', 'attachment'])->name('tasks.attachments.download');
    });
});
