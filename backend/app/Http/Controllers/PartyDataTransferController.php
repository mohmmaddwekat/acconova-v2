<?php

namespace App\Http\Controllers;

use App\Actions\Parties\ImportPartiesFromSpreadsheet;
use App\Exports\PartiesExport;
use App\Exports\PartyImportTemplateExport;
use App\Http\Requests\ExportPartyRequest;
use App\Http\Requests\PartyImportRequest;
use App\Imports\PartyWorkbookRows;
use App\Models\Party;
use App\Queries\Parties\PartyIndexQuery;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\File;
use Maatwebsite\Excel\Facades\Excel;
use Mpdf\Mpdf;
use Mpdf\Output\Destination;

class PartyDataTransferController extends Controller
{
    /**
     * Export every Party matching the requested filters.
     *
     * Pagination parameters are deliberately ignored because Excel, PDF, and
     * print exports must represent the complete filtered dataset rather than
     * only the currently visible index page.
     */
    public function export(
        ExportPartyRequest $request,
        PartyIndexQuery $partyIndexQuery,
        TenantContext $context,
        string $format,
    ) {
        abort_unless(
            in_array(
                $format,
                [
                    'xlsx',
                    'pdf',
                    'print',
                ],
                true,
            ),
            404,
        );

        $filters =
            $request->validated();

        $locale =
            $this->locale(
                $request,
            );

        $parties =
            $partyIndexQuery->all(
                $filters,
            );

        if (
            $format === 'xlsx'
        ) {
            return Excel::download(
                new PartiesExport(
                    $parties,
                    $locale,
                ),
                $this->filename(
                    'xlsx',
                ),
            );
        }

        $rtl =
            $this->isRtl(
                $locale,
            );

        $html = view(
            'exports.parties',
            [
                'parties' => $parties,

                'locale' => $locale,

                'rtl' => $rtl,

                'organizationName' => $context
                    ->organization()
                    ->name,

                'generatedAt' => now()->format(
                    'Y-m-d H:i',
                ),

                'autoPrint' => $format ===
                    'print',
            ],
        )->render();

        if (
            $format === 'print'
        ) {
            return response(
                $html,
            );
        }

        $tempDirectory =
            storage_path(
                'app/mpdf',
            );

        File::ensureDirectoryExists(
            $tempDirectory,
        );

        /*
         * UTF-8 mode plus script/language detection keeps Arabic and other
         * supported Unicode scripts readable in generated PDF documents.
         */
        $pdf = new Mpdf([
            'mode' => 'utf-8',

            'format' => 'A4-L',

            'tempDir' => $tempDirectory,

            'default_font' => 'dejavusans',

            'autoScriptToLang' => true,

            'autoLangToFont' => true,
        ]);

        $pdf->WriteHTML(
            $html,
        );

        $contents =
            $pdf->Output(
                '',
                Destination::STRING_RETURN,
            );

        return response(
            $contents,
            200,
            [
                'Content-Type' => 'application/pdf',

                'Content-Disposition' => 'attachment; filename="'
                    .$this->filename(
                        'pdf',
                    )
                    .'"',
            ],
        );
    }

    /**
     * Download the stable workbook template used for bulk Party migrations.
     */
    public function template(
        Request $request,
    ) {
        abort_unless(
            $request
                ->user()
                ?->can(
                    'create',
                    Party::class,
                ),
            403,
        );

        return Excel::download(
            new PartyImportTemplateExport,
            'acconova-parties-import-template.xlsx',
        );
    }

    /**
     * Analyze an uploaded Party workbook without changing database state.
     */
    public function previewImport(
        PartyImportRequest $request,
        ImportPartiesFromSpreadsheet $importParties,
    ): JsonResponse {
        $rows =
            $this->readRows(
                $request->file(
                    'file',
                ),
            );

        return response()->json(
            $importParties->preview(
                $rows,
                $request->validated(
                    'duplicate_mode',
                ),
            ),
        );
    }

    /**
     * Import a validated Party workbook into the active organization.
     */
    public function import(
        PartyImportRequest $request,
        ImportPartiesFromSpreadsheet $importParties,
    ): JsonResponse {
        $rows =
            $this->readRows(
                $request->file(
                    'file',
                ),
            );

        return response()->json([
            'data' => $importParties->execute(
                $rows,
                $request->validated(
                    'duplicate_mode',
                ),
            ),
        ]);
    }

    /**
     * Parse one Excel or CSV upload into normalized heading-based rows.
     *
     * @return Collection<int, array<string, mixed>>
     */
    private function readRows(
        UploadedFile $file,
    ): Collection {
        $reader =
            new PartyWorkbookRows;

        Excel::import(
            $reader,
            $file,
        );

        return $reader->rows;
    }

    /**
     * Resolve the short language code used by localized exports.
     */
    private function locale(
        Request $request,
    ): string {
        $locale =
            (string) (
                $request->input(
                    'locale',
                )
                ?: app()->getLocale()
            );

        $locale =
            strtolower(
                str_replace(
                    '_',
                    '-',
                    $locale,
                ),
            );

        return explode(
            '-',
            $locale,
        )[0];
    }

    /**
     * Determine whether the selected language requires right-to-left layout.
     */
    private function isRtl(
        string $locale,
    ): bool {
        return in_array(
            $locale,
            [
                'ar',
                'fa',
                'he',
                'ur',
            ],
            true,
        );
    }

    /**
     * Generate a timestamped export filename.
     */
    private function filename(
        string $extension,
    ): string {
        return sprintf(
            'acconova-parties-%s.%s',
            now()->format(
                'Y-m-d-His',
            ),
            $extension,
        );
    }
}
