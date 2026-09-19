<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class TaskProject extends Model
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
     * Return every task belonging to this project.
     */
    public function tasks(): HasMany
    {
        return $this->hasMany(
            Task::class,
        );
    }

    /**
     * Cast project dates.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'starts_on' => 'date',

            'due_on' => 'date',
        ];
    }
}
