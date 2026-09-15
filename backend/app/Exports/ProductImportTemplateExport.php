<?php

namespace App\Exports;

use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;

class ProductImportTemplateExport implements FromCollection
{
    public function collection(): Collection
    {
        //
    }
}
