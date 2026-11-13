<?php

namespace App\Http\Controllers\Parties;

use App\Http\Controllers\Controller;
use App\Models\Party;
use App\Models\Product;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class PartyPricingController extends Controller
{
    public function index(
        Request $request,
        string $party,
    ): JsonResponse {
        $party = Party::query()->findOrFail($party);
        Gate::authorize('view', $party);

        $rows = DB::table('party_product_prices as ppp')
            ->join('products as p', 'p.id', '=', 'ppp.product_id')
            ->where('ppp.organization_id', app(TenantContext::class)->id())
            ->where('ppp.party_id', $party->id)
            ->orderBy('p.name')
            ->get([
                'ppp.product_id',
                'p.name as product_name',
                'p.sku',
                'ppp.unit_price',
                'ppp.currency',
                'ppp.note',
                'ppp.updated_at',
            ]);

        return response()->json([
            'data' => $rows,
        ]);
    }

    public function store(
        Request $request,
        string $party,
    ): JsonResponse {
        $party = Party::query()->findOrFail($party);
        Gate::authorize('update', $party);

        $data = $request->validate([
            'product_id' => ['required', 'integer'],
            'unit_price' => ['required', 'numeric', 'min:0', 'max:999999999999'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $product = Product::query()
            ->usableForNewBusiness()
            ->findOrFail((int) $data['product_id']);

        $organization = app(TenantContext::class)->organization();
        $currency = strtoupper((string) ($organization->preferences['currency'] ?? 'ILS'));

        DB::table('party_product_prices')->updateOrInsert(
            [
                'organization_id' => $organization->id,
                'party_id' => $party->id,
                'product_id' => $product->id,
            ],
            [
                'unit_price' => $data['unit_price'],
                'currency' => $currency,
                'note' => isset($data['note'])
                    ? trim((string) $data['note']) ?: null
                    : null,
                'created_by' => $request->user()->id,
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );

        return response()->json([
            'ok' => true,
        ], 201);
    }

    public function suggestions(
        Request $request,
        string $party,
    ): JsonResponse {
        $party = Party::query()->findOrFail($party);
        Gate::authorize('view', $party);

        $orgId = app(TenantContext::class)->id();

        // Last used price per product from issued sale invoices for this party
        $lastUsed = DB::table('financial_document_lines as fdl')
            ->join('financial_documents as fd', 'fd.id', '=', 'fdl.financial_document_id')
            ->join('products as p', 'p.id', '=', 'fdl.product_id')
            ->where('fd.organization_id', $orgId)
            ->where('fd.party_id', $party->id)
            ->where('fd.kind', 'sale_invoice')
            ->whereIn('fd.status', ['issued', 'paid', 'partially_paid', 'overpaid'])
            ->whereNotNull('fdl.product_id')
            ->where('fdl.unit_price', '>', 0)
            ->orderBy('fd.issue_date', 'desc')
            ->get(['fdl.product_id', 'fdl.unit_price', 'p.name as product_name', 'p.sku', 'fd.issue_date'])
            ->unique('product_id');

        // Current custom prices
        $custom = DB::table('party_product_prices')
            ->where('organization_id', $orgId)
            ->where('party_id', $party->id)
            ->pluck('unit_price', 'product_id');

        $suggestions = $lastUsed->filter(function ($row) use ($custom) {
            $stored = $custom->get($row->product_id);
            if ($stored === null) {
                return false; // no custom price set yet — not a suggestion
            }

            return abs((float) $row->unit_price - (float) $stored) > 0.0001;
        })->values()->map(fn ($row) => [
            'product_id' => $row->product_id,
            'product_name' => $row->product_name,
            'sku' => $row->sku,
            'stored_price' => (string) $custom->get($row->product_id),
            'last_used_price' => (string) $row->unit_price,
            'last_invoice_date' => $row->issue_date,
        ]);

        return response()->json([
            'data' => $suggestions,
        ]);
    }

    public function destroy(
        Request $request,
        string $party,
        string $product,
    ): JsonResponse {
        $party = Party::query()->findOrFail($party);
        Gate::authorize('update', $party);

        DB::table('party_product_prices')
            ->where('organization_id', app(TenantContext::class)->id())
            ->where('party_id', $party->id)
            ->where('product_id', (int) $product)
            ->delete();

        return response()->json([
            'ok' => true,
        ]);
    }
}
