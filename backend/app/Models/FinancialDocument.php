<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FinancialDocument extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'root_document_id',
        'corrected_from_id',
        'party_id',
        'warehouse_id',
        'department_id',
        'kind',
        'number',
        'external_number',
        'seller_tax_snapshot',
        'buyer_tax_snapshot',
        'revision',
        'status',
        'issue_date',
        'due_date',
        'activity_type',
        'market_type',
        'branch_label',
        'currency',
        'exchange_rate',
        'subtotal',
        'discount_total',
        'tax_total',
        'shipping_total',
        'total',
        'paid_total',
        'balance_due',
        'credit_total',
        'payment_terms',
        'notes',
        'internal_notes',
        'correction_reason',
        'warning_acknowledged_at',
        'issued_at',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'revision' => 'integer',
            'seller_tax_snapshot' => 'array',
            'buyer_tax_snapshot' => 'array',
            'issue_date' => 'date',
            'due_date' => 'date',
            'exchange_rate' => 'decimal:8',
            'subtotal' => 'decimal:4',
            'discount_total' => 'decimal:4',
            'tax_total' => 'decimal:4',
            'shipping_total' => 'decimal:4',
            'total' => 'decimal:4',
            'paid_total' => 'decimal:4',
            'balance_due' => 'decimal:4',
            'credit_total' => 'decimal:4',
            'warning_acknowledged_at' => 'datetime',
            'issued_at' => 'datetime',
        ];
    }

    public function party(): BelongsTo
    {
        return $this->belongsTo(Party::class)->withTrashed();
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class)->withTrashed();
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(FinancialDocumentLine::class)->orderBy('position');
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(CashAllocation::class);
    }

    public function rootDocument(): BelongsTo
    {
        return $this->belongsTo(self::class, 'root_document_id');
    }

    public function correctedFrom(): BelongsTo
    {
        return $this->belongsTo(self::class, 'corrected_from_id');
    }

    public function isDraft(): bool
    {
        return $this->status === 'draft';
    }

    public function isSale(): bool
    {
        return $this->kind === 'sale_invoice';
    }

    public function isPurchase(): bool
    {
        return $this->kind === 'purchase_invoice';
    }
}
