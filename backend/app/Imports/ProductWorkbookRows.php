<?php

namespace App\Imports;

use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\SkipsEmptyRows;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class ProductWorkbookRows implements SkipsEmptyRows, ToCollection, WithHeadingRow
{
    /**
     * All heading-based Product rows collected from the workbook.
     *
     * @var Collection<int, array<string, mixed>>
     */
    public Collection $rows;

    /**
     * Initialize the Product import buffer.
     */
    public function __construct()
    {
        $this->rows = collect();
    }

    /**
     * Collect one parsed workbook sheet.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     */
    public function collection(
        Collection $rows,
    ): void {
        $this->rows =
            $this->rows->concat(
                $rows,
            );
    }
}
