<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Support\StaffImportWorksheetInspector;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Reader\IReadFilter;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use Throwable;

class StaffImportCommitController extends Controller
{
    private const DEFAULT_CHUNK_SIZE = 500;

    private const MAX_CHUNK_SIZE = 1000;

    public function __invoke(
        Request $request,
        StaffImportController $importer,
        StaffTransactionImportController $transactionImporter,
        StaffImportWorksheetInspector $worksheetInspector,
    ): JsonResponse {
        if ($request->input('type') === 'payroll') {
            throw ValidationException::withMessages([
                'type' => [
                    'Salary entitlement import is disabled. AccoNova calculates salary/work and overtime from attendance and pay terms. Import manual transactions instead.',
                ],
            ]);
        }

        // Backward compatibility for API consumers that still submit one-shot imports.
        // The browser client sends cursor=0 and then follows progress.next_cursor.
        if (! $request->has('cursor')) {
            return $this->commitChunk(
                $request,
                $importer,
                $transactionImporter,
                $worksheetInspector,
                null,
            );
        }

        $request->validate([
            'cursor' => ['required', 'integer', 'min:0'],
            'chunk_size' => ['nullable', 'integer', 'min:100', 'max:'.self::MAX_CHUNK_SIZE],
        ]);

        return $this->commitChunk(
            $request,
            $importer,
            $transactionImporter,
            $worksheetInspector,
            (int) $request->input('cursor', 0),
        );
    }

    private function commitChunk(
        Request $request,
        StaffImportController $importer,
        StaffTransactionImportController $transactionImporter,
        StaffImportWorksheetInspector $worksheetInspector,
        ?int $cursor,
    ): JsonResponse {
        if ($cursor === null) {
            return $request->input('type') === 'transactions'
                ? $transactionImporter($request)
                : $importer->commit($request);
        }

        $token = (string) $request->input('token');
        $sheetName = (string) $request->input('sheet');
        $chunkSize = min(
            self::MAX_CHUNK_SIZE,
            max(100, (int) $request->input('chunk_size', self::DEFAULT_CHUNK_SIZE)),
        );
        $directory = storage_path(
            'app/private/staff-imports/'
            .app(TenantContext::class)->id()
            .'/'
            .$request->user()->id,
        );
        $sourcePath = $directory.DIRECTORY_SEPARATOR.$token;

        abort_unless(is_file($sourcePath), 404);

        $reader = IOFactory::createReaderForFile($sourcePath);
        $sheetInfo = collect($reader->listWorksheetInfo($sourcePath))
            ->first(fn (array $info): bool => ($info['worksheetName'] ?? null) === $sheetName);

        abort_unless($sheetInfo, 422, 'The selected sheet no longer exists in the uploaded file.');

        $metadataLastRow = max(0, (int) ($sheetInfo['totalRows'] ?? 0));
        $bounds = $worksheetInspector->inspect(
            $sourcePath,
            $sheetName,
            $metadataLastRow,
        );

        // Cursor counts physical rows after the header. Using the last real data row
        // prevents Excel formatting out to row 1000/10000 from generating empty chunks.
        $totalRows = max(0, (int) $bounds['last_data_row'] - 1);
        $cursor = min($cursor, $totalRows);
        $startRow = $cursor + 2;
        $endRow = min($totalRows + 1, $startRow + $chunkSize - 1);
        $nextCursor = min($totalRows, $cursor + $chunkSize);
        $done = $nextCursor >= $totalRows;
        $tempToken = pathinfo($token, PATHINFO_FILENAME).'-'.bin2hex(random_bytes(8)).'.xlsx';
        $tempPath = $directory.DIRECTORY_SEPARATOR.$tempToken;
        $originalToken = $token;

        try {
            $reader = IOFactory::createReaderForFile($sourcePath);

            // Keep formula/cache information available. Calculating formulas while only
            // one chunk is loaded can create #VALUE!/0 rows that are not in the source.
            $reader->setReadDataOnly(false);
            $reader->setLoadSheetsOnly([$sheetName]);
            $reader->setReadFilter(new class($startRow, $endRow) implements IReadFilter
            {
                public function __construct(
                    private readonly int $startRow,
                    private readonly int $endRow,
                ) {}

                public function readCell(
                    string $columnAddress,
                    int $row,
                    string $worksheetName = '',
                ): bool {
                    return $row === 1 || ($row >= $this->startRow && $row <= $this->endRow);
                }
            });

            $source = $reader->load($sourcePath);
            $sourceSheet = $source->getSheetByName($sheetName);
            abort_unless($sourceSheet, 422, 'The selected sheet no longer exists in the uploaded file.');

            $highestColumn = $sourceSheet->getHighestDataColumn();
            $header = $this->readCachedRange(
                $sourceSheet,
                1,
                1,
                $highestColumn,
            );
            $chunkRows = $startRow <= $endRow
                ? $this->readCachedRange(
                    $sourceSheet,
                    $startRow,
                    $endRow,
                    $highestColumn,
                )
                : [];

            // Formula-error rows are artifacts/invalid source data, never valid staff
            // records. Excluding them keeps preview and commit behavior consistent.
            $chunkRows = array_values(array_filter(
                $chunkRows,
                fn (array $row): bool => ! $this->rowHasSpreadsheetError($row),
            ));

            $chunkBook = new Spreadsheet();
            $chunkSheet = $chunkBook->getActiveSheet();
            $chunkSheet->setTitle(substr($sheetName, 0, 31));
            $chunkSheet->fromArray($header, null, 'A1', true);
            if ($chunkRows !== []) {
                $chunkSheet->fromArray($chunkRows, null, 'A2', true);
            }
            IOFactory::createWriter($chunkBook, 'Xlsx')->save($tempPath);
            $chunkBook->disconnectWorksheets();
            $source->disconnectWorksheets();

            $request->merge(['token' => $tempToken]);
            $response = $request->input('type') === 'transactions'
                ? $transactionImporter($request)
                : $importer->commit($request);
            $payload = $response->getData(true);

            if (isset($payload['errors']) && is_array($payload['errors']) && $cursor > 0) {
                $payload['errors'] = array_map(
                    static function (array $error) use ($cursor): array {
                        if (isset($error['row']) && is_numeric($error['row'])) {
                            $error['row'] = (int) $error['row'] + $cursor;
                        }

                        return $error;
                    },
                    $payload['errors'],
                );
            }

            $payload['token'] = $originalToken;
            $payload['progress'] = [
                'processed' => $nextCursor,
                'total' => $totalRows,
                'percent' => $totalRows > 0
                    ? round(($nextCursor / $totalRows) * 100, 1)
                    : 100.0,
                'next_cursor' => $done ? null : $nextCursor,
                'done' => $done,
                'chunk_size' => $chunkSize,
            ];

            return response()->json($payload);
        } catch (Throwable $exception) {
            throw $exception;
        } finally {
            $request->merge(['token' => $originalToken]);
            if (is_file($tempPath)) {
                @unlink($tempPath);
            }
        }
    }

