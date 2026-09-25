<?php

namespace App\Http\Controllers;

use App\Models\BillingAccount;
use App\Models\MarketingContactMessage;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

final class PlatformAdminController extends Controller
{
    private const SECTIONS = [
        'overview', 'organizations', 'users', 'subscriptions', 'plans',
        'website', 'seo', 'contacts', 'system', 'settings',
    ];

    public function show(Request $request, ?string $section = null): Response
    {
        $this->authorizeAdmin($request);
        $section = in_array($section, self::SECTIONS, true) ? $section : 'overview';

        return Inertia::render('Admin/Platform', [
            'section' => $section,
            'adminEmail' => (string) $request->user()->email,
            'overview' => $this->overview(),
            'organizations' => $section === 'organizations' ? $this->organizations() : [],
            'users' => $section === 'users' ? $this->users() : [],
            'subscriptions' => $section === 'subscriptions' ? $this->subscriptions() : [],
            'plans' => in_array($section, ['overview', 'plans'], true) ? $this->plans() : [],
            'website' => in_array($section, ['overview', 'website', 'seo'], true) ? $this->website() : [],
            'contacts' => $section === 'contacts' ? $this->contacts() : [],
            'system' => in_array($section, ['overview', 'system', 'settings', 'seo'], true) ? $this->system() : [],
        ]);
    }

    public function updateContactStatus(Request $request, MarketingContactMessage $message): JsonResponse
    {
        $this->authorizeAdmin($request);

        $data = $request->validate([
            'status' => ['required', 'string', Rule::in(['new', 'read', 'resolved'])],
        ]);

        $status = (string) $data['status'];
        $message->status = $status;

        if ($status === 'new') {
            $message->read_at = null;
            $message->resolved_at = null;
        } elseif ($status === 'read') {
            $message->read_at ??= now();
            $message->resolved_at = null;
        } else {
            $message->read_at ??= now();
            $message->resolved_at = now();
        }

        $message->save();

        return response()->json([
            'ok' => true,
            'data' => [
                'id' => $message->id,
                'status' => $message->status,
                'read_at' => $message->read_at?->toIso8601String(),
                'resolved_at' => $message->resolved_at?->toIso8601String(),
            ],
        ]);
    }

    private function authorizeAdmin(Request $request): void
    {
        $user = $request->user();
        abort_unless($user, 401);

        $email = strtolower(trim((string) $user->email));
        $emails = array_values(array_filter(array_map(
            static fn ($value): string => strtolower(trim((string) $value)),
            (array) config('platform_admin.emails', []),
        )));
        $localAllowed = app()->environment('local')
            && (bool) config('platform_admin.allow_any_authenticated_user_locally', true);

        abort_unless($localAllowed || in_array($email, $emails, true), 403);
    }

    /** @return array<string, mixed> */
    private function overview(): array
    {
        $mrrMinor = 0;
        if (Schema::hasTable('billing_accounts')) {
            $mrrMinor = (int) BillingAccount::query()
                ->where('status', 'active')
                ->where('billing_interval', 'month')
                ->get(['amount_minor', 'quantity'])
                ->sum(fn (BillingAccount $account): int =>
                    max(0, (int) ($account->amount_minor ?? 0))
                    * max(1, (int) ($account->quantity ?? 1))
                );
        }

        return [
            'users' => User::query()->count(),
            'organizations' => Organization::query()->count(),
            'active_subscriptions' => Schema::hasTable('billing_accounts')
                ? BillingAccount::query()->whereIn('status', ['active', 'trialing'])->count()
                : 0,
            'trialing_subscriptions' => Schema::hasTable('billing_accounts')
                ? BillingAccount::query()->where('status', 'trialing')->count()
                : 0,
            'mrr_minor' => $mrrMinor,
            'currency' => 'USD',
            'new_contacts' => Schema::hasTable('marketing_contact_messages')
                ? MarketingContactMessage::query()->where('status', 'new')->count()
                : 0,
            'new_users_30d' => User::query()->where('created_at', '>=', now()->subDays(30))->count(),
            'new_organizations_30d' => Organization::query()->where('created_at', '>=', now()->subDays(30))->count(),
        ];
    }

    /** @return list<array<string, mixed>> */
    private function organizations(): array
    {
        $billing = Schema::hasTable('billing_accounts')
            ? BillingAccount::query()->get()->keyBy('organization_id')
            : collect();

        return Organization::query()
            ->withCount('memberships')
            ->latest('id')
            ->limit(100)
            ->get()
            ->map(function (Organization $organization) use ($billing): array {
                $account = $billing->get($organization->id);
                return [
                    'id' => $organization->id,
                    'name' => $organization->name,
                    'members' => (int) $organization->memberships_count,
                    'plan' => $account?->plan_key,
                    'subscription_status' => $account?->status,
                    'created_at' => $organization->created_at?->toIso8601String(),
                ];
            })
            ->values()->all();
    }

