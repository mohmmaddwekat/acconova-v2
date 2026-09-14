<?php

namespace App\Models;

use App\Enums\PartyType;
use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\PartyFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Party extends Model
{
    /** @use HasFactory<PartyFactory> */
    use BelongsToOrganization, HasFactory, SoftDeletes;

    protected $fillable = [
        'type',
        'name',
        'company_name',
        'email',
        'phone',
        'tax_number',
        'address_line_1',
        'address_line_2',
        'city',
        'state',
        'postal_code',
        'country_code',
    ];

    protected function casts(): array
    {
        return ['type' => PartyType::class];
    }

    public function roles(): HasMany
    {
        return $this->hasMany(PartyRole::class);
    }
}
