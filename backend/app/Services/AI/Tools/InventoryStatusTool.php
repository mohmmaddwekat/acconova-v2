<?php

namespace App\Services\AI\Tools;

use App\Enums\ProductType;
use App\Models\Product;
use App\Models\User;
use App\Services\AI\Contracts\AiBusinessTool;
use App\Services\AI\Tools\Concerns\NormalizesToolInput;
use App\Services\WorkspaceFeaturePermissions;

final class InventoryStatusTool implements AiBusinessTool
{
    use NormalizesToolInput;

    public function name(): string
    {
        return 'inventory_status';
    }

    public function description(): string
    {
        return 'Return tracked inventory health, including available stock, low-stock and out-of-stock products.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 25],
            ],
            'additionalProperties' => false,
        ];
    }

    public function allowed(User $user): bool
    {
        return WorkspaceFeaturePermissions::allows($user, 'inventory.view');
    }

    public function execute(User $user, array $arguments): array
    {
        $limit = $this->limit($arguments, 15, 25);

        $products = Product::query()
            ->whereIn('type', [
                ProductType::Product->value,
                ProductType::RawMaterial->value,
            ])
            ->where('track_inventory', true)
            ->with('inventoryBalances:id,product_id,on_hand,reserved')
            ->orderBy('name')
            ->get();

        $tracked = 0;
        $low = 0;
        $out = 0;
        $value = 0.0;
        $alerts = [];

        foreach ($products as $product) {
            $tracked++;
            $onHand = (float) $product->inventoryBalances
                ->sum(fn ($balance): float => (float) $balance->on_hand);
            $reserved = (float) $product->inventoryBalances
                ->sum(fn ($balance): float => (float) $balance->reserved);
            $available = $onHand - $reserved;
            $threshold = (float) ($product->low_stock_threshold ?? 0);
            $value += $onHand * (float) ($product->cost_price ?? 0);

            $state = null;

            if ($available <= 0) {
                $out++;
                $state = 'out_of_stock';
            } elseif ($threshold > 0 && $available <= $threshold) {
                $low++;
                $state = 'low_stock';
            }

            if ($state !== null) {
                $alerts[] = [
                    'product_id' => $product->id,
                    'name' => $product->name,
                    'sku' => $product->sku,
                    'state' => $state,
                    'on_hand' => number_format($onHand, 4, '.', ''),
                    'reserved' => number_format($reserved, 4, '.', ''),
                    'available' => number_format($available, 4, '.', ''),
                    'low_stock_threshold' => number_format($threshold, 4, '.', ''),
                ];
            }
        }

        usort($alerts, fn (array $a, array $b): int => [$a['state'] === 'out_of_stock' ? 0 : 1, (float) $a['available']]
            <=>
            [$b['state'] === 'out_of_stock' ? 0 : 1, (float) $b['available']]
        );

        return [
            'metrics' => [
                'tracked_products' => $tracked,
                'low_stock_products' => $low,
                'out_of_stock_products' => $out,
                'inventory_value' => number_format($value, 4, '.', ''),
            ],
            'alerts' => array_slice($alerts, 0, $limit),
        ];
    }
}
