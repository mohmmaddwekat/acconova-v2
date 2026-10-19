<?php

namespace App\Services\Products;

use App\Enums\ProductType;
use App\Models\FinancialDocumentLine;
use App\Models\Product;
use Illuminate\Support\Facades\DB;

class InvoiceProductBackfill
{
    private const SERVICE_WORDS = ['نقل', 'خدمة', 'خدمه', 'توصيل'];

    /**
     * Collapse spelling variants of an Arabic item description into one key.
     */
    public function normalize(string $description): string
    {
        $text = strtr(trim($description), [
            'أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا',
            'ة' => 'ه', 'ى' => 'ي', 'ـ' => '',
        ]);

        $compact = str_replace(['مدهس', 'نايلن', 'صبعه'], ['مدهش', 'نايلون', 'صبغه'], preg_replace('/\s+/u', '', $this->cleanName($text)) ?? $text);

        return mb_strtolower(preg_replace('/(?<=\d)اتر/u', 'لتر', $compact) ?? $compact);
    }

    /**
     * Drop the per-invoice price suffix (e.g. "1لتر - سعر 0.9") that importers
     * appended to descriptions; prices live per customer, not per product.
     */
    public function cleanName(string $description): string
    {
        return trim(preg_replace('/\s*-?\s*سعر\s*[\d.]+\s*$/u', '', trim($description)) ?? $description);
    }

    /**
     * Group unlinked lines of the current organization by normalized name.
     *
     * @return array<string, array{
     *     key: string, name: string, type: ProductType, unit: string,
     *     lines: int, sale_lines: int, purchase_lines: int,
     *     sale_price: ?string, cost_price: ?string, variants: list<string>
     * }>
     */
    public function plan(): array
    {
        $rows = FinancialDocumentLine::query()
            ->whereNull('financial_document_lines.product_id')
            ->join('financial_documents as d', 'd.id', '=', 'financial_document_lines.financial_document_id')
            ->get([
                'financial_document_lines.description',
                'financial_document_lines.unit_snapshot',
                'financial_document_lines.unit_price',
                'd.kind',
                'd.status',
            ]);

        $groups = [];

        foreach ($rows as $row) {
            $key = $this->normalize((string) $row->description);

            if ($key === '') {
                continue;
            }

            $groups[$key]['variants'][$row->description] = ($groups[$key]['variants'][$row->description] ?? 0) + 1;
            $groups[$key]['units'][(string) $row->unit_snapshot] = ($groups[$key]['units'][(string) $row->unit_snapshot] ?? 0) + 1;
            $groups[$key]['lines'] = ($groups[$key]['lines'] ?? 0) + 1;

            $isCounted = ! in_array($row->status, ['voided', 'superseded', 'draft'], true);
            $side = $row->kind === 'sale_invoice' ? 'sale' : 'purchase';

            $groups[$key][$side.'_lines'] = ($groups[$key][$side.'_lines'] ?? 0) + 1;

            if ($isCounted) {
                $groups[$key][$side.'_prices'][] = (float) $row->unit_price;
            }
        }

        $plan = [];

        foreach ($groups as $key => $group) {
            arsort($group['variants']);
            arsort($group['units']);

            $name = $this->cleanName((string) array_key_first($group['variants']));
            $unit = (string) array_key_first($group['units']);
            $saleLines = $group['sale_lines'] ?? 0;
            $purchaseLines = $group['purchase_lines'] ?? 0;

            $plan[$key] = [
                'key' => $key,
                'name' => $name,
                'type' => $this->guessType($name, $saleLines),
                'unit' => $unit !== '' ? $unit : 'piece',
                'lines' => $group['lines'],
                'sale_lines' => $saleLines,
                'purchase_lines' => $purchaseLines,
                'sale_price' => $this->average($group['sale_prices'] ?? []),
                'cost_price' => $this->average($group['purchase_prices'] ?? []),
                'variants' => array_keys($group['variants']),
            ];
        }

        uasort($plan, fn (array $a, array $b): int => $b['lines'] <=> $a['lines']);

        return $plan;
    }

    /**
     * Create missing products and link every unlinked line to its product.
     *
     * @return array{created: int, linked: int}
     */
    public function apply(): array
    {
        $plan = $this->plan();

        return DB::transaction(function () use ($plan): array {
            $existing = Product::query()->get()->keyBy(fn (Product $product): string => $this->normalize($product->name));
            $created = 0;
            $linked = 0;

            foreach ($plan as $key => $item) {
                $product = $existing[$key] ?? null;

                if (! $product) {
                    $product = Product::query()->create([
                        'type' => $item['type'],
                        'name' => $item['name'],
                        'unit' => $item['unit'],
                        'unit_price' => $item['sale_price'] ?? $item['cost_price'] ?? 0,
                        'cost_price' => $item['cost_price'] ?? 0,
                        'tax_rate' => 0,
                        'track_inventory' => false,
                    ]);
                    $created++;
                }

                $linked += FinancialDocumentLine::query()
                    ->whereNull('product_id')
                    ->whereIn('description', $item['variants'])
                    ->update(['product_id' => $product->id]);
            }

            return ['created' => $created, 'linked' => $linked];
        });
    }

    /**
     * Merge products whose names normalize to the same key, keeping the one
     * with the most invoice lines and re-pointing the others' lines to it.
     *
     * @return array{merged: int, relinked: int}
     */
    public function mergeDuplicates(): array
    {
        return DB::transaction(function (): array {
            $groups = Product::query()->get()->groupBy(fn (Product $product): string => $this->normalize($product->name));
            $merged = 0;
            $relinked = 0;

            foreach ($groups as $products) {
                if ($products->count() < 2) {
                    $only = $products->first();
                    $cleanedOnly = $this->cleanName($only->name);

                    if ($cleanedOnly !== $only->name) {
                        $only->update(['name' => $cleanedOnly]);
                    }

                    continue;
                }

                $counts = FinancialDocumentLine::query()
                    ->whereIn('product_id', $products->pluck('id'))
                    ->selectRaw('product_id, count(*) as total')
                    ->groupBy('product_id')
                    ->pluck('total', 'product_id');

                $keeper = $products->sortByDesc(fn (Product $product): int => (int) ($counts[$product->id] ?? 0))->first();

                $cleaned = $this->cleanName($keeper->name);

                if ($cleaned !== $keeper->name) {
                    $keeper->update(['name' => $cleaned]);
                }

                foreach ($products->where('id', '!=', $keeper->id) as $duplicate) {
                    $relinked += FinancialDocumentLine::query()
                        ->where('product_id', $duplicate->id)
                        ->update(['product_id' => $keeper->id]);
                    $duplicate->delete();
                    $merged++;
                }
            }

            return ['merged' => $merged, 'relinked' => $relinked];
        });
    }

    private function guessType(string $name, int $saleLines): ProductType
    {
        foreach (self::SERVICE_WORDS as $word) {
            if (str_contains($name, $word)) {
                return ProductType::Service;
            }
        }

        return $saleLines > 0 ? ProductType::Product : ProductType::RawMaterial;
    }

    /**
     * @param  list<float>  $prices
     */
    private function average(array $prices): ?string
    {
        return $prices === [] ? null : number_format(array_sum($prices) / count($prices), 4, '.', '');
    }
}
