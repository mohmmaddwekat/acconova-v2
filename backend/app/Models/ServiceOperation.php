<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\ServiceOperationFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ServiceOperation extends Model
{
    use BelongsToOrganization;

    /** @use HasFactory<ServiceOperationFactory> */
    use HasFactory;

    protected $fillable = [
        'product_id', 'party_id', 'created_by', 'service_name', 'customer_name',
        'unit', 'performed_on', 'quantity', 'unit_price', 'subtotal', 'notes',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'performed_on' => 'date',
            'quantity' => 'decimal:4',
            'unit_price' => 'decimal:4',
            'subtotal' => 'decimal:4',
        ];
    }
}
