<?php

namespace App\Models;

use App\Enums\ProductType;
use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\ProductFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
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
        'track_inventory',
        'low_stock_threshold',
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

            'track_inventory' => 'boolean',

            'low_stock_threshold' => 'decimal:4',
        ];
    }

    /**
     * Return warehouse balances belonging to this catalog item.
     */
    public function inventoryBalances(): HasMany
    {
        return $this->hasMany(
            InventoryBalance::class,
        );
    }

    /**
     * Return immutable stock activity associated with this catalog item.
     */
    public function stockMovements(): HasMany
    {
        return $this->hasMany(
            StockMovement::class,
        );
    }

    /**
     * Restrict a catalog query to items available for new business documents.
     */
    public function scopeUsableForNewBusiness(
        Builder $query,
    ): Builder {
        return $query->whereNull(
            $this->getQualifiedDeletedAtColumn(),
        );
    }

    /**
     * Determine whether this catalog item may be selected on a new business
     * document.
     */
    public function isUsableForNewBusiness(): bool
    {
        return ! $this->trashed();
    }

    /**
     * Determine whether this catalog item is physically eligible for warehouse
     * inventory.
     *
     * Services have commercial quantities on quotes/invoices but never have
     * warehouse quantities.
     */
    public function isInventoryEligible(): bool
    {
        return in_array($this->type, [ProductType::Product, ProductType::RawMaterial], true);
    }

    /**
     * Determine whether physical inventory is actively tracked.
     */
    public function tracksInventory(): bool
    {
        return $this->isInventoryEligible()
            && $this->track_inventory;
    }
}
