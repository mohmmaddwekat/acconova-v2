<?php

namespace App\Services\AI\Import;

use App\Imports\PartyWorkbookRows;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Excel;
use Maatwebsite\Excel\Facades\Excel as ExcelFacade;
use Throwable;

class SpreadsheetRowExtractor
{
    /**
     * Maps a spreadsheet mime type to the Maatwebsite Excel reader-type
     * constant that can read it, so stored files without a reliable
     * extension can still be parsed correctly.
     *
     * @var array<string, string>
     */
    private const MIME_READER_TYPES = [
        'text/csv' => Excel::CSV,
        'application/csv' => Excel::CSV,
        'text/plain' => Excel::CSV,
        'application/vnd.ms-excel' => Excel::XLS,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => Excel::XLSX,
        'application/vnd.oasis.opendocument.spreadsheet' => Excel::ODS,
    ];

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
     * `Excel::import()` normally resolves the reader type from the path's
     * file extension alone. `$mime` is used to look up that reader type
     * explicitly for a recognized spreadsheet mime, so a stored path with
     * no (or an unreliable) extension still reads correctly instead of
     * throwing `NoTypeDetectedException`. An unrecognized mime falls back
     * to extension-based auto-detection unchanged.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function extract(string $path, string $mime): Collection
    {
        $reader = new PartyWorkbookRows;
        $readerType = self::MIME_READER_TYPES[$mime] ?? null;

        try {
            ExcelFacade::import($reader, $path, null, $readerType);
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
