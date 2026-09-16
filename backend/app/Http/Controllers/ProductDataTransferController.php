<?php

namespace App\Http\Controllers;

use App\Actions\Products\ImportProductsFromSpreadsheet;
use App\Exports\ProductImportTemplateExport;
use App\Exports\ProductsExport;
use App\Http\Requests\ExportProductRequest;
use App\Http\Requests\ProductImportRequest;
use App\Imports\ProductWorkbookRows;
use App\Models\Product;
use App\Queries\Products\ProductIndexQuery;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\File;
use Maatwebsite\Excel\Facades\Excel;
use Mpdf\Mpdf;
use Mpdf\Output\Destination;

class ProductDataTransferController extends Controller
{
    /**
     * Export every Product matching the active filters.
     *
     * Pagination parameters are intentionally ignored so exports represent the
     * complete filtered catalog rather than only the visible page.
     */
    public function export(
        ExportProductRequest $request,
        ProductIndexQuery $productIndexQuery,
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

        $products =
            $productIndexQuery->all(
                $filters,
            );

        if (
            $format === 'xlsx'
        ) {
            return Excel::download(
                new ProductsExport(
                    $products,
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
            'exports.products',
            [
                'products' => $products,

                'locale' => $locale,

                'rtl' => $rtl,

                'organizationName' => $context
                    ->organization()
                    ->name,

                'generatedAt' => now()->format(
                    'Y-m-d H:i',
                ),

                'autoPrint' => $format === 'print',
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
         * UTF-8 plus language/script detection keeps Arabic and other supported
         * scripts readable without changing Product data representation.
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
     * Download the Product import workbook template.
     */
    public function template(
        Request $request,
    ) {
        abort_unless(
            $request
                ->user()
                ?->can(
                    'create',
                    Product::class,
                ),
            403,
        );

        return Excel::download(
            new ProductImportTemplateExport,
            'acconova-products-import-template.xlsx',
        );
    }

    /**
     * Analyze an uploaded Product workbook without writing database changes.
     */
    public function previewImport(
        ProductImportRequest $request,
        ImportProductsFromSpreadsheet $importProducts,
    ): JsonResponse {
        $rows =
            $this->readRows(
                $request->file(
                    'file',
                ),
            );

        return response()->json(
            $importProducts->preview(
                $rows,
                $request->validated(
                    'duplicate_mode',
                ),
            ),
        );
    }

    /**
     * Commit a validated Product workbook into the active organization.
     */
    public function import(
        ProductImportRequest $request,
        ImportProductsFromSpreadsheet $importProducts,
    ): JsonResponse {
        $rows =
            $this->readRows(
                $request->file(
                    'file',
                ),
            );

        return response()->json([
            'data' => $importProducts->execute(
                $rows,
                $request->validated(
                    'duplicate_mode',
                ),
            ),
        ]);
    }

    /**
     * Parse Excel or CSV input into heading-based Product rows.
     *
     * @return Collection<int, array<string, mixed>>
     */
    private function readRows(
        UploadedFile $file,
    ): Collection {
        $reader =
            new ProductWorkbookRows;

        Excel::import(
            $reader,
            $file,
        );

        return $reader->rows;
    }

    /**
     * Resolve the short export language code.
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

        $locale = strtolower(
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
     * Determine whether the export should render right-to-left.
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
     * Build a timestamped Product export filename.
     */
    private function filename(
        string $extension,
    ): string {
        return sprintf(
            'acconova-products-%s.%s',
            now()->format(
                'Y-m-d-His',
            ),
            $extension,
        );
    }
}
