<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\PaymentPlanFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PaymentPlan extends Model
{
    public function records(): HasMany
    {
        return $this->hasMany(PaymentRecord::class);
    }

    use BelongsToOrganization;

    /** @use HasFactory<PaymentPlanFactory> */
    use HasFactory;

    protected $fillable = ['interval_count', 'title', 'direction', 'amount', 'currency', 'frequency', 'next_due_on', 'anchor_day', 'reminder_days', 'counterparty', 'active'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['interval_count' => 'integer', 'amount' => 'decimal:4', 'next_due_on' => 'date', 'active' => 'boolean', 'anchor_day' => 'integer', 'reminder_days' => 'integer'];
    }
}
