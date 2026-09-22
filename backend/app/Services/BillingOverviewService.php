<?php

namespace App\Services;

use App\Models\BillingAccount;
use App\Models\BillingInvoice;
use App\Models\Organization;
use App\Services\Billing\StripeBillingGateway;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

final class BillingOverviewService
{
    public function __construct(
        private readonly StripeBillingGateway $billing,
    ) {}

    /**
     * Build a tenant-safe billing snapshot. Provider names, credentials and
     * webhook details are deliberately never exposed to tenant users.
     *
     * @return array<string, mixed>
     */
    public function forOrganization(
        Organization $organization,
    ): array {
        $organizationId = (int) $organization->id;
        $preferences = $organization->preferences ?? [];

        $periodStart = now()->startOfMonth();
        $periodEnd = now()->endOfMonth();

        $seatsUsed = (int) DB::table('memberships')
            ->where('organization_id', $organizationId)
            ->count();

        $aiTokensUsed = 0;
        $aiMessages = 0;

        if (Schema::hasTable('ai_messages')) {
            $aiUsage = DB::table('ai_messages')
                ->where('organization_id', $organizationId)
                ->whereBetween('created_at', [
                    $periodStart,
                    $periodEnd,
                ])
                ->selectRaw(
                    'COALESCE(SUM(total_tokens), 0) as total_tokens, COUNT(*) as messages_count',
                )
                ->first();

            $aiTokensUsed = (int) ($aiUsage?->total_tokens ?? 0);
            $aiMessages = (int) ($aiUsage?->messages_count ?? 0);
        }

        $account = Schema::hasTable('billing_accounts')
            ? BillingAccount::query()
                ->where('organization_id', $organizationId)
                ->first()
            : null;

        $plan = $account?->plan_key
            ? (array) config(
                'billing.plans.'.$account->plan_key,
                [],
            )
            : [];

        $subscription = $account
            ? [
                'plan_key' => $account->plan_key,
                'name_ar' => (string) (
                    $plan['name_ar']
                        ?? $account->plan_key
                        ?? 'AccoNova'
                ),
                'name_en' => (string) (
                    $plan['name_en']
                        ?? $account->plan_key
                        ?? 'AccoNova'
                ),
                'status' => $account->status,
                'interval' => $account->billing_interval,
                'amount_minor' => $account->amount_minor,
                'currency' => $account->currency,
                'renews_at' => $account->current_period_end?->toIso8601String(),
                'trial_ends_at' => $account->trial_ends_at?->toIso8601String(),
                'cancel_at_period_end' => (bool) $account->cancel_at_period_end,
            ]
            : null;

        $nextInvoice = $account
            && $account->amount_minor !== null
            && $account->currency
            && $account->current_period_end
            && in_array(
                $account->status,
                [
                    'active',
                    'trialing',
                    'past_due',
                    'unpaid',
                ],
                true,
            )
            ? [
                'amount_minor' => (int) $account->amount_minor
                    * max(1, (int) $account->quantity),
                'currency' => $account->currency,
                'due_at' => $account->current_period_end->toIso8601String(),
                'estimated' => true,
            ]
            : null;

        $paymentMethod = $account?->payment_last4
            ? [
                'brand' => $account->payment_brand,
                'last4' => $account->payment_last4,
                'expires_month' => $account->payment_exp_month,
                'expires_year' => $account->payment_exp_year,
            ]
            : null;

        $invoices = Schema::hasTable('billing_invoices')
            ? BillingInvoice::query()
                ->where('organization_id', $organizationId)
                ->latest('issued_at')
                ->latest('id')
                ->limit(24)
                ->get()
                ->map(fn (BillingInvoice $invoice): array => [
                    'id' => (string) $invoice->id,
                    'number' => $invoice->number,
                    'status' => $invoice->status,
                    'amount_due_minor' => (int) $invoice->amount_due_minor,
                    'amount_paid_minor' => (int) $invoice->amount_paid_minor,
                    'currency' => $invoice->currency,
                    'issued_at' => $invoice->issued_at?->toIso8601String(),
                    'due_at' => $invoice->due_at?->toIso8601String(),
                    'paid_at' => $invoice->paid_at?->toIso8601String(),
                    'url' => $invoice->hosted_invoice_url
                        ?: $invoice->invoice_pdf_url,
                ])
                ->values()
                ->all()
            : [];

        return [
            'payments_available' => $this->billing->configured(),
            'plans' => $this->billing->publicPlanCatalog(),
            'subscription' => $subscription,
            'next_invoice' => $nextInvoice,
            'payment_method' => $paymentMethod,
            'invoices' => $invoices,
            'addons' => [],
            'currency' => (string) ($preferences['currency'] ?? 'ILS'),
            'usage' => [
                'period' => [
                    'from' => $periodStart->toDateString(),
                    'to' => $periodEnd->toDateString(),
                ],
                'seats' => [
                    'used' => $seatsUsed,
                    'limit' => null,
                ],
                'ai_tokens' => [
                    'used' => $aiTokensUsed,
                    'messages' => $aiMessages,
                    'limit' => null,
                ],
                'storage' => [
                    'available' => false,
                    'used_bytes' => null,
                    'limit_bytes' => null,
                ],
            ],
        ];
    }
}
