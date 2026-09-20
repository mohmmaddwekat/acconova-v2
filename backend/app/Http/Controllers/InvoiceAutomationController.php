<?php

namespace App\Http\Controllers;

use App\Models\FinancialDocument;
use App\Services\FinanceAuthorization;
use App\Services\InvoiceAutomationService;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class InvoiceAutomationController extends Controller
{
    public function index(
        Request $request,
        InvoiceAutomationService $automation,
    ): JsonResponse {
        $data = $request->validate([
            'kind' => ['nullable', Rule::in(['sale_invoice', 'purchase_invoice'])],
        ]);

        if (isset($data['kind'])) {
            $this->authorizeKind(
                $request,
                $data['kind'],
                false,
            );
        }

        $organizationId = app(TenantContext::class)->id();

        $automation->syncDue(
            $organizationId,
        );

        $templates = DB::table('invoice_templates')
            ->where('organization_id', $organizationId)
            ->when(
                $data['kind'] ?? null,
                fn ($query, $kind) => $query->where('kind', $kind),
            )
            ->latest('id')
            ->get([
                'id',
                'name',
                'kind',
                'source_document_id',
                'created_at',
                'updated_at',
            ]);

        $recurring = DB::table('recurring_invoice_profiles')
            ->where('organization_id', $organizationId)
            ->when(
                $data['kind'] ?? null,
                fn ($query, $kind) => $query->where('kind', $kind),
            )
            ->orderByDesc('active')
            ->orderBy('next_run_on')
            ->get([
                'id',
                'name',
                'kind',
                'source_document_id',
                'frequency',
                'interval',
                'next_run_on',
                'ends_on',
                'active',
                'last_generated_on',
                'created_at',
                'updated_at',
            ]);

        return response()->json([
            'data' => [
                'templates' => $templates,
                'recurring' => $recurring,
            ],
        ]);
    }

    public function saveTemplate(
        Request $request,
        string $document,
        InvoiceAutomationService $automation,
    ): JsonResponse {
        $record = FinancialDocument::query()
            ->findOrFail(
                (int) $document,
            );

        $this->authorizeKind(
            $request,
            $record->kind,
            true,
        );

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
        ]);

        $organizationId = app(TenantContext::class)->id();

        $id = DB::table('invoice_templates')->updateOrInsert(
            [
                'organization_id' => $organizationId,
                'name' => trim($data['name']),
                'kind' => $record->kind,
            ],
            [
                'source_document_id' => $record->id,
                'snapshot' => json_encode(
                    $automation->snapshot($record),
                    JSON_THROW_ON_ERROR,
                ),
                'created_by' => $request->user()->id,
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );

        return response()->json([
            'ok' => (bool) $id,
        ], 201);
    }

    public function createFromTemplate(
        Request $request,
        string $template,
        InvoiceAutomationService $automation,
    ): JsonResponse {
        $row = DB::table('invoice_templates')
            ->where('organization_id', app(TenantContext::class)->id())
            ->where('id', (int) $template)
            ->first();

        abort_unless($row, 404);

        $this->authorizeKind(
            $request,
            (string) $row->kind,
            true,
        );

        $snapshot = json_decode(
            $row->snapshot,
            true,
            512,
            JSON_THROW_ON_ERROR,
        );

        $document = $automation->createDraft(
            $snapshot,
            $request->user()->id,
        );

        return response()->json([
            'data' => [
                'id' => $document->id,
                'kind' => $document->kind,
                'url' => $document->isSale()
                    ? '/app/invoices/sales/'.$document->id
                    : '/app/invoices/purchases/'.$document->id,
            ],
        ], 201);
    }

    public function deleteTemplate(
        Request $request,
        string $template,
    ): JsonResponse {
        $row = DB::table('invoice_templates')
            ->where('organization_id', app(TenantContext::class)->id())
            ->where('id', (int) $template)
            ->first();

        abort_unless($row, 404);

        $this->authorizeKind(
            $request,
            (string) $row->kind,
            true,
        );

        DB::table('invoice_templates')
            ->where('id', $row->id)
            ->delete();

        return response()->json(['ok' => true]);
    }

    public function saveRecurring(
        Request $request,
        string $document,
        InvoiceAutomationService $automation,
    ): JsonResponse {
        $record = FinancialDocument::query()
            ->findOrFail(
                (int) $document,
            );

        $this->authorizeKind(
            $request,
            $record->kind,
            true,
        );

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'frequency' => [
                'required',
                Rule::in([
                    'weekly',
                    'monthly',
                    'quarterly',
                ]),
            ],
            'interval' => ['sometimes', 'integer', 'between:1,12'],
            'next_run_on' => ['required', 'date', 'after_or_equal:today'],
            'ends_on' => ['nullable', 'date', 'after_or_equal:next_run_on'],
        ]);

        $id = DB::table('recurring_invoice_profiles')->insertGetId([
            'organization_id' => app(TenantContext::class)->id(),
            'name' => trim($data['name']),
            'kind' => $record->kind,
            'source_document_id' => $record->id,
            'snapshot' => json_encode(
                $automation->snapshot($record),
                JSON_THROW_ON_ERROR,
            ),
            'frequency' => $data['frequency'],
            'interval' => (int) ($data['interval'] ?? 1),
            'next_run_on' => $data['next_run_on'],
            'ends_on' => $data['ends_on'] ?? null,
            'active' => true,
            'created_by' => $request->user()->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'id' => $id,
        ], 201);
    }

    public function updateRecurring(
        Request $request,
        string $profile,
    ): JsonResponse {
        $row = DB::table('recurring_invoice_profiles')
            ->where('organization_id', app(TenantContext::class)->id())
            ->where('id', (int) $profile)
            ->first();

        abort_unless($row, 404);

        $this->authorizeKind(
            $request,
            (string) $row->kind,
            true,
        );

        $data = $request->validate([
            'active' => ['required', 'boolean'],
        ]);

        DB::table('recurring_invoice_profiles')
            ->where('id', $row->id)
            ->update([
                'active' => (bool) $data['active'],
                'updated_at' => now(),
            ]);

        return response()->json(['ok' => true]);
    }

    public function deleteRecurring(
        Request $request,
        string $profile,
    ): JsonResponse {
        $row = DB::table('recurring_invoice_profiles')
            ->where('organization_id', app(TenantContext::class)->id())
            ->where('id', (int) $profile)
            ->first();

        abort_unless($row, 404);

        $this->authorizeKind(
            $request,
            (string) $row->kind,
            true,
        );

        DB::table('recurring_invoice_profiles')
            ->where('id', $row->id)
            ->delete();

        return response()->json(['ok' => true]);
    }

    private function authorizeKind(
        Request $request,
        string $kind,
        bool $manage,
    ): void {
        FinanceAuthorization::authorize(
            $request->user(),
            $kind === 'sale_invoice'
                ? ($manage ? 'finance.sales.manage' : 'finance.sales.view')
                : ($manage ? 'finance.purchases.manage' : 'finance.purchases.view'),
        );
    }
}
