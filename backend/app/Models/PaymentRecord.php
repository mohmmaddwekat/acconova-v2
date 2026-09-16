<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\PaymentRecordFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PaymentRecord extends Model
{
    use BelongsToOrganization;

    /** @use HasFactory<PaymentRecordFactory> */
    use HasFactory;

    protected $fillable = ['payment_plan_id', 'created_by', 'title', 'direction', 'currency', 'amount', 'due_on', 'paid_on', 'counterparty', 'method', 'notes'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['amount' => 'decimal:4', 'due_on' => 'date', 'paid_on' => 'date'];
    }
}
