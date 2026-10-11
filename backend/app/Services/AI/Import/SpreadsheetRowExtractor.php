<?php

namespace App\Services\AI\Import;

use App\Imports\PartyWorkbookRows;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;
use Throwable;

class SpreadsheetRowExtractor
{
    /**
     * Parse an uploaded spreadsheet file into generic rows keyed by its
     * header row, for later classification and import.
     *
     * Reuses `PartyWorkbookRows` rather than a differently named reader
     * class: the class has no Party-specific logic (it's a plain
     * ToCollection + WithHeadingRow + SkipsEmptyRows reader), and the
     * existing `PartyDataTransferController::readRows()` already proves
     * this `Excel::import()` pattern works for generic row extraction.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function extract(string $path, string $mime): Collection
    {
        $reader = new PartyWorkbookRows;

        try {
            Excel::import($reader, $path);
        } catch (Throwable) {
            throw ValidationException::withMessages([
                'file' => ['The file could not be read. Check the format and try again.'],
            ]);
        }

        if ($reader->rows->isEmpty()) {
            throw ValidationException::withMessages([
                'file' => ['The file is empty or could not be read.'],
            ]);
        }

        return $reader->rows;
    }
}
