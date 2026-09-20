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

        return response()->json([
            'name' => $context->organization()->name,
            'currency' => $context->organization()->preferences['currency'] ?? 'ILS',
            'reminder_days' => $context->organization()->preferences['reminder_days'] ?? 3,
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
            'currency' => ['required', 'regex:/^[A-Z]{3}$/'],
            'reminder_days' => ['required', 'integer', 'between:0,30'],
        ]);

        $organization = $context->organization();
        $organization->preferences = [
            ...($organization->preferences ?? []),
            ...$data,
        ];
        $organization->save();

        return $this->show();
    }
}
