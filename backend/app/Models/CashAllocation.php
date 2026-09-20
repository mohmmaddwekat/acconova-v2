<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashAllocation extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'cash_movement_id',
        'financial_document_id',
        'amount',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:4',
        ];
    }

    public function movement(): BelongsTo
    {
        return $this->belongsTo(CashMovement::class, 'cash_movement_id');
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(FinancialDocument::class, 'financial_document_id');
    }
}