    /** @return list<array<string, mixed>> */
    private function users(): array
    {
        return User::query()
            ->withCount('memberships')
            ->latest('id')
            ->limit(100)
            ->get()
            ->map(fn (User $user): array => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'verified' => $user->email_verified_at !== null,
                'memberships' => (int) $user->memberships_count,
                'last_login_at' => $user->last_login_at?->toIso8601String(),
                'created_at' => $user->created_at?->toIso8601String(),
            ])
            ->values()->all();
    }

    /** @return list<array<string, mixed>> */
    private function subscriptions(): array
    {
        if (! Schema::hasTable('billing_accounts')) return [];

        return BillingAccount::query()
            ->with('organization:id,name')
            ->latest('id')
            ->limit(100)
            ->get()
            ->map(fn (BillingAccount $account): array => [
                'id' => $account->id,
                'organization_id' => $account->organization_id,
                'organization' => $account->organization?->name,
                'plan' => $account->plan_key,
                'status' => $account->status,
                'interval' => $account->billing_interval,
                'amount_minor' => $account->amount_minor,
                'currency' => $account->currency,
                'quantity' => max(1, (int) ($account->quantity ?? 1)),
                'renews_at' => $account->current_period_end?->toIso8601String(),
                'cancel_at_period_end' => (bool) $account->cancel_at_period_end,
                'payment_brand' => $account->payment_brand,
                'payment_last4' => $account->payment_last4,
            ])
            ->values()->all();
    }

    /** @return list<array<string, mixed>> */
    private function plans(): array
    {
        return collect((array) config('billing.plans', []))
            ->map(function ($plan, string $key): array {
                $plan = is_array($plan) ? $plan : [];
                return [
                    'key' => $key,
                    'name_ar' => (string) ($plan['name_ar'] ?? $key),
                    'name_en' => (string) ($plan['name_en'] ?? $key),
                    'recommended' => (bool) ($plan['recommended'] ?? false),
                    'monthly_minor' => (int) data_get($plan, 'display.month_amount_minor', 0),
                    'yearly_minor' => (int) data_get($plan, 'display.year_amount_minor', 0),
                    'currency' => (string) data_get($plan, 'display.currency', 'USD'),
                    'seats' => data_get($plan, 'limits.seats'),
                    'ai_tokens' => data_get($plan, 'limits.ai_tokens'),
                    'storage_bytes' => data_get($plan, 'limits.storage_bytes'),
                    'monthly_price_configured' => trim((string) data_get($plan, 'prices.month', '')) !== '',
                    'yearly_price_configured' => trim((string) data_get($plan, 'prices.year', '')) !== '',
                ];
            })
            ->values()->all();
    }

    /** @return list<array<string, string>> */
    private function website(): array
    {
        return [
            ['name' => 'Home', 'path' => '/', 'purpose' => 'Main product and conversion page'],
            ['name' => 'Features', 'path' => '/features', 'purpose' => 'Full capability overview'],
            ['name' => 'Pricing', 'path' => '/pricing', 'purpose' => 'Plans, pricing and add-on model'],
            ['name' => 'About', 'path' => '/about', 'purpose' => 'Company and product direction'],
            ['name' => 'Security', 'path' => '/security', 'purpose' => 'Security and access-control positioning'],
            ['name' => 'FAQ', 'path' => '/faq', 'purpose' => 'Search-friendly product questions'],
            ['name' => 'Contact', 'path' => '/contact', 'purpose' => 'Lead capture and support enquiries'],
            ['name' => 'Privacy', 'path' => '/privacy', 'purpose' => 'Privacy policy'],
            ['name' => 'Terms', 'path' => '/terms', 'purpose' => 'Terms of service'],
            ['name' => 'Small business ERP', 'path' => '/small-business-erp', 'purpose' => 'SEO solution landing page'],
            ['name' => 'CRM for small business', 'path' => '/crm-for-small-business', 'purpose' => 'SEO solution landing page'],
            ['name' => 'Inventory management', 'path' => '/inventory-management-software', 'purpose' => 'SEO solution landing page'],
            ['name' => 'Invoicing and payments', 'path' => '/invoicing-and-payments', 'purpose' => 'SEO solution landing page'],
            ['name' => 'Business reporting', 'path' => '/business-reporting-software', 'purpose' => 'SEO solution landing page'],
        ];
    }

    /** @return list<array<string, mixed>> */
    private function contacts(): array
    {
        if (! Schema::hasTable('marketing_contact_messages')) return [];

        return MarketingContactMessage::query()
            ->latest('id')
            ->limit(100)
            ->get()
            ->map(fn (MarketingContactMessage $message): array => [
                'id' => $message->id,
                'name' => $message->name,
                'email' => $message->email,
                'company' => $message->company,
                'subject' => $message->subject,
                'message' => $message->message,
                'locale' => $message->locale,
                'status' => $message->status,
                'created_at' => $message->created_at?->toIso8601String(),
                'read_at' => $message->read_at?->toIso8601String(),
                'resolved_at' => $message->resolved_at?->toIso8601String(),
            ])
            ->values()->all();
    }

    /** @return array<string, mixed> */
    private function system(): array
    {
        return [
            'environment' => app()->environment(),
            'app_url' => (string) config('app.url'),
            'https_ready' => str_starts_with((string) config('app.url'), 'https://'),
            'billing_enabled' => (bool) config('billing.enabled'),
            'stripe_secret_configured' => trim((string) config('billing.stripe.secret')) !== '',
            'stripe_webhook_configured' => trim((string) config('billing.stripe.webhook_secret')) !== '',
            'contact_email_configured' => trim((string) config('marketing.contact_email')) !== '',
            'mail_driver' => (string) config('mail.default'),
            'queue_driver' => (string) config('queue.default'),
            'admin_email_count' => count((array) config('platform_admin.emails', [])),
            'local_admin_bypass' => app()->environment('local')
                && (bool) config('platform_admin.allow_any_authenticated_user_locally', true),
            'contact_storage_ready' => Schema::hasTable('marketing_contact_messages'),
            'database_connection' => (string) config('database.default'),
        ];
    }
}
