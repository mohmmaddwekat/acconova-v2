<?php

namespace App\Imports;

use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\SkipsEmptyRows;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class PartyWorkbookRows implements SkipsEmptyRows, ToCollection, WithHeadingRow
{
    /**
     * All normalized heading-based rows collected from the workbook.
     *
     * @var Collection<int, array<string, mixed>>
     */
    public Collection $rows;

    /**
     * Initialize an empty import-row collection.
     */
    public function __construct()
    {
        $this->rows = collect();
    }

    /**
     * Collect one parsed spreadsheet sheet.
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
