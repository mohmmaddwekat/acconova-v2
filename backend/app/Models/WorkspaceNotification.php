<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class WorkspaceNotification extends Model
{
    use BelongsToOrganization;

    protected $fillable = ['read_at'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['data' => 'array', 'read_at' => 'datetime'];
    }
}
