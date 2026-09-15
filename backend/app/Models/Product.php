<?php

namespace App\Models;

use App\Enums\ProductType;
use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\ProductFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    /** @use HasFactory<ProductFactory> */
    use BelongsToOrganization;

    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'type',
        'name',
        'sku',
        'description',
        'unit',
        'unit_price',
        'cost_price',
        'tax_rate',
    ];

    /**
     * Cast stored catalog values into stable domain representations.
     *
     * Money remains decimal strings so PHP does not introduce floating-point
     * rounding into future invoice calculations.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => ProductType::class,

            'unit_price' => 'decimal:4',

            'cost_price' => 'decimal:4',

            'tax_rate' => 'decimal:2',
        ];
    }

    /**
     * Restrict a catalog query to Products and Services available for new
     * business documents.
     */
    public function scopeUsableForNewBusiness(
        Builder $query,
    ): Builder {
        return $query->whereNull(
            $this->getQualifiedDeletedAtColumn(),
        );
    }

    /**
     * Determine whether this catalog item may be selected on a new quote or
     * invoice.
     */
    public function isUsableForNewBusiness(): bool
    {
        return ! $this->trashed();
    }
}
