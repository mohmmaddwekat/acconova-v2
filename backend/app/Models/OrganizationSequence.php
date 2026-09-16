<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class OrganizationSequence extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'name',
        'current_value',
    ];

    /**
     * Cast sequence values without losing integer precision.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'current_value' => 'integer',
        ];
    }
}
