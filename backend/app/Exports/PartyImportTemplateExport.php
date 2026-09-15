<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;

class PartyImportTemplateExport implements FromArray, ShouldAutoSize, WithHeadings
{
    /**
     * Provide example rows users can replace with their legacy data.
     *
     * @return array<int, array<int, string>>
     */
    public function array(): array
    {
        return [
            [
                'person',
                'Ahmad Example',
                '',
                'ahmad@example.com',
                '+970590000000',
                '',
                'Main Street',
                '',
                'Nablus',
                '',
                '',
                'PS',
                'customer',
            ],
            [
                'company',
                '',
                'Example Supplies Ltd',
                'sales@example-supplies.com',
                '',
                '123456',
                'Industrial Area',
                '',
                'Ramallah',
                '',
                '',
                'PS',
                'supplier;customer',
            ],
        ];
    }

    /**
     * Return stable machine-readable headings expected by the importer.
     *
     * @return list<string>
     */
    public function headings(): array
    {
        return [
            'type',
            'name',
            'company_name',
            'email',
            'phone',
            'tax_number',
            'address_line_1',
            'address_line_2',
            'city',
            'state',
            'postal_code',
            'country_code',
            'roles',
        ];
    }
}
