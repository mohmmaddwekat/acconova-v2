<?php

namespace App\Http\Controllers;

use App\Enums\OrganizationRole;
use App\Models\OrganizationSequence;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class WorkspaceSettingsController extends Controller
{
    public function show(): JsonResponse
    {
        $context = app(TenantContext::class);

        $this->authorizeSettings($context);

        $organization = $context->organization();
        $preferences = $organization->preferences ?? [];

        return response()->json([
            'name' => $organization->name,
            'currency' => $preferences['currency'] ?? 'ILS',
            'reminder_days' => (int) ($preferences['reminder_days'] ?? 3),
            'can_manage' => true,

            'legal_name' => $preferences['legal_name'] ?? $organization->name,
            'trade_name' => $preferences['trade_name'] ?? $organization->name,
            'support_email' => $preferences['support_email'] ?? '',
            'phone' => $preferences['phone'] ?? '',
            'commercial_registration' => $preferences['commercial_registration'] ?? '',
            'vat_number' => $preferences['vat_number'] ?? '',
            'website' => $preferences['website'] ?? '',
            'country' => $preferences['country'] ?? '',
            'city' => $preferences['city'] ?? '',
            'address' => $preferences['address'] ?? '',
            'invoice_footer' => $preferences['invoice_footer']
                ?? 'شكراً لتعاملكم معنا، للاستفسار يرجى التواصل معنا في أي وقت.',
            'logo_url' => ! empty($preferences['logo_path'])
                ? '/api/workspace-settings/logo?v='.urlencode((string) $organization->updated_at?->timestamp)
                : null,

            'fiscal_year_start_month' => (int) ($preferences['fiscal_year_start_month'] ?? 1),
            'decimal_places' => (int) ($preferences['decimal_places'] ?? 2),
            'rounding_method' => $preferences['rounding_method'] ?? 'normal',
            'default_tax_rate' => (string) ($preferences['default_tax_rate'] ?? '0'),
            'tax_inclusive' => (bool) ($preferences['tax_inclusive'] ?? false),
            'cost_method' => $preferences['cost_method'] ?? 'moving_average',
            'include_extra_costs' => (bool) ($preferences['include_extra_costs'] ?? true),
            'include_shipping_cost' => (bool) ($preferences['include_shipping_cost'] ?? true),

            'approval_invoice_threshold' => (string) ($preferences['approval_invoice_threshold'] ?? '10000'),
            'approval_discount_percent' => (string) ($preferences['approval_discount_percent'] ?? '15'),
            'approval_payment_threshold' => (string) ($preferences['approval_payment_threshold'] ?? '5000'),
            'inventory_reorder_lead_days' => (int) ($preferences['inventory_reorder_lead_days'] ?? 14),
            'inventory_safety_days' => (int) ($preferences['inventory_safety_days'] ?? 7),

            'payment_methods' => array_values($preferences['payment_methods'] ?? [
                'bank_transfer',
                'card',
                'cash',
                'check',
            ]),
            'validate_check_date' => (bool) ($preferences['validate_check_date'] ?? true),
            'post_dated_checks_pending' => (bool) ($preferences['post_dated_checks_pending'] ?? true),
            'bank_accounts' => array_values($preferences['bank_accounts'] ?? []),

            'invoice_template' => $preferences['invoice_template'] ?? 'professional',
            'purchase_template' => $preferences['purchase_template'] ?? 'professional',
            'receipt_template' => $preferences['receipt_template'] ?? 'professional',
            'invoice_accent_color' => $preferences['invoice_accent_color'] ?? '#2563EB',
            'print_paper_size' => $preferences['print_paper_size'] ?? 'a4',
            'print_margins' => $preferences['print_margins'] ?? 'normal',
            'logo_position' => $preferences['logo_position'] ?? 'center',
            'show_invoice_logo' => (bool) ($preferences['show_invoice_logo'] ?? true),
            'show_invoice_contact' => (bool) ($preferences['show_invoice_contact'] ?? true),
            'show_invoice_tax_number' => (bool) ($preferences['show_invoice_tax_number'] ?? true),
            'show_invoice_notes' => (bool) ($preferences['show_invoice_notes'] ?? true),
            'show_invoice_qr' => (bool) ($preferences['show_invoice_qr'] ?? false),
            'invoice_columns' => array_values($preferences['invoice_columns'] ?? [
                'description',
                'quantity',
                'unit_price',
                'discount',
                'tax',
                'total',
            ]),
            'invoice_prefix' => $preferences['invoice_prefix'] ?? 'SAL',
            'purchase_prefix' => $preferences['purchase_prefix'] ?? 'PUR',
            'receipt_prefix' => $preferences['receipt_prefix'] ?? 'RCV',
            'payment_prefix' => $preferences['payment_prefix'] ?? 'PAY',
            'invoice_number_pattern' => $preferences['invoice_number_pattern']
                ?? '{PREFIX}-{YYYY}-{SEQ:4}',
            'purchase_number_pattern' => $preferences['purchase_number_pattern']
                ?? '{PREFIX}-{YYYY}-{SEQ:4}',
            'receipt_number_pattern' => $preferences['receipt_number_pattern']
                ?? '{PREFIX}-{YYYY}-{SEQ:4}',
            'payment_number_pattern' => $preferences['payment_number_pattern']
                ?? '{PREFIX}-{YYYY}-{SEQ:4}',
            'invoice_start_number' => max(1, (int) ($preferences['invoice_start_number'] ?? 1)),
            'purchase_start_number' => max(1, (int) ($preferences['purchase_start_number'] ?? 1)),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $context = app(TenantContext::class);

        $this->authorizeSettings($context);

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:160'],
            'currency' => ['sometimes', 'required', 'regex:/^[A-Z0-9]{3}$/'],
            'reminder_days' => ['sometimes', 'required', 'integer', 'between:0,30'],

            'legal_name' => ['sometimes', 'required', 'string', 'max:180'],
            'trade_name' => ['sometimes', 'required', 'string', 'max:180'],
            'support_email' => ['sometimes', 'nullable', 'email', 'max:180'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'commercial_registration' => ['sometimes', 'nullable', 'string', 'max:100'],
            'vat_number' => ['sometimes', 'nullable', 'string', 'max:100'],
            'website' => ['sometimes', 'nullable', 'url', 'max:255'],
            'country' => ['sometimes', 'nullable', 'string', 'max:100'],
            'city' => ['sometimes', 'nullable', 'string', 'max:100'],
            'address' => ['sometimes', 'nullable', 'string', 'max:255'],
            'invoice_footer' => ['sometimes', 'nullable', 'string', 'max:1200'],

            'fiscal_year_start_month' => ['sometimes', 'integer', 'between:1,12'],
            'decimal_places' => ['sometimes', 'integer', 'between:1,10'],
            'rounding_method' => ['sometimes', Rule::in(['normal', 'up', 'down'])],
            'default_tax_rate' => ['sometimes', 'numeric', 'between:0,100'],
            'tax_inclusive' => ['sometimes', 'boolean'],
            'cost_method' => ['sometimes', Rule::in(['moving_average', 'fifo'])],
            'include_extra_costs' => ['sometimes', 'boolean'],
            'include_shipping_cost' => ['sometimes', 'boolean'],

            'approval_invoice_threshold' => ['sometimes', 'numeric', 'min:0', 'max:999999999999'],
            'approval_discount_percent' => ['sometimes', 'numeric', 'between:0,100'],
            'approval_payment_threshold' => ['sometimes', 'numeric', 'min:0', 'max:999999999999'],
            'inventory_reorder_lead_days' => ['sometimes', 'integer', 'between:1,365'],
            'inventory_safety_days' => ['sometimes', 'integer', 'between:0,365'],

            'payment_methods' => ['sometimes', 'array', 'min:1'],
            'payment_methods.*' => [
                'string',
                Rule::in([
                    'cash',
                    'bank_transfer',
                    'check',
                    'card',
                    'electronic_wallet',
                    'direct_debit',
                    'other',
                ]),
            ],
            'validate_check_date' => ['sometimes', 'boolean'],
            'post_dated_checks_pending' => ['sometimes', 'boolean'],

            'bank_accounts' => ['sometimes', 'array', 'max:50'],
            'bank_accounts.*.id' => ['required', 'string', 'max:80'],
            'bank_accounts.*.bank_name' => ['required', 'string', 'max:160'],
            'bank_accounts.*.account_name' => ['nullable', 'string', 'max:160'],
            'bank_accounts.*.iban' => ['nullable', 'string', 'max:80'],
            'bank_accounts.*.account_number' => ['nullable', 'string', 'max:80'],
            'bank_accounts.*.is_primary' => ['required', 'boolean'],

            'invoice_template' => ['sometimes', Rule::in(['professional', 'classic', 'modern', 'simple'])],
            'purchase_template' => ['sometimes', Rule::in(['professional', 'classic', 'modern', 'simple'])],
            'receipt_template' => ['sometimes', Rule::in(['professional', 'classic', 'modern', 'simple'])],
            'invoice_accent_color' => ['sometimes', 'required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'print_paper_size' => ['sometimes', Rule::in(['a4', 'letter'])],
            'print_margins' => ['sometimes', Rule::in(['normal', 'compact'])],
            'logo_position' => ['sometimes', Rule::in(['start', 'center', 'end'])],
            'show_invoice_logo' => ['sometimes', 'boolean'],
            'show_invoice_contact' => ['sometimes', 'boolean'],
            'show_invoice_tax_number' => ['sometimes', 'boolean'],
            'show_invoice_notes' => ['sometimes', 'boolean'],
            'show_invoice_qr' => ['sometimes', 'boolean'],
            'invoice_columns' => ['sometimes', 'array', 'min:1'],
            'invoice_columns.*' => [
                'string',
                Rule::in([
                    'sku',
                    'description',
                    'quantity',
                    'unit_price',
                    'discount',
                    'tax',
                    'total',
                ]),
            ],
            'invoice_prefix' => ['sometimes', 'required', 'string', 'max:16', 'regex:/^[A-Za-z0-9_-]+$/'],
            'purchase_prefix' => ['sometimes', 'required', 'string', 'max:16', 'regex:/^[A-Za-z0-9_-]+$/'],
            'receipt_prefix' => ['sometimes', 'required', 'string', 'max:16', 'regex:/^[A-Za-z0-9_-]+$/'],
            'payment_prefix' => ['sometimes', 'required', 'string', 'max:16', 'regex:/^[A-Za-z0-9_-]+$/'],
            'invoice_number_pattern' => [
                'sometimes',
                'required',
                'string',
                'max:80',
                'regex:/^[A-Za-z0-9_{}:\\-]+$/',
                'regex:/\\{SEQ(?::\\d{1,2})?\\}/',
            ],
            'purchase_number_pattern' => [
                'sometimes',
                'required',
                'string',
                'max:80',
                'regex:/^[A-Za-z0-9_{}:\\-]+$/',
                'regex:/\\{SEQ(?::\\d{1,2})?\\}/',
            ],
            'receipt_number_pattern' => [
                'sometimes',
                'required',
                'string',
                'max:80',
                'regex:/^[A-Za-z0-9_{}:\\-]+$/',
                'regex:/\\{SEQ(?::\\d{1,2})?\\}/',
            ],
            'payment_number_pattern' => [
                'sometimes',
                'required',
                'string',
                'max:80',
                'regex:/^[A-Za-z0-9_{}:\\-]+$/',
                'regex:/\\{SEQ(?::\\d{1,2})?\\}/',
            ],
            'invoice_start_number' => ['sometimes', 'integer', 'between:1,999999999'],
            'purchase_start_number' => ['sometimes', 'integer', 'between:1,999999999'],
        ]);

        $organization = $context->organization();

        if (array_key_exists('name', $data)) {
            $organization->name = trim((string) $data['name']);
        }

        $preferences = $organization->preferences ?? [];

        foreach ($data as $key => $value) {
            if ($key === 'name') {
                continue;
            }

            if ($key === 'currency') {
                $value = strtoupper(trim((string) $value));
            }

            $preferences[$key] = $value;
        }

        if (isset($data['bank_accounts'])) {
            $accounts = array_values($data['bank_accounts']);
            $primarySeen = false;

            foreach ($accounts as &$account) {
                if ($account['is_primary'] && ! $primarySeen) {
                    $primarySeen = true;
                } else {
                    $account['is_primary'] = false;
                }
            }
            unset($account);

            if ($accounts !== [] && ! $primarySeen) {
                $accounts[0]['is_primary'] = true;
            }

            $preferences['bank_accounts'] = $accounts;
        }

        $organization->preferences = $preferences;
        $organization->save();

        $this->advanceSequenceFloor(
            'sales_invoice',
            isset($data['invoice_start_number']) ? (int) $data['invoice_start_number'] : null,
        );
        $this->advanceSequenceFloor(
            'purchase_invoice',
            isset($data['purchase_start_number']) ? (int) $data['purchase_start_number'] : null,
        );

        return $this->show();
    }

    public function uploadLogo(Request $request): JsonResponse
    {
        $context = app(TenantContext::class);

        $this->authorizeSettings($context);

        $data = $request->validate([
            'logo' => ['required', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048', 'dimensions:max_width=2048,max_height=2048'],
        ]);

        $organization = $context->organization();
        $preferences = $organization->preferences ?? [];
        $oldPath = $preferences['logo_path'] ?? null;
        $extension = strtolower($data['logo']->getClientOriginalExtension() ?: 'png');
        $path = $data['logo']->storeAs(
            'organization-logos/'.$organization->id,
            'logo.'.$extension,
            'local',
        );

        if ($oldPath && $oldPath !== $path) {
            Storage::disk('local')->delete($oldPath);
        }

        $preferences['logo_path'] = $path;
        $organization->preferences = $preferences;
        $organization->touch();
        $organization->save();

        return response()->json([
            'logo_url' => '/api/workspace-settings/logo?v='.$organization->updated_at->timestamp,
        ]);
    }

    public function logo()
    {
        $organization = app(TenantContext::class)->organization();
        $path = $organization->preferences['logo_path'] ?? null;

        abort_unless(
            is_string($path)
            && $path !== ''
            && Storage::disk('local')->exists($path),
            404,
        );

        return Storage::disk('local')->response(
            $path,
            'workspace-logo.'.pathinfo($path, PATHINFO_EXTENSION),
            [
                'Cache-Control' => 'private, max-age=3600',
                'Content-Disposition' => 'inline',
            ],
        );
    }

    private function authorizeSettings(TenantContext $context): void
    {
        abort_unless(
            in_array(
                $context->role(),
                [OrganizationRole::Owner, OrganizationRole::Admin],
                true,
            ),
            403,
        );
    }

    private function advanceSequenceFloor(string $name, ?int $nextNumber): void
    {
        if ($nextNumber === null) {
            return;
        }

        $sequence = OrganizationSequence::query()->firstOrCreate(
            ['name' => $name],
            ['current_value' => 0],
        );

        $floor = max(0, $nextNumber - 1);

        if ((int) $sequence->current_value < $floor) {
            $sequence->current_value = $floor;
            $sequence->save();
        }
    }
}
