<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class WorkspaceRole extends Model
{
    use BelongsToOrganization;

    protected $guarded = ['id', 'organization_id'];

    protected function casts(): array
    {
        return ['is_custom' => 'boolean', 'permissions' => 'array'];
    }
}
