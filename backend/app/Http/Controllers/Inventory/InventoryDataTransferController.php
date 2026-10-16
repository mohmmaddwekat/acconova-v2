<?php

namespace App\Http\Controllers\Inventory;

use App\Exports\SheetExport;
use App\Http\Controllers\Controller;
use App\Http\Requests\SaveProductionRunRequest;
use App\Imports\ProductWorkbookRows;
use App\Models\Product;
use App\Models\ProductionRun;
use App\Models\Warehouse;
use App\Services\Inventory\WarehouseService;
use App\Services\Production\ProductionRunService;
use App\Support\ProductionRunAccess;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Validator;
use Maatwebsite\Excel\Facades\Excel;
use Mpdf\Mpdf;
use Mpdf\Output\Destination;

/**
 * Export, import template, preview and import for warehouses and production
 * runs, with the same contract the parties and products pages use. Imported
 * production runs are saved as drafts only: nothing moves stock until someone
 * posts them.
 */
class InventoryDataTransferController extends Controller
{
    private const RUN_HEADINGS = [
        'run_ref', 'date', 'note', 'output_sku', 'output_warehouse', 'output_quantity',
        'material_sku', 'material_warehouse', 'material_quantity',
    ];

    public function exportWarehouses(Request $request, string $format)
    {
        abort_unless($request->user()?->can('viewAny', Warehouse::class), 403);

        $rows = Warehouse::query()->withTrashed()->orderBy('code')->get()->map(fn (Warehouse $warehouse): array => [
            $warehouse->code,
            $warehouse->name,
            $warehouse->is_default ? 'yes' : 'no',
            $warehouse->deleted_at ? 'archived' : 'active',
        ])->all();

        return $this->deliver($request, $format, 'warehouses', ['code', 'name', 'default', 'status'], $rows);
    }

    public function warehouseTemplate(Request $request)
    {
        abort_unless($request->user()?->can('create', Warehouse::class), 403);

        return Excel::download(new SheetExport(['name'], [['Main warehouse']]), 'acconova-warehouses-import-template.xlsx');
    }

    public function previewWarehouses(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('create', Warehouse::class), 403);

