<?php

namespace App\Http\Controllers;

use App\Enums\OrganizationRole;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WorkspaceSettingsController extends Controller
{
    public function show(): JsonResponse
    {
        $context = app(TenantContext::class);
        $organization = $context->organization();
        $preferences = $organization->preferences ?? [];

        return response()->json([
            'name' => $organization->name,
            'country_code' => $preferences['country_code'] ?? null,
            'tax_number' => $preferences['tax_number'] ?? null,
            'currency' => $preferences['currency'] ?? 'ILS',
            'reminder_days' => $preferences['reminder_days'] ?? 3,
            'default_payment_terms_days' => $preferences['default_payment_terms_days'] ?? 30,
            'fiscal_year_start_month' => $preferences['fiscal_year_start_month'] ?? 1,
            'can_manage' => in_array(
                $context->role(),
                [OrganizationRole::Owner, OrganizationRole::Admin],
                true,
            ),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $context = app(TenantContext::class);

        abort_unless(
            in_array(
                $context->role(),
                [OrganizationRole::Owner, OrganizationRole::Admin],
                true,
            ),
            403,
        );

        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:160'],
            'country_code' => ['nullable', 'string', 'size:2', 'regex:/^[A-Z]{2}$/'],
            'tax_number' => ['nullable', 'string', 'max:80'],
            'currency' => ['required', 'regex:/^[A-Z]{3}$/'],
            'reminder_days' => ['required', 'integer', 'between:0,30'],
            'default_payment_terms_days' => ['required', 'integer', 'between:0,365'],
            'fiscal_year_start_month' => ['required', 'integer', 'between:1,12'],
        ]);

        $organization = $context->organization();
        $organization->name = $data['name'];
        unset($data['name']);

        $organization->preferences = [
            ...($organization->preferences ?? []),
            ...$data,
        ];
        $organization->save();

        return $this->show();
    }
}
