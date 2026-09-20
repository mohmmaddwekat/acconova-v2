<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TaxRule extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'name',
        'code',
        'tax_type',
        'country_code',
        'region_code',
        'applies_to',
        'rate',
        'inclusive',
        'recoverable',
        'effective_from',
        'effective_to',
        'active',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'rate' => 'decimal:4',
            'inclusive' => 'boolean',
            'recoverable' => 'boolean',
            'effective_from' => 'date',
            'effective_to' => 'date',
            'active' => 'boolean',
        ];
    }

    public function documentLines(): HasMany
    {
        return $this->hasMany(FinancialDocumentLine::class);
    }

    public function obligations(): HasMany
    {
        return $this->hasMany(GovernmentObligation::class);
    }
}