    /**
     * Read cached spreadsheet values without recalculating formulas in a partial sheet.
     *
     * @return list<array<int, mixed>>
     */
    private function readCachedRange(
        Worksheet $sheet,
        int $startRow,
        int $endRow,
        string $lastColumn,
    ): array {
        $lastColumnIndex = Coordinate::columnIndexFromString($lastColumn);
        $rows = [];

        for ($row = $startRow; $row <= $endRow; $row++) {
            $values = [];

            for ($column = 1; $column <= $lastColumnIndex; $column++) {
                $cell = $sheet->getCell([
                    $column,
                    $row,
                ]);
                $value = $cell->getDataType() === DataType::TYPE_FORMULA
                    ? $cell->getOldCalculatedValue()
                    : $cell->getValue();

                if (is_numeric($value) && ExcelDate::isDateTime($cell)) {
                    try {
                        $value = ExcelDate::excelToDateTimeObject((float) $value)
                            ->format('Y-m-d');
                    } catch (Throwable) {
                        // Keep the original numeric value if conversion is invalid.
                    }
                }

                $values[] = $value;
            }

            $rows[] = $values;
        }

        return $rows;
    }

    /** @param  array<int, mixed>  $row */
    private function rowHasSpreadsheetError(array $row): bool
    {
        foreach ($row as $value) {
            if (! is_string($value)) {
                continue;
            }

            if (preg_match('/^#(?:VALUE!|REF!|DIV\\/0!|NAME\\?|N\\/A|NUM!|NULL!)/i', trim($value)) === 1) {
                return true;
            }
        }

        return false;
    }
}
