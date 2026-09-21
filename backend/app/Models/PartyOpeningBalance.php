<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PartyOpeningBalance extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'party_id',
        'side',
        'amount',
        'as_of_date',
        'notes',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:4',
            'as_of_date' => 'date',
        ];
    }

    public function party(): BelongsTo
    {
        return $this->belongsTo(Party::class);
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
