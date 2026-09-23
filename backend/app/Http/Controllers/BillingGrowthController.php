<?php

namespace App\Http\Controllers;

use App\Models\BillingInvoice;
use App\Services\Billing\BillingGrowthService;
use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Throwable;

final class BillingGrowthController extends Controller
{
    public function show(Request $request, BillingGrowthService $growth): JsonResponse
    {
        $this->authorizeView($request);

        return response()->json([
            'data' => $growth->snapshot(app(TenantContext::class)->organization()),
        ]);
    }

    public function extendTrial(Request $request, BillingGrowthService $growth): JsonResponse
    {
        $this->authorizeManage($request);

        return $this->run(fn () => $growth->requestTrialExtension(app(TenantContext::class)->organization()));
    }

    public function cancel(Request $request, BillingGrowthService $growth): JsonResponse
    {
        $this->authorizeManage($request);
        $data = $request->validate([
            'reason' => ['required', 'string', Rule::in(['too_expensive', 'not_using', 'missing_feature', 'temporary', 'other'])],
            'feedback' => ['nullable', 'string', 'max:1000'],
        ]);

        return $this->run(fn () => $growth->scheduleCancellation(
            app(TenantContext::class)->organization(),
            (string) $data['reason'],
            isset($data['feedback']) ? (string) $data['feedback'] : null,
        ));
    }

    public function resumeRenewal(Request $request, BillingGrowthService $growth): JsonResponse
    {
        $this->authorizeManage($request);

        return $this->run(fn () => $growth->resumeRenewal(app(TenantContext::class)->organization()));
    }

    public function pause(Request $request, BillingGrowthService $growth): JsonResponse
    {
        $this->authorizeManage($request);
        $data = $request->validate(['days' => ['required', 'integer', Rule::in([30, 60, 90])]]);

        return $this->run(fn () => $growth->pause(app(TenantContext::class)->organization(), (int) $data['days']));
    }

    public function resume(Request $request, BillingGrowthService $growth): JsonResponse
    {
        $this->authorizeManage($request);

        return $this->run(fn () => $growth->resume(app(TenantContext::class)->organization()));
    }

    public function spendCap(Request $request, BillingGrowthService $growth): JsonResponse
    {
        $this->authorizeManage($request);
        $data = $request->validate([
            'amount_minor' => ['nullable', 'integer', 'min:0', 'max:100000000'],
            'currency' => ['required', 'string', 'size:3'],
        ]);
        $growth->setSpendCap(
            app(TenantContext::class)->organization(),
            isset($data['amount_minor']) ? (int) $data['amount_minor'] : null,
            (string) $data['currency'],
        );

        return response()->json(['ok' => true]);
    }

    public function referral(Request $request, BillingGrowthService $growth): JsonResponse
    {
        $this->authorizeManage($request);
        $data = $request->validate(['email' => ['nullable', 'email:rfc', 'max:254']]);
        $code = $growth->createReferral(
            app(TenantContext::class)->organization(),
            isset($data['email']) ? (string) $data['email'] : null,
        );

        return response()->json(['data' => ['code' => $code]]);
    }

    public function redeem(Request $request, BillingGrowthService $growth): JsonResponse
    {
        $this->authorizeManage($request);
        $data = $request->validate(['code' => ['required', 'string', 'max:80']]);
        $redeemed = $growth->redeemOfferCode(
            app(TenantContext::class)->organization(),
            (string) $data['code'],
        );

        return response()->json(['data' => ['redeemed' => $redeemed]], $redeemed ? 200 : 422);
    }

    public function invoice(Request $request, BillingInvoice $invoice): Response
    {
        $this->authorizeView($request);
        $organization = app(TenantContext::class)->organization();
        abort_unless((int) $invoice->organization_id === (int) $organization->id, 404);

        $number = e($invoice->number ?: '#'.$invoice->id);
        $status = e($invoice->status ?: '—');
        $currency = e(strtoupper((string) ($invoice->currency ?: 'USD')));
        $issued = e($invoice->issued_at?->format('Y-m-d') ?: '—');
        $due = e($invoice->due_at?->format('Y-m-d') ?: '—');
        $amount = number_format(((int) $invoice->amount_due_minor) / 100, 2);
        $paid = number_format(((int) $invoice->amount_paid_minor) / 100, 2);
        $workspace = e((string) ($organization->name ?? 'Workspace'));

        return response("<!doctype html><html><head><meta charset=\"utf-8\"><title>AccoNova Invoice {$number}</title><style>body{font-family:Arial,sans-serif;background:#f6f8fb;color:#162235;margin:0;padding:40px}.sheet{max-width:820px;margin:auto;background:#fff;border:1px solid #dfe6ef;border-radius:18px;padding:36px}.top{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #e7ecf2;padding-bottom:22px}.brand{font-size:26px;font-weight:800}.muted{color:#6b7a90;font-size:13px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin:24px 0}.box{border:1px solid #e5eaf0;border-radius:12px;padding:14px}.total{font-size:28px;font-weight:800}.print{margin-top:22px;border:1px solid #1f6fcb;background:transparent;color:#1f6fcb;border-radius:10px;padding:9px 16px;cursor:pointer}@media print{body{background:#fff;padding:0}.sheet{border:0}.print{display:none}}</style></head><body><div class=\"sheet\"><div class=\"top\"><div><div class=\"brand\">AccoNova</div><div class=\"muted\">Subscription invoice</div></div><div><strong>Invoice {$number}</strong><div class=\"muted\">{$workspace}</div></div></div><div class=\"grid\"><div class=\"box\"><div class=\"muted\">Status</div><strong>{$status}</strong></div><div class=\"box\"><div class=\"muted\">Issued</div><strong>{$issued}</strong></div><div class=\"box\"><div class=\"muted\">Due</div><strong>{$due}</strong></div><div class=\"box\"><div class=\"muted\">Paid</div><strong>{$currency} {$paid}</strong></div></div><div class=\"muted\">Total</div><div class=\"total\">{$currency} {$amount}</div><button class=\"print\" onclick=\"window.print()\">Print / Save PDF</button></div></body></html>")
            ->header('Content-Type', 'text/html; charset=UTF-8');
    }

    private function authorizeView(Request $request): void
    {
        WorkspaceFeaturePermissions::authorize($request->user(), 'workspace.settings.view');
    }

    private function authorizeManage(Request $request): void
    {
        WorkspaceFeaturePermissions::authorize($request->user(), 'workspace.settings.manage');
    }

    private function run(callable $callback): JsonResponse
    {
        try {
            $callback();

            return response()->json(['ok' => true]);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Subscription management is temporarily unavailable.',
                'code' => 'BILLING_GROWTH_ACTION_FAILED',
            ], 503);
        }
    }
}
