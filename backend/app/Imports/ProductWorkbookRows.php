<?php

namespace App\Imports;

use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;

class ProductWorkbookRows implements ToCollection
{
    public function collection(Collection $collection)
    {
        //
    }
}
