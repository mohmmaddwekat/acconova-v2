<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use Database\Factories\CreditPolicyFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * The workspace's credit policy: the thresholds the credit recommendation
 * uses. One row per workspace, created with defaults on first use.
 */
class CreditPolicy extends Model
{
    /** @use HasFactory<CreditPolicyFactory> */
    use BelongsToOrganization;

    use HasFactory;

    public const NEW_CUSTOMER_TERMS = ['cash_only', 'advance_payment'];

    protected $fillable = [
        'min_history_invoices', 'min_history_days', 'min_on_time_ratio', 'max_avg_days_late', 'max_overdue_ratio',
        'stop_credit_overdue_days', 'stop_credit_bounced_cheques', 'stop_credit_missed_promises', 'lookback_days',
        'credit_days', 'advance_percent', 'limit_months_of_sales', 'max_credit_limit', 'new_customer_terms',
        'cheque_max_postdated_days', 'cheque_exposure_ratio',
    ];

    protected function casts(): array
    {
        return [
            'min_history_invoices' => 'integer',
            'min_history_days' => 'integer',
            'min_on_time_ratio' => 'float',
            'max_avg_days_late' => 'integer',
            'max_overdue_ratio' => 'float',
            'stop_credit_overdue_days' => 'integer',
            'stop_credit_bounced_cheques' => 'integer',
            'stop_credit_missed_promises' => 'integer',
            'lookback_days' => 'integer',
            'credit_days' => 'integer',
            'advance_percent' => 'integer',
            'limit_months_of_sales' => 'float',
            'max_credit_limit' => 'decimal:4',
            'cheque_max_postdated_days' => 'integer',
            'cheque_exposure_ratio' => 'float',
        ];
    }
}
