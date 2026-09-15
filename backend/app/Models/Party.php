<?php

namespace App\Models;

use App\Enums\PartyType;
use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\PartyFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Party extends Model
{
    /** @use HasFactory<PartyFactory> */
    use BelongsToOrganization;

    use HasFactory;
    use SoftDeletes;

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

    /**
     * Cast stored Party values into their domain representations.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => PartyType::class,
        ];
    }

    /**
     * Return customer/supplier roles belonging to this Party.
     */
    public function roles(): HasMany
    {
        return $this->hasMany(
            PartyRole::class,
        );
    }

    /**
     * Restrict a Party query to records that may participate in new business.
     *
     * Archived Parties remain available for historical reporting and existing
     * documents but must never be selectable for new quotes, invoices,
     * payments, or other future business operations.
     */
    public function scopeUsableForNewBusiness(
        Builder $query,
    ): Builder {
        return $query->whereNull(
            $this->getQualifiedDeletedAtColumn(),
        );
    }

    /**
     * Determine whether this Party may be used by a new business transaction.
     *
     * Historical documents can continue referencing archived records while
     * new business must require this method to return true.
     */
    public function isUsableForNewBusiness(): bool
    {
        return ! $this->trashed();
    }
}
