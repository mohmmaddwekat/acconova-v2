<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinancialDocumentLine extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'financial_document_id',
        'product_id',
        'warehouse_id',
        'tax_rule_id',
        'position',
        'description',
        'sku_snapshot',
        'unit_snapshot',
        'quantity',
        'unit_price',
        'cost_price_snapshot',
        'price_status',
        'discount_percent',
        'discount_type',
        'discount_value',
        'tax_name_snapshot',
        'tax_rate',
        'line_subtotal',
        'line_discount',
        'line_tax',
        'line_total',
        'affects_inventory',
    ];

    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'quantity' => 'decimal:4',
            'unit_price' => 'decimal:4',
            'cost_price_snapshot' => 'decimal:4',
            'discount_percent' => 'decimal:4',
            'discount_value' => 'decimal:4',
            'tax_rate' => 'decimal:4',
            'line_subtotal' => 'decimal:4',
            'line_discount' => 'decimal:4',
            'line_tax' => 'decimal:4',
            'line_total' => 'decimal:4',
            'affects_inventory' => 'boolean',
        ];
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(FinancialDocument::class, 'financial_document_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class)->withTrashed();
    }

    public function taxRule(): BelongsTo
    {
        return $this->belongsTo(TaxRule::class);
    }
}
