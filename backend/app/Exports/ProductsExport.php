<?php

namespace App\Exports;

use App\Models\Product;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;

class ProductsExport implements FromCollection, ShouldAutoSize, WithHeadings, WithMapping
{
    /**
     * Store the complete filtered Product collection and export language.
     *
     * @param  Collection<int, Product>  $products
     */
    public function __construct(
        private readonly Collection $products,
        private readonly string $locale,
    ) {}

    /**
     * Return every filtered Product, never only the current pagination page.
     *
     * @return Collection<int, Product>
     */
    public function collection(): Collection
    {
        return $this->products;
    }

    /**
     * Return localized Product spreadsheet headings.
     *
     * @return list<string>
     */
    public function headings(): array
    {
        return [
            __(
                'exports.products.columns.type',
                [],
                $this->locale,
            ),

            __(
                'exports.products.columns.name',
                [],
                $this->locale,
            ),

            __(
                'exports.products.columns.sku',
                [],
                $this->locale,
            ),

            __(
                'exports.products.columns.description',
                [],
                $this->locale,
            ),

            __(
                'exports.products.columns.unit',
                [],
                $this->locale,
            ),

            __(
                'exports.products.columns.unit_price',
                [],
                $this->locale,
            ),

            __(
                'exports.products.columns.cost_price',
                [],
                $this->locale,
            ),

            __(
                'exports.products.columns.tax_rate',
                [],
                $this->locale,
            ),

            __(
                'exports.products.columns.status',
                [],
                $this->locale,
            ),

            __(
                'exports.products.columns.created_at',
                [],
                $this->locale,
            ),
        ];
    }

    /**
     * Map one Product into a localized spreadsheet row.
     *
     * @return list<string|null>
     */
    public function map(
        mixed $row,
    ): array {
        /** @var Product $row */

        return [
            __(
                'exports.products.types.'
                    .$row->type->value,
                [],
                $this->locale,
            ),

            $row->name,

            $row->sku,

            $row->description,

            $row->unit,

            $row->unit_price,

            $row->cost_price,

            $row->tax_rate,

            __(
                'exports.products.lifecycle.'
                    .(
                        $row->trashed()
                        ? 'archived'
                        : 'active'
                    ),
                [],
                $this->locale,
            ),

            $row->created_at?->format(
                'Y-m-d H:i',
            ),
        ];
    }
}
