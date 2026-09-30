<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Reader\IReadFilter;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use Throwable;

class StaffImportPreviewController extends Controller
{
    private const SAMPLE_SCAN_ROWS = 200;

    public function __invoke(Request $request): JsonResponse
    {
        abort_unless(StaffController::allowed('staff.import'), 403);

        $request->validate([
            'file' => ['required', 'file', 'max:20480', 'mimes:csv,txt,xls,xlsx'],
        ]);

        $file = $request->file('file');
        $extension = strtolower($file->getClientOriginalExtension());
        $token = Str::uuid()->toString().'.'.$extension;
        $directory = $this->directory($request);

        if (! is_dir($directory)) {
            mkdir($directory, 0750, true);
        }

        $this->prune($directory);
        $originalName = $file->getClientOriginalName();
        $file->move($directory, $token);
        $path = $directory.DIRECTORY_SEPARATOR.$token;

        try {
            $metadataReader = IOFactory::createReaderForFile($path);
            $worksheetInfo = $metadataReader->listWorksheetInfo($path);
            $sheets = [];

            foreach ($worksheetInfo as $info) {
                $sheetName = (string) ($info['worksheetName'] ?? '');
                if ($sheetName === '') {
                    continue;
                }

                $totalRowsIncludingHeader = max(0, (int) ($info['totalRows'] ?? 0));
                if ($totalRowsIncludingHeader === 0) {
                    continue;
                }

                $scanEnd = min(
                    $totalRowsIncludingHeader,
                    self::SAMPLE_SCAN_ROWS + 1,
                );
                $reader = IOFactory::createReaderForFile($path);

                // Keep formulas/styles available, but never recalculate formulas in a
                // partially-loaded sheet. Recalculation with missing dependency rows can
                // invent #VALUE!/0 preview rows that do not exist in the source workbook.
                $reader->setReadDataOnly(false);
                $reader->setLoadSheetsOnly([$sheetName]);
                $reader->setReadFilter(new class($scanEnd) implements IReadFilter
                {
                    public function __construct(private readonly int $scanEnd) {}

                    public function readCell(
                        string $columnAddress,
                        int $row,
                        string $worksheetName = '',
                    ): bool {
                        return $row >= 1 && $row <= $this->scanEnd;
                    }
                });

                $spreadsheet = $reader->load($path);
                $sheet = $spreadsheet->getSheetByName($sheetName);
                if (! $sheet) {
                    $spreadsheet->disconnectWorksheets();
                    continue;
                }

                $lastColumn = (string) ($info['lastColumnLetter'] ?? $sheet->getHighestDataColumn());
                if ($lastColumn === '') {
                    $lastColumn = 'A';
                }

                $rows = $this->readCachedRange(
                    $sheet,
                    1,
                    $scanEnd,
                    $lastColumn,
                );
                $headers = $this->normalizeHeaders(array_shift($rows) ?? []);
                $sampleRows = array_values(array_filter(
                    $rows,
                    fn (array $row): bool => $this->rowHasContent($row)
                        && ! $this->rowHasSpreadsheetError($row),
                ));

                $sheets[] = [
                    'name' => $sheetName,
                    'headers' => $headers,
                    'sample' => array_map(
                        fn (array $row): array => $this->associateRow($headers, $row),
                        array_slice($sampleRows, 0, 8),
                    ),
                    'row_count' => max(0, $totalRowsIncludingHeader - 1),
                ];

                $spreadsheet->disconnectWorksheets();
            }

            abort_if($sheets === [], 422, 'No readable sheets were found in the uploaded file.');

            return response()->json([
                'token' => $token,
                'name' => $originalName,
                'sheets' => $sheets,
            ]);
        } catch (Throwable $exception) {
            @unlink($path);
            throw $exception;
        }
    }

    private function directory(Request $request): string
    {
        return storage_path(
            'app/private/staff-imports/'
            .app(TenantContext::class)->id()
            .'/'
            .$request->user()->id,
        );
    }

    private function prune(string $directory): void
    {
        foreach (glob($directory.'/*') ?: [] as $oldFile) {
            if (is_file($oldFile) && filemtime($oldFile) < now()->subDay()->getTimestamp()) {
                @unlink($oldFile);
            }
        }
    }

    /**
     * Read cached spreadsheet values without evaluating formulas.
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
                        // Keep the original numeric value if the date conversion is invalid.
                    }
                }

                $values[] = $value;
            }

            $rows[] = $values;
        }

        return $rows;
    }

    /**
     * @param  array<int, mixed>  $row
     * @return list<string>
     */
    private function normalizeHeaders(array $row): array
    {
        $seen = [];
        $headers = [];

        foreach (array_values($row) as $index => $value) {
            $base = trim((string) ($value ?? ''));
            if ($base === '') {
                $base = 'Column '.($index + 1);
            }
            $seen[$base] = ($seen[$base] ?? 0) + 1;
            $headers[] = $seen[$base] === 1 ? $base : $base.' ('.$seen[$base].')';
        }

        return $headers;
    }

    /**
     * @param  list<string>  $headers
     * @param  array<int, mixed>  $row
     * @return array<string, mixed>
     */
    private function associateRow(array $headers, array $row): array
    {
        $values = array_values($row);
        $result = [];

        foreach ($headers as $index => $header) {
            $result[$header] = $values[$index] ?? null;
        }

        return $result;
    }

    /** @param  array<int, mixed>  $row */
    private function rowHasContent(array $row): bool
    {
        foreach ($row as $value) {
            if (trim((string) ($value ?? '')) !== '') {
                return true;
            }
        }

        return false;
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
