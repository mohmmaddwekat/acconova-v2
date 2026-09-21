<?php

namespace App\Http\Controllers;

use App\Models\Party;
use App\Models\Product;
use App\Models\Warehouse;
use App\Services\FinanceAuthorization;
use App\Services\FinanceDocumentService;
use App\Services\FinanceNumberService;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PurchaseRequisitionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless(
            $request->user(),
            403,
        );

        $status = $request->validate([
            'status' => [
                'nullable',
                Rule::in([
                    'pending',
                    'approved',
                    'rejected',
                    'converted',
                    'all',
                ]),
            ],
        ])['status'] ?? 'all';

        $query = DB::table('purchase_requisitions as requisitions')
            ->leftJoin('products as products', 'products.id', '=', 'requisitions.product_id')
            ->leftJoin('parties as suppliers', 'suppliers.id', '=', 'requisitions.preferred_supplier_id')
            ->leftJoin('users as requester', 'requester.id', '=', 'requisitions.requested_by')
            ->leftJoin('users as reviewer', 'reviewer.id', '=', 'requisitions.reviewed_by')
            ->leftJoin('financial_documents as documents', 'documents.id', '=', 'requisitions.converted_document_id')
            ->where(
                'requisitions.organization_id',
                app(TenantContext::class)->id(),
            );

        if ($status !== 'all') {
            $query->where(
                'requisitions.status',
                $status,
            );
        }

        if (
            ! FinanceAuthorization::allows(
                $request->user(),
                'finance.purchases.view',
            )
        ) {
            $query->where(
                'requisitions.requested_by',
                $request->user()->id,
            );
        }

        return response()->json([
            'data' => $query
                ->latest('requisitions.id')
                ->limit(250)
                ->get([
                    'requisitions.id',
                    'requisitions.number',
                    'requisitions.product_id',
                    'products.name as product_name',
                    'products.sku',
                    'requisitions.description',
                    'requisitions.quantity',
                    'requisitions.expected_unit_cost',
                    'requisitions.preferred_supplier_id',
                    DB::raw("COALESCE(suppliers.company_name, suppliers.name) as supplier_name"),
                    'requisitions.needed_by',
                    'requisitions.status',
                    'requisitions.note',
                    'requisitions.requested_by',
                    'requester.name as requested_by_name',
                    'requisitions.reviewed_by',
                    'reviewer.name as reviewed_by_name',
                    'requisitions.reviewed_at',
                    'requisitions.converted_document_id',
                    'documents.number as converted_document_number',
                    'requisitions.created_at',
                ]),
            'options' => [
                'products' => Product::query()
                    ->usableForNewBusiness()
                    ->orderBy('name')
                    ->limit(1000)
                    ->get([
                        'id',
                        'name',
                        'sku',
                        'unit',
                        'cost_price',
                        'track_inventory',
                    ]),
                'suppliers' => Party::query()
                    ->usableForNewBusiness()
                    ->whereHas(
                        'roles',
                        fn ($query) =>
                            $query->where('role', 'supplier'),
                    )
                    ->orderByRaw('COALESCE(company_name, name)')
                    ->limit(500)
                    ->get([
                        'id',
                        'name',
                        'company_name',
                    ])
                    ->map(fn (Party $party): array => [
                        'id' => $party->id,
                        'name' => $party->company_name ?: $party->name,
                    ])
                    ->values(),
            ],
        ]);
    }

    public function store(
        Request $request,
        FinanceNumberService $numbers,
    ): JsonResponse
    {
        abort_unless(
            $request->user(),
            403,
        );

        $data = $request->validate([
            'product_id' => ['nullable', 'integer'],
            'description' => ['required', 'string', 'max:255'],
            'quantity' => ['required', 'numeric', 'gt:0', 'max:999999999'],
            'expected_unit_cost' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'preferred_supplier_id' => ['nullable', 'integer'],
            'needed_by' => ['nullable', 'date_format:Y-m-d'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        if (! empty($data['product_id'])) {
            Product::query()
                ->usableForNewBusiness()
                ->findOrFail((int) $data['product_id']);
        }

        if (! empty($data['preferred_supplier_id'])) {
            Party::query()
                ->usableForNewBusiness()
                ->whereHas(
                    'roles',
                    fn ($query) =>
                        $query->where('role', 'supplier'),
                )
                ->findOrFail((int) $data['preferred_supplier_id']);
        }

        $organizationId = app(TenantContext::class)->id();

        $number = $numbers->next(
            'purchase_requisition',
            'REQ',
        );

        $id = DB::table('purchase_requisitions')
            ->insertGetId([
                'organization_id' => $organizationId,
                'number' => $number,
                'product_id' => $data['product_id'] ?? null,
                'description' => trim((string) $data['description']),
                'quantity' => $data['quantity'],
                'expected_unit_cost' => $data['expected_unit_cost'] ?? null,
                'preferred_supplier_id' => $data['preferred_supplier_id'] ?? null,
                'needed_by' => $data['needed_by'] ?? null,
                'status' => 'pending',
                'note' => isset($data['note'])
                    ? trim((string) $data['note']) ?: null
                    : null,
                'requested_by' => $request->user()->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' => [
                'id' => $id,
                'number' => $number,
                'status' => 'pending',
            ],
        ], 201);
    }

    public function review(
        Request $request,
        string $requisition,
    ): JsonResponse {
        $this->authorizeReviewer($request);

        $data = $request->validate([
            'decision' => [
                'required',
                Rule::in([
                    'approved',
                    'rejected',
                ]),
            ],
        ]);

        $row = $this->find($requisition);

        abort_unless($row->status === 'pending', 422);

        DB::table('purchase_requisitions')
            ->where('id', $row->id)
            ->update([
                'status' => $data['decision'],
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' => DB::table('purchase_requisitions')
                ->where('id', $row->id)
                ->first(),
        ]);
    }

    public function convert(
        Request $request,
        string $requisition,
        FinanceDocumentService $documents,
    ): JsonResponse {
        FinanceAuthorization::authorize(
            $request->user(),
            'finance.purchases.manage',
        );

        $row = $this->find($requisition);

        abort_unless($row->status === 'approved', 422);
        abort_unless($row->preferred_supplier_id, 422);
        abort_unless($row->product_id, 422);

        $product = Product::query()
            ->usableForNewBusiness()
            ->findOrFail((int) $row->product_id);

        $supplier = Party::query()
            ->usableForNewBusiness()
            ->whereHas(
                'roles',
                fn ($query) =>
                    $query->where('role', 'supplier'),
            )
            ->findOrFail((int) $row->preferred_supplier_id);

        $warehouse = Warehouse::query()
            ->default()
            ->first()
            ?? Warehouse::query()
                ->orderBy('id')
                ->first();

        $organization = app(TenantContext::class)->organization();
        $preferences = $organization->preferences ?? [];
        $currency = strtoupper(
            (string) ($preferences['currency'] ?? 'ILS'),
        );

        $document = $documents->createDraft([
            'kind' => 'purchase_invoice',
            'party_id' => $supplier->id,
            'warehouse_id' => $warehouse?->id,
            'department_id' => null,
            'external_number' => null,
            'issue_date' => today()->toDateString(),
            'due_date' => today()->addDays(30)->toDateString(),
            'activity_type' => 'trade',
            'market_type' => 'local',
            'branch_label' => null,
            'currency' => $currency,
            'exchange_rate' => '1',
            'shipping_total' => '0',
            'payment_terms' => null,
            'notes' => 'Created from purchase requisition '.$row->number,
            'internal_notes' => $row->note,
            'lines' => [
                [
                    'product_id' => $product->id,
                    'warehouse_id' => $product->track_inventory
                        ? $warehouse?->id
                        : null,
                    'tax_rule_id' => null,
                    'description' => $product->name,
                    'unit' => $product->unit,
                    'quantity' => (string) $row->quantity,
                    'unit_price' => (string) (
                        $row->expected_unit_cost
                        ?? $product->cost_price
                        ?? '0'
                    ),
                    'price_status' => $row->expected_unit_cost
                        ? 'estimated'
                        : 'final',
                    'discount_percent' => '0',
                    'discount_type' => 'percent',
                    'discount_value' => '0',
                    'tax_rate' => (string) ($product->tax_rate ?? '0'),
                    'affects_inventory' => (bool) $product->track_inventory,
                ],
            ],
        ], $request->user()->id);

        DB::table('purchase_requisitions')
            ->where('id', $row->id)
            ->update([
                'status' => 'converted',
                'converted_document_id' => $document->id,
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' => [
                'requisition_id' => $row->id,
                'document_id' => $document->id,
                'document_number' => $document->number,
            ],
        ], 201);
    }

    private function find(string $id): object
    {
        $row = DB::table('purchase_requisitions')
            ->where(
                'organization_id',
                app(TenantContext::class)->id(),
            )
            ->where('id', (int) $id)
            ->first();

        abort_unless($row, 404);

        return $row;
    }

    private function authorizeReviewer(Request $request): void
    {
        FinanceAuthorization::authorize(
            $request->user(),
            'finance.purchases.manage',
        );
    }
}
