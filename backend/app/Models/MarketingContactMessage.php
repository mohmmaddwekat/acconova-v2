<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class MarketingContactMessage extends Model
{
    protected $fillable = [
        'name',
        'email',
        'company',
        'subject',
        'message',
        'locale',
        'status',
        'read_at',
        'resolved_at',
    ];

    protected function casts(): array
    {
        return [
            'read_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }
}
