<?php

namespace App\Http\Controllers;

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
