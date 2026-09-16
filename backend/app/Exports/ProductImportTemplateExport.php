<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;

class ProductImportTemplateExport implements FromArray, ShouldAutoSize, WithHeadings
{
    /**
     * Provide example Product and Service rows users can replace.
     *
     * @return array<int, array<int, string>>
     */
    public function array(): array
    {
        return [
            [
                'product',
                'Office Chair',
                'CHAIR-001',
                'Ergonomic office chair',
                'unit',
                '199.9900',
                '120.0000',
                '16.00',
            ],
            [
                'service',
                'Consulting Hour',
                'CONSULT-001',
                'Professional consulting service',
                'hour',
                '125.0000',
                '50.0000',
                '16.00',
            ],
        ];
    }

    /**
     * Return stable headings expected by the Product importer.
     *
     * @return list<string>
     */
    public function headings(): array
    {
        return [
            'type',
            'name',
            'sku',
            'description',
            'unit',
            'unit_price',
            'cost_price',
            'tax_rate',
        ];
    }
}
