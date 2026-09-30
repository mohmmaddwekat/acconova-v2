<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Reader\IReadFilter;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use Throwable;

class StaffImportCommitController extends Controller
{
    private const DEFAULT_CHUNK_SIZE = 500;

    private const MAX_CHUNK_SIZE = 1000;

    public function __invoke(
        Request $request,
        StaffImportController $importer,
        StaffTransactionImportController $transactionImporter,
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
            return $this->commitChunk($request, $importer, $transactionImporter, null);
        }

        $request->validate([
            'cursor' => ['required', 'integer', 'min:0'],
            'chunk_size' => ['nullable', 'integer', 'min:100', 'max:'.self::MAX_CHUNK_SIZE],
        ]);

        return $this->commitChunk(
            $request,
            $importer,
            $transactionImporter,
            (int) $request->input('cursor', 0),
        );
    }

    private function commitChunk(
        Request $request,
        StaffImportController $importer,
        StaffTransactionImportController $transactionImporter,
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

        $totalRows = max(0, (int) ($sheetInfo['totalRows'] ?? 0) - 1);
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
            $reader->setReadDataOnly(true);
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
            $header = $sourceSheet->rangeToArray(
                'A1:'.$highestColumn.'1',
                null,
                true,
                true,
                false,
            );
            $chunkRows = $startRow <= $endRow
                ? $sourceSheet->rangeToArray(
                    'A'.$startRow.':'.$highestColumn.$endRow,
                    null,
                    true,
                    true,
                    false,
                )
                : [];

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
}
