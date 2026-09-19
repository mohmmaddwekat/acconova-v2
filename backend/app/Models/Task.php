<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Task extends Model
{
    use BelongsToOrganization;
    use SoftDeletes;

    /**
     * Keep tenant identity immutable.
     *
     * @var list<string>
     */
    protected $guarded = [
        'id',
        'organization_id',
    ];

    /**
     * Return the project containing this task.
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(
            TaskProject::class,
            'task_project_id',
        );
    }

    /**
     * Return the department responsible for this task.
     */
    public function department(): BelongsTo
    {
        return $this->belongsTo(
            Department::class,
        );
    }

    /**
     * Return the primary employee responsible for this task.
     */
    public function primaryAssignee(): BelongsTo
    {
        return $this->belongsTo(
            StaffMember::class,
            'primary_assignee_id',
        );
    }

    /**
     * Return the account that created the task.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(
            User::class,
            'created_by',
        );
    }

    /**
     * Return all employees participating in this task.
     */
    public function assignees(): BelongsToMany
    {
        return $this
            ->belongsToMany(
                StaffMember::class,
                'task_assignees',
                'task_id',
                'staff_member_id',
            )
            ->withTimestamps();
    }

    /**
     * Restrict a query to non-archived tasks.
     */
    public function scopeOperational(
        Builder $query,
    ): Builder {
        return $query->whereNull(
            'archived_at',
        );
    }

    /**
     * Cast task lifecycle fields.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'starts_on' => 'date',

            'due_on' => 'date',

            'progress' => 'integer',

            'estimated_minutes' => 'integer',

            'requires_approval' => 'boolean',

            'completed_at' => 'datetime',

            'archived_at' => 'datetime',
        ];
    }
}
