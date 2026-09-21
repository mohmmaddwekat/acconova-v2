<?php

namespace App\Http\Controllers;

use Carbon\Carbon;

use App\Enums\ProductType;
use App\Enums\StockMovementType;
use App\Models\Product;
use App\Models\Warehouse;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InventoryIntelligenceController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        abort_unless(
            $request->user()?->can('viewAny', Warehouse::class) ?? false,
            403,
        );

        $organizationId = app(TenantContext::class)->id();
        $preferences = app(TenantContext::class)
            ->organization()
            ->preferences ?? [];

        $leadDays = max(
            1,
            (int) ($preferences['inventory_reorder_lead_days'] ?? 14),
        );
        $safetyDays = max(
            0,
            (int) ($preferences['inventory_safety_days'] ?? 7),
        );

        $products = Product::query()
            ->whereIn('type', [
                ProductType::Product->value,
                ProductType::RawMaterial->value,
            ])
            ->where('track_inventory', true)
            ->with('inventoryBalances')
            ->orderBy('name')
            ->get();

        $productIds = $products->pluck('id');

        $sales30 = DB::table('financial_document_lines as l')
            ->join(
                'financial_documents as d',
                'd.id',
                '=',
                'l.financial_document_id',
            )
            ->where('l.organization_id', $organizationId)
            ->where('d.organization_id', $organizationId)
            ->where('d.kind', 'sale_invoice')
            ->whereIn('d.status', [
                'issued',
                'partially_paid',
                'paid',
                'overpaid',
            ])
            ->whereDate('d.issue_date', '>=', now()->subDays(30)->toDateString())
            ->whereIn('l.product_id', $productIds)
            ->groupBy('l.product_id')
            ->selectRaw(
                'l.product_id, COALESCE(SUM(l.quantity), 0) as qty',
            )
            ->pluck('qty', 'product_id');

        $sales90 = DB::table('financial_document_lines as l')
            ->join(
                'financial_documents as d',
                'd.id',
                '=',
                'l.financial_document_id',
            )
            ->where('l.organization_id', $organizationId)
            ->where('d.organization_id', $organizationId)
            ->where('d.kind', 'sale_invoice')
            ->whereIn('d.status', [
                'issued',
                'partially_paid',
                'paid',
                'overpaid',
            ])
            ->whereDate('d.issue_date', '>=', now()->subDays(90)->toDateString())
            ->whereIn('l.product_id', $productIds)
            ->groupBy('l.product_id')
            ->selectRaw(
                'l.product_id, COALESCE(SUM(l.quantity), 0) as qty',
            )
            ->pluck('qty', 'product_id');

        $lastOutbound = DB::table('stock_movements')
            ->where('organization_id', $organizationId)
            ->whereIn('product_id', $productIds)
            ->whereIn('type', [
                StockMovementType::Sale->value,
                StockMovementType::TransferOut->value,
                StockMovementType::ProductionOut->value,
                StockMovementType::SupplierReturn->value,
            ])
            ->groupBy('product_id')
            ->selectRaw(
                'product_id, MAX(created_at) as last_outbound_at',
            )
            ->pluck('last_outbound_at', 'product_id');

        $lastMovement = DB::table('stock_movements')
            ->where('organization_id', $organizationId)
            ->whereIn('product_id', $productIds)
            ->groupBy('product_id')
            ->selectRaw(
                'product_id, MAX(created_at) as last_movement_at',
            )
            ->pluck('last_movement_at', 'product_id');

        $firstInbound = DB::table('stock_movements')
            ->where('organization_id', $organizationId)
            ->whereIn('product_id', $productIds)
            ->whereIn('type', [
                StockMovementType::Opening->value,
                StockMovementType::Purchase->value,
                StockMovementType::TransferIn->value,
                StockMovementType::ProductionIn->value,
                StockMovementType::CustomerReturn->value,
            ])
            ->groupBy('product_id')
            ->selectRaw(
                'product_id, MIN(created_at) as first_inbound_at',
            )
            ->pluck('first_inbound_at', 'product_id');

        $rows = $products->map(function (
            Product $product,
        ) use (
            $sales30,
            $sales90,
            $lastOutbound,
            $lastMovement,
            $firstInbound,
            $leadDays,
            $safetyDays,
        ): array {
            $onHand = (float) $product->inventoryBalances
                ->sum(fn ($balance): float => (float) $balance->on_hand);
            $reserved = (float) $product->inventoryBalances
                ->sum(fn ($balance): float => (float) $balance->reserved);
            $available = max($onHand - $reserved, 0);

            $qty30 = (float) ($sales30[$product->id] ?? 0);
            $qty90 = (float) ($sales90[$product->id] ?? 0);
            $daily30 = $qty30 / 30;
            $daily90 = $qty90 / 90;

            /*
             * Prefer the recent 30-day run rate, but keep a slower 90-day
             * fallback for seasonal or intermittent products.
             */
            $dailyDemand = $daily30 > 0
                ? $daily30
                : $daily90;

            $targetStock = $dailyDemand
                * ($leadDays + $safetyDays);
            $reorderQuantity = max(
                $targetStock - $available,
                0,
            );

            $stockoutDays = $dailyDemand > 0
                ? $available / $dailyDemand
                : null;

            $lastOutboundAt = $lastOutbound[$product->id] ?? null;
            $lastMovementAt = $lastMovement[$product->id] ?? null;
            $firstInboundAt = $firstInbound[$product->id] ?? null;

            $deadDays = $lastOutboundAt
                ? Carbon::parse($lastOutboundAt)->diffInDays(now())
                : (
                    $firstInboundAt
                        ? Carbon::parse($firstInboundAt)->diffInDays(now())
                        : null
                );

            $ageDays = $firstInboundAt
                ? Carbon::parse($firstInboundAt)->diffInDays(now())
                : null;

            $deadBucket = match (true) {
                $available <= 0 => 'none',
                $deadDays === null => 'unknown',
                $deadDays >= 90 => '90+',
                $deadDays >= 60 => '60-89',
                $deadDays >= 30 => '30-59',
                default => 'active',
            };

            $cost = (float) ($product->cost_price ?? 0);

            return [
                'product_id' => $product->id,
                'name' => $product->name,
                'sku' => $product->sku,
                'unit' => $product->unit,
                'on_hand' => number_format($onHand, 4, '.', ''),
                'reserved' => number_format($reserved, 4, '.', ''),
                'available' => number_format($available, 4, '.', ''),
                'cost_price' => $product->cost_price,
                'frozen_capital' => number_format(
                    $available * $cost,
                    4,
                    '.',
                    '',
                ),
                'sales_30_days' => number_format($qty30, 4, '.', ''),
                'sales_90_days' => number_format($qty90, 4, '.', ''),
                'daily_demand' => number_format($dailyDemand, 4, '.', ''),
                'reorder_quantity' => number_format(
                    $reorderQuantity,
                    4,
                    '.',
                    '',
                ),
                'stockout_days' => $stockoutDays === null
                    ? null
                    : round($stockoutDays, 1),
                'last_outbound_at' => $lastOutboundAt,
                'last_movement_at' => $lastMovementAt,
                'first_inbound_at' => $firstInboundAt,
                'dead_stock_days' => $deadDays,
                'dead_stock_bucket' => $deadBucket,
                'inventory_age_days' => $ageDays,
            ];
        })->values();

        $deadRows = $rows
            ->filter(
                fn (array $row): bool =>
                    in_array(
                        $row['dead_stock_bucket'],
                        ['30-59', '60-89', '90+'],
                        true,
                    ),
            )
            ->sortByDesc('dead_stock_days')
            ->values();

        $reorderRows = $rows
            ->filter(
                fn (array $row): bool =>
                    (float) $row['reorder_quantity'] > 0.00005,
            )
            ->sortByDesc(
                fn (array $row): float =>
                    (float) $row['reorder_quantity'],
            )
            ->values();

        $stockoutRows = $rows
            ->filter(
                fn (array $row): bool =>
                    $row['stockout_days'] !== null
                    && $row['stockout_days'] <= 30,
            )
            ->sortBy('stockout_days')
            ->values();

        return response()->json([
            'data' => [
                'settings' => [
                    'lead_days' => $leadDays,
                    'safety_days' => $safetyDays,
                ],
                'summary' => [
                    'dead_stock_products' => $deadRows->count(),
                    'dead_stock_capital' => number_format(
                        (float) $deadRows->sum(
                            fn (array $row): float =>
                                (float) $row['frozen_capital'],
                        ),
                        4,
                        '.',
                        '',
                    ),
                    'reorder_products' => $reorderRows->count(),
                    'stockout_30_days' => $stockoutRows->count(),
                ],
                'dead_stock' => $deadRows->take(80)->values(),
                'reorder_suggestions' => $reorderRows->take(80)->values(),
                'stockout_forecast' => $stockoutRows->take(80)->values(),
                'aging' => $rows
                    ->filter(
                        fn (array $row): bool =>
                            (float) $row['available'] > 0,
                    )
                    ->sortByDesc('inventory_age_days')
                    ->take(80)
                    ->values(),
            ],
        ]);
    }
}