        return response()->json($this->planWarehouses($this->readRows($request))['summary']);
    }

    public function importWarehouses(Request $request, WarehouseService $warehouses): JsonResponse
    {
        abort_unless($request->user()?->can('create', Warehouse::class), 403);

        $plan = $this->planWarehouses($this->readRows($request));

        foreach ($plan['create'] as $name) {
            $warehouses->create(['name' => $name]);
        }

        return response()->json(['data' => [
            'created' => count($plan['create']),
            'updated' => 0,
            'skipped' => $plan['summary']['duplicate_rows'] + $plan['summary']['error_rows'],
            'total' => $plan['summary']['total_rows'],
        ]]);
    }

    public function exportRuns(Request $request, string $format)
    {
        abort_unless(ProductionRunAccess::canView($request->user()), 403);

        $rows = [];

        foreach (ProductionRun::query()->with(['outputs.product', 'outputs.warehouse', 'outputs.materials.rawMaterial', 'outputs.materials.warehouse'])->orderByDesc('occurred_on')->orderByDesc('id')->get() as $run) {
            foreach ($run->outputs as $output) {
                foreach ($output->materials as $material) {
                    $rows[] = [
                        $run->run_number, substr((string) $run->occurred_on, 0, 10), (string) ($run->status->value ?? $run->status), $run->note,
                        $output->product?->sku, $output->product?->name, $output->warehouse?->name, (string) $output->quantity,
                        $material->rawMaterial?->sku, $material->rawMaterial?->name, $material->warehouse?->name, (string) $material->actual_quantity,
                    ];
                }
            }
        }

        return $this->deliver($request, $format, 'production', [
            'run_ref', 'date', 'status', 'note', 'output_sku', 'output_name', 'output_warehouse', 'output_quantity',
            'material_sku', 'material_name', 'material_warehouse', 'material_quantity',
        ], $rows);
    }

    public function runTemplate(Request $request)
    {
        abort_unless(ProductionRunAccess::canManage($request->user()), 403);

        return Excel::download(new SheetExport(self::RUN_HEADINGS, [
            ['RUN-1', now()->toDateString(), 'Morning batch', 'FINISHED-SKU', 'Main warehouse', '10', 'RAW-SKU-1', 'Main warehouse', '25'],
            ['RUN-1', now()->toDateString(), 'Morning batch', 'FINISHED-SKU', 'Main warehouse', '10', 'RAW-SKU-2', 'Main warehouse', '4'],
        ]), 'acconova-production-import-template.xlsx');
    }

    public function previewRuns(Request $request): JsonResponse
    {
        abort_unless(ProductionRunAccess::canManage($request->user()), 403);

        return response()->json($this->planRuns($this->readRows($request))['summary']);
    }

    public function importRuns(Request $request, ProductionRunService $runs): JsonResponse
    {
        abort_unless(ProductionRunAccess::canManage($request->user()), 403);

        $plan = $this->planRuns($this->readRows($request));

        foreach ($plan['create'] as $payload) {
            $runs->createDraft($payload, (int) $request->user()->id);
        }

        return response()->json(['data' => [
            'created' => count($plan['create']),
            'updated' => 0,
            'skipped' => $plan['summary']['duplicate_rows'] + $plan['summary']['error_rows'],
            'total' => $plan['summary']['total_rows'],
        ]]);
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array{summary: array<string, mixed>, create: list<string>}
     */
    private function planWarehouses(Collection $rows): array
    {
        $known = Warehouse::query()->withTrashed()->get(['name', 'deleted_at'])
            ->mapWithKeys(fn (Warehouse $warehouse): array => [mb_strtolower(trim($warehouse->name)) => $warehouse->deleted_at !== null]);
        $seen = [];
        $create = [];
        $errors = [];
        $duplicates = 0;
        $invalid = 0;

        foreach ($rows->values() as $index => $row) {
            $number = $index + 2;
            $name = trim((string) ($row['name'] ?? $row['warehouse'] ?? $row['warehouse_name'] ?? ''));

            if ($name === '' || mb_strlen($name) > 160) {
                $invalid++;
                $errors[] = ['row' => $number, 'message' => 'The name is required and at most 160 characters.', 'code' => 'invalid'];

                continue;
            }

            $key = mb_strtolower($name);

            if (isset($seen[$key]) || $known->has($key)) {
                $duplicates++;
                $archived = $known->get($key) === true;
                $errors[] = ['row' => $number, 'message' => $archived ? 'A warehouse with this name is archived; restore it instead.' : 'A warehouse with this name already exists.', 'code' => $archived ? 'archived' : 'duplicate'];

                continue;
            }

            $seen[$key] = true;
            $create[] = $name;
        }

        return [
            'summary' => [
                'total_rows' => $rows->count(), 'valid_rows' => count($create),
                'duplicate_rows' => $duplicates, 'error_rows' => $invalid, 'errors' => array_slice($errors, 0, 100),
            ],
            'create' => $create,
        ];
    }

    /**
     * Group the rows into runs, check every run on its own and report errors by row.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array{summary: array<string, mixed>, create: list<array<string, mixed>>}
     */
    private function planRuns(Collection $rows): array
    {
        $warehouses = Warehouse::query()->get(['id', 'code', 'name']);
        $products = Product::query()->get(['id', 'sku'])->keyBy(fn (Product $product): string => mb_strtolower(trim((string) $product->sku)));
        $existing = ProductionRun::query()->get(['run_number', 'note']);
        $today = CarbonImmutable::today()->toDateString();

        $find = function (string $value) use ($warehouses): ?int {
            $value = mb_strtolower(trim($value));

            return $warehouses->first(fn (Warehouse $warehouse): bool => mb_strtolower($warehouse->code) === $value || mb_strtolower(trim($warehouse->name)) === $value)?->id;
        };

        $groups = [];
        $errors = [];

        foreach ($rows->values() as $index => $row) {
            $number = $index + 2;
            $ref = trim((string) ($row['run_ref'] ?? ''));

            if ($ref === '') {
                $errors[] = ['row' => $number, 'message' => 'The run reference is required to group the lines of one run.', 'code' => 'invalid'];

                continue;
            }

            $groups[$ref][] = ['row' => $number, 'data' => $row];
        }

        $create = [];
        $validRows = 0;
        $duplicateRows = 0;
        $errorRows = count($errors);

        foreach ($groups as $ref => $lines) {
            $lineCount = count($lines);
            $isDuplicate = $existing->contains(fn (ProductionRun $run): bool => mb_strtolower($run->run_number) === mb_strtolower($ref)
                || str_contains((string) $run->note, '[import:'.$ref.']'));

            if ($isDuplicate) {
                $duplicateRows += $lineCount;
                $errors[] = ['row' => $lines[0]['row'], 'message' => "Run {$ref} was already imported or exists.", 'code' => 'duplicate'];

                continue;
            }

            $problems = [];
            $outputs = [];
            $date = trim((string) ($lines[0]['data']['date'] ?? ''));
            $note = trim((string) ($lines[0]['data']['note'] ?? ''));

            foreach ($lines as $line) {
                $data = $line['data'];
                $number = $line['row'];
                $sku = mb_strtolower(trim((string) ($data['output_sku'] ?? '')));
                $material = mb_strtolower(trim((string) ($data['material_sku'] ?? '')));
                $outputWarehouse = $find((string) ($data['output_warehouse'] ?? ''));
                $materialWarehouse = $find((string) ($data['material_warehouse'] ?? '')) ?? $outputWarehouse;

                if (! $products->has($sku)) {
                    $problems[] = ['row' => $number, 'message' => 'Unknown output product SKU.'];
                }

                if (! $products->has($material)) {
                    $problems[] = ['row' => $number, 'message' => 'Unknown material product SKU.'];
                }

                if ($outputWarehouse === null) {
                    $problems[] = ['row' => $number, 'message' => 'Unknown output warehouse (use its code or name).'];
                }

                if ($materialWarehouse === null) {
                    $problems[] = ['row' => $number, 'message' => 'Unknown material warehouse (use its code or name).'];
                }

                if ($problems !== []) {
                    continue;
                }

                $key = $products->get($sku)->id;
                $outputs[$key] ??= [
                    'product_id' => $key, 'warehouse_id' => $outputWarehouse, 'quantity' => trim((string) ($data['output_quantity'] ?? '')),
                    'materials' => [],
                ];
                $outputs[$key]['materials'][] = [
                    'raw_material_id' => $products->get($material)->id, 'warehouse_id' => $materialWarehouse,
                    'actual_quantity' => trim((string) ($data['material_quantity'] ?? '')),
                ];
            }

            $payload = [
                'occurred_on' => $date,
                'note' => trim(($note !== '' ? $note.' ' : '').'[import:'.$ref.']'),
                'outputs' => array_values($outputs),
            ];

            if ($problems === []) {
                $validator = Validator::make($payload, (new SaveProductionRunRequest)->rules());

                foreach ($validator->errors()->all() as $message) {
                    $problems[] = ['row' => $lines[0]['row'], 'message' => $message];
                }

                if ($date !== '' && $date > $today) {
                    $problems[] = ['row' => $lines[0]['row'], 'message' => 'The date cannot be in the future.'];
                }
            }

            if ($problems !== []) {
                $errorRows += $lineCount;

                foreach ($problems as $problem) {
                    $errors[] = [...$problem, 'code' => 'invalid'];
                }

                continue;
            }

            $validRows += $lineCount;
            $create[] = $payload;
        }

        return [
            'summary' => [
                'total_rows' => $rows->count(), 'valid_rows' => $validRows,
                'duplicate_rows' => $duplicateRows, 'error_rows' => $errorRows, 'errors' => array_slice($errors, 0, 100),
            ],
            'create' => $create,
        ];
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function readRows(Request $request): Collection
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:xlsx,xls,csv', 'max:10240'],
            'duplicate_mode' => ['sometimes', 'in:skip,update'],
        ]);

        $reader = new ProductWorkbookRows;
        Excel::import($reader, $request->file('file'));

        return $reader->rows;
    }

    /**
     * @param  list<string>  $headings
     * @param  list<list<mixed>>  $rows
     */
    private function deliver(Request $request, string $format, string $name, array $headings, array $rows)
    {
        abort_unless(in_array($format, ['xlsx', 'pdf', 'print'], true), 404);

        $filename = 'acconova-'.$name.'-'.now()->format('Y-m-d').'.';

        if ($format === 'xlsx') {
            return Excel::download(new SheetExport($headings, $rows), $filename.'xlsx');
        }

        $locale = in_array($request->query('locale'), ['ar', 'en'], true) ? (string) $request->query('locale') : 'en';
        $html = view('exports.table', [
            'title' => ucfirst($name), 'headings' => $headings, 'rows' => $rows, 'locale' => $locale, 'rtl' => $locale === 'ar',
            'organizationName' => app(TenantContext::class)->organization()->name,
            'generatedAt' => now()->format('Y-m-d H:i'), 'autoPrint' => $format === 'print',
        ])->render();

        if ($format === 'print') {
            return response($html);
        }

        $directory = storage_path('app/mpdf');
        File::ensureDirectoryExists($directory);
        $pdf = new Mpdf(['mode' => 'utf-8', 'format' => 'A4-L', 'tempDir' => $directory, 'default_font' => 'dejavusans', 'autoScriptToLang' => true, 'autoLangToFont' => true]);
        $pdf->WriteHTML($html);

        return response($pdf->Output('', Destination::STRING_RETURN), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$filename.'pdf"',
        ]);
    }
}
