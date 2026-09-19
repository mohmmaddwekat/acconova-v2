<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class TaskTeam extends Model
{
    use BelongsToOrganization;
    use SoftDeletes;

    protected $guarded = [
        'id',
        'organization_id',
    ];

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(
            self::class,
            'parent_task_team_id',
        );
    }

    public function children(): HasMany
    {
        return $this->hasMany(
            self::class,
            'parent_task_team_id',
        );
    }

    public function leader(): BelongsTo
    {
        return $this->belongsTo(
            StaffMember::class,
            'leader_staff_member_id',
        );
    }

    public function members(): BelongsToMany
    {
        return $this
            ->belongsToMany(
                StaffMember::class,
                'task_team_members',
                'task_team_id',
                'staff_member_id',
            )
            ->withTimestamps();
    }

    public function projects(): BelongsToMany
    {
        return $this
            ->belongsToMany(
                TaskProject::class,
                'task_team_projects',
                'task_team_id',
                'task_project_id',
            )
            ->withTimestamps();
    }

    protected function casts(): array
    {
        return [
            'capacity' => 'integer',
        ];
    }
}
