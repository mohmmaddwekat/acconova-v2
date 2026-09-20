<?php

namespace App\Http\Controllers;

use App\Models\FinancialDocument;
use App\Models\Party;
use App\Services\CashMovementService;
use App\Services\FinanceAuthorization;
use App\Services\FinanceDocumentService;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class FinanceImportController extends Controller
{
    private const MAX_ROWS = 10000;

    public function template(Request $request, string $type): StreamedResponse
    {
        $this->authorizeType($request, $type);

        [$headers, $samples] = $this->templateDefinition($type);
        $currency = strtoupper((string) (app(TenantContext::class)->organization()->preferences['currency'] ?? 'ILS'));

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Data');
        $sheet->fromArray($headers, null, 'A1');
        $sheet->fromArray($samples, null, 'A2');

        $instructions = $spreadsheet->createSheet();
        $instructions->setTitle('Instructions');
        $instructions->fromArray([
            ['AccoNova finance import template'],
            ['Workspace currency', $currency],
            ['Dates', 'YYYY-MM-DD'],
            ['Important', 'Do not change the column names in the Data sheet.'],
            ['Historical invoices', 'Imported invoice lines do not affect current inventory quantities.'],
            ['Duplicate protection', 'Existing external numbers / movement references are skipped where possible.'],
            ['Payments linked to invoices', 'Use invoice_external_number. Any amount above the invoice balance remains party advance credit.'],
            ['Allowed directions', 'incoming, outgoing'],
            ['Allowed methods', 'cash, bank_transfer, check, card, electronic_wallet, direct_debit, other'],
            ['Common outgoing categories', 'supplier_payment, raw_material, goods_for_resale, packaging, operating_expense, rent, utilities, shipping_customs, maintenance, marketing, tax_payment, government_fee, asset_purchase, other_expense, other'],
            ['Common incoming categories', 'customer_receipt, capital, loan, asset_sale, refund, other_income, other'],
        ], null, 'A1');

        foreach ($spreadsheet->getWorksheetIterator() as $worksheet) {
            foreach (range('A', $worksheet->getHighestColumn()) as $column) {
                $worksheet->getColumnDimension($column)->setAutoSize(true);
            }
            $worksheet->freezePane('A2');
        }

        $filename = 'acconova-'.$type.'-template.xlsx';

        return response()->streamDownload(function () use ($spreadsheet): void {
            (new Xlsx($spreadsheet))->save('php://output');
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    public function preview(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(['sales_invoices', 'purchase_invoices', 'cash_movements'])],
            'file' => ['required', 'file', 'max:20480', 'mimes:csv,txt,xls,xlsx'],
        ]);

        $this->authorizeType($request, $data['type']);
        $rows = $this->readRows($request->file('file')->getRealPath());
        $headers = array_keys($rows[0] ?? []);
        [$required] = $this->requiredColumns($data['type']);
        $missing = array_values(array_diff($required, $headers));

        return response()->json([
            'type' => $data['type'],
            'name' => $request->file('file')->getClientOriginalName(),
            'row_count' => count($rows),
            'headers' => $headers,
            'sample' => array_slice($rows, 0, 8),
            'missing_required' => $missing,
            'ready' => $missing === [] && $rows !== [],
        ]);
    }

    public function commit(
        Request $request,
        FinanceDocumentService $documents,
        CashMovementService $cash,
    ): JsonResponse {
        $data = $request->validate([
            'type' => ['required', Rule::in(['sales_invoices', 'purchase_invoices', 'cash_movements'])],
            'file' => ['required', 'file', 'max:20480', 'mimes:csv,txt,xls,xlsx'],
        ]);

        $this->authorizeType($request, $data['type']);
        $rows = $this->readRows($request->file('file')->getRealPath());

        [$required] = $this->requiredColumns($data['type']);
        $headers = array_keys($rows[0] ?? []);
        $missing = array_values(array_diff($required, $headers));

        abort_if($rows === [], 422, 'The uploaded file contains no data rows.');
        abort_if($missing !== [], 422, 'Missing required columns: '.implode(', ', $missing));

        if ($data['type'] === 'cash_movements') {
            $directions = collect($rows)
                ->pluck('direction')
                ->map(fn ($value): string => strtolower(trim((string) $value)))
                ->unique();

            if ($directions->contains('incoming')) {
                FinanceAuthorization::authorize($request->user(), 'finance.cash.receive');
            }

            if ($directions->contains('outgoing')) {
                FinanceAuthorization::authorize($request->user(), 'finance.cash.pay');
            }
        }

        $result = $data['type'] === 'cash_movements'
            ? $this->importCash($rows, $request->user()->id, $cash)
            : $this->importInvoices(
                $rows,
                $data['type'] === 'sales_invoices' ? 'sale_invoice' : 'purchase_invoice',
                $request->user()->id,
                $documents,
            );

        return response()->json([
            'type' => $data['type'],
            ...$result,
        ]);
    }

    /** @return array{created:int, skipped:int, errors:list<array{row:int,message:string}>} */
    private function importInvoices(
        array $rows,
        string $kind,
        int $actorId,
        FinanceDocumentService $documents,
    ): array {
        $currency = strtoupper((string) (app(TenantContext::class)->organization()->preferences['currency'] ?? 'ILS'));
        $role = $kind === 'sale_invoice' ? 'customer' : 'supplier';
        $groups = [];

        foreach ($rows as $index => $row) {
            $key = trim((string) ($row['document_key'] ?? ''));
            if ($key === '') {
                $groups['__invalid_'.$index][] = ['_row' => $index + 2, ...$row];
                continue;
            }
            $groups[$key][] = ['_row' => $index + 2, ...$row];
        }

        $created = 0;
        $skipped = 0;
        $errors = [];

        foreach ($groups as $key => $group) {
            $first = $group[0];

            try {
                DB::transaction(function () use (
                    $key,
                    $group,
                    $first,
                    $kind,
                    $role,
                    $currency,
                    $actorId,
                    $documents,
                    &$created,
                    &$skipped
                ): void {
                    if (str_starts_with($key, '__invalid_')) {
                        throw new RuntimeException('document_key is required.');
                    }

                    $partyName = trim((string) ($first['party_name'] ?? ''));
                    $issueDate = $this->date($first['issue_date'] ?? null);
                    $externalNumber = trim((string) ($first['external_number'] ?? '')) ?: 'LEGACY-'.$key;

                    if ($partyName === '' || $issueDate === null) {
                        throw new RuntimeException('party_name and issue_date are required.');
                    }

                    $duplicate = FinancialDocument::query()
                        ->where('kind', $kind)
                        ->where('external_number', $externalNumber)
                        ->exists();

                    if ($duplicate) {
                        $skipped++;
                        return;
                    }

                    $party = $this->findOrCreateParty($partyName, $role);
                    $lines = [];

                    foreach ($group as $row) {
                        $description = trim((string) ($row['line_description'] ?? ''));
                        $quantity = $this->decimal($row['quantity'] ?? null);
                        $unitPrice = $this->decimal($row['unit_price'] ?? null);

                        if ($description === '' || $quantity === null || $unitPrice === null || (float) $quantity <= 0 || (float) $unitPrice < 0) {
                            throw new RuntimeException('Every line needs line_description, quantity > 0, and unit_price >= 0.');
                        }

                        $discount = $this->decimal($row['discount_percent'] ?? null) ?? '0';
                        $taxRate = $this->decimal($row['tax_rate'] ?? null) ?? '0';

                        if ((float) $discount < 0 || (float) $discount > 100 || (float) $taxRate < 0 || (float) $taxRate > 100) {
                            throw new RuntimeException('discount_percent and tax_rate must be between 0 and 100.');
                        }

                        $lines[] = [
                            'product_id' => null,
                            'warehouse_id' => null,
                            'tax_rule_id' => null,
                            'description' => $description,
                            'unit' => trim((string) ($row['unit'] ?? '')) ?: null,
                            'quantity' => $quantity,
                            'unit_price' => $unitPrice,
                            'price_status' => 'final',
                            'discount_percent' => $discount,
                            'tax_rate' => $taxRate,
                            'affects_inventory' => false,
                        ];
                    }

                    $draft = $documents->createDraft([
                        'kind' => $kind,
                        'party_id' => $party->id,
                        'warehouse_id' => null,
                        'department_id' => null,
                        'external_number' => $externalNumber,
                        'issue_date' => $issueDate,
                        'due_date' => $this->date($first['due_date'] ?? null),
                        'activity_type' => 'trade',
                        'market_type' => 'local',
                        'branch_label' => null,
                        'currency' => $currency,
                        'exchange_rate' => '1',
                        'shipping_total' => $this->decimal($first['shipping_total'] ?? null) ?? '0',
                        'payment_terms' => null,
                        'notes' => trim((string) ($first['notes'] ?? '')) ?: 'Imported from legacy finance data',
                        'internal_notes' => 'Legacy import key: '.$key,
                        'lines' => $lines,
                    ], $actorId);

                    $documents->issue($draft, $actorId, true);
                    $created++;
                }, 3);
            } catch (Throwable $exception) {
                $skipped++;
                $this->pushError($errors, (int) $first['_row'], $exception->getMessage());
            }
        }

        return compact('created', 'skipped', 'errors');
    }

    /** @return array{created:int, skipped:int, errors:list<array{row:int,message:string}>} */
    private function importCash(array $rows, int $actorId, CashMovementService $cash): array
    {
        $currency = strtoupper((string) (app(TenantContext::class)->organization()->preferences['currency'] ?? 'ILS'));
        $created = 0;
        $skipped = 0;
        $errors = [];

        foreach ($rows as $index => $row) {
            try {
                DB::transaction(function () use ($row, $currency, $actorId, $cash, &$created, &$skipped): void {
                    $movementKey = trim((string) ($row['movement_key'] ?? ''));
                    $direction = strtolower(trim((string) ($row['direction'] ?? '')));
                    $category = strtolower(trim((string) ($row['category'] ?? '')));
                    $amount = $this->decimal($row['amount'] ?? null);
                    $movementDate = $this->date($row['movement_date'] ?? null);
                    $method = $this->normalizeMethod($row['method'] ?? null);

                    if ($movementKey === '' || ! in_array($direction, ['incoming', 'outgoing'], true) || $amount === null || (float) $amount <= 0 || $movementDate === null || $method === null) {
                        throw new RuntimeException('movement_key, direction, amount > 0, movement_date, and method are required.');
                    }

                    $allowed = [
                        'customer_receipt', 'supplier_payment', 'raw_material', 'goods_for_resale',
                        'packaging', 'operating_expense', 'rent', 'utilities', 'shipping_customs',
                        'maintenance', 'marketing', 'tax_payment', 'government_fee', 'loan',
                        'capital', 'asset_purchase', 'asset_sale', 'refund', 'other_income',
                        'other_expense', 'other',
                    ];

                    if (! in_array($category, $allowed, true)) {
                        throw new RuntimeException('Unsupported category: '.$category);
                    }

                    $incomingOnly = ['customer_receipt', 'capital', 'loan', 'asset_sale', 'refund', 'other_income'];
                    $outgoingOnly = [
                        'supplier_payment', 'raw_material', 'goods_for_resale', 'packaging',
                        'operating_expense', 'rent', 'utilities', 'shipping_customs',
                        'maintenance', 'marketing', 'tax_payment', 'government_fee',
                        'asset_purchase', 'other_expense',
                    ];

                    if ($direction === 'incoming' && in_array($category, $outgoingOnly, true)) {
                        throw new RuntimeException('Incoming movements cannot use an outgoing-only category.');
                    }

                    if ($direction === 'outgoing' && in_array($category, $incomingOnly, true)) {
                        throw new RuntimeException('Outgoing movements cannot use an incoming-only category.');
                    }

                    $reference = trim((string) ($row['reference'] ?? '')) ?: 'LEGACY-'.$movementKey;
                    $duplicate = \App\Models\CashMovement::query()
                        ->where('reference', $reference)
                        ->whereDate('movement_date', $movementDate)
                        ->where('amount', $amount)
                        ->exists();

                    if ($duplicate) {
                        $skipped++;
                        return;
                    }

                    $partyName = trim((string) ($row['party_name'] ?? ''));
                    $party = null;

                    if ($partyName !== '') {
                        $party = $this->findOrCreateParty(
                            $partyName,
                            $direction === 'incoming' ? 'customer' : 'supplier',
                        );
                    }

                    if (in_array($category, ['customer_receipt', 'supplier_payment'], true) && ! $party) {
                        throw new RuntimeException('party_name is required for customer_receipt and supplier_payment.');
                    }

                    $allocations = [];
                    $invoiceReference = trim((string) ($row['invoice_external_number'] ?? ''));

                    if ($invoiceReference !== '') {
                        $requiredKind = $direction === 'incoming' ? 'sale_invoice' : 'purchase_invoice';
                        $invoice = FinancialDocument::query()
                            ->where('kind', $requiredKind)
                            ->where(function ($query) use ($invoiceReference): void {
                                $query
                                    ->where('external_number', $invoiceReference)
                                    ->orWhere('number', $invoiceReference);
                            })
                            ->when($party, fn ($query) => $query->where('party_id', $party->id))
                            ->whereIn('status', ['issued', 'partially_paid', 'paid', 'overpaid'])
                            ->first();

                        if (! $invoice) {
                            throw new RuntimeException('invoice_external_number could not be matched to an active invoice.');
                        }

                        $allocated = min((float) $amount, (float) $invoice->balance_due);
                        if ($allocated > 0) {
                            $allocations[] = [
                                'financial_document_id' => $invoice->id,
                                'amount' => number_format($allocated, 4, '.', ''),
                            ];
                        }
                    }

                    $payload = [
                        'direction' => $direction,
                        'party_id' => $party?->id,
                        'government_obligation_id' => null,
                        'department_id' => null,
                        'category' => $category,
                        'amount' => $amount,
                        'currency' => $currency,
                        'movement_date' => $movementDate,
                        'method' => $method,
                        'account_label' => trim((string) ($row['account_label'] ?? '')) ?: null,
                        'branch_label' => null,
                        'cost_center' => null,
                        'reference' => $reference,
                        'check_number' => $method === 'check' ? (trim((string) ($row['check_number'] ?? '')) ?: null) : null,
                        'check_bank' => $method === 'check' ? (trim((string) ($row['check_bank'] ?? '')) ?: null) : null,
                        'check_due_date' => $method === 'check' ? $this->date($row['check_due_date'] ?? null) : null,
                        'check_status' => $method === 'check' ? 'cleared' : null,
                        'notes' => trim((string) ($row['notes'] ?? '')) ?: 'Imported from legacy finance data',
                        'allocations' => $allocations,
                    ];

                    if ($method === 'check' && (! $payload['check_number'] || ! $payload['check_bank'] || ! $payload['check_due_date'])) {
                        throw new RuntimeException('Check imports require check_number, check_bank, and check_due_date.');
                    }

                    $draft = $cash->createDraft($payload, $actorId);
                    $cash->post($draft, $actorId);
                    $created++;
                }, 3);
            } catch (Throwable $exception) {
                $skipped++;
                $this->pushError($errors, $index + 2, $exception->getMessage());
            }
        }

        return compact('created', 'skipped', 'errors');
    }

    private function findOrCreateParty(string $name, string $role): Party
    {
        $party = Party::query()
            ->where(function ($query) use ($name): void {
                $query->where('company_name', $name)->orWhere('name', $name);
            })
            ->first();

        if (! $party) {
            $party = Party::create([
                'type' => 'company',
                'company_name' => $name,
                'name' => $name,
            ]);
        }

        if (! $party->roles()->where('role', $role)->exists()) {
            $party->roles()->create(['role' => $role]);
        }

        return $party->load('roles');
    }

    /** @return list<array<string,mixed>> */
    private function readRows(string $path): array
    {
        $spreadsheet = IOFactory::load($path);
        $sheet = $spreadsheet->getActiveSheet();
        $raw = $sheet->toArray(null, true, true, false);

        if ($raw === []) {
            return [];
        }

        $headers = array_map(fn ($value): string => $this->header((string) $value), array_shift($raw) ?? []);
        $rows = [];

        foreach ($raw as $row) {
            if (count($rows) >= self::MAX_ROWS) {
                throw new RuntimeException('Import is limited to 10,000 rows per file.');
            }

            if (! collect($row)->contains(fn ($value): bool => trim((string) $value) !== '')) {
                continue;
            }

            $associated = [];
            foreach ($headers as $column => $header) {
                if ($header !== '') {
                    $associated[$header] = $row[$column] ?? null;
                }
            }
            $rows[] = $associated;
        }

        return $rows;
    }

    private function header(string $value): string
    {
        return strtolower(trim(preg_replace('/[^A-Za-z0-9_]+/', '_', $value) ?? ''));
    }

    private function decimal(mixed $value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        $normalized = str_replace([',', ' '], '', (string) $value);
        if (! is_numeric($normalized)) {
            return null;
        }

        return number_format((float) $normalized, 4, '.', '');
    }

    private function date(mixed $value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        if (is_numeric($value)) {
            try {
                return \PhpOffice\PhpSpreadsheet\Shared\Date::excelToDateTimeObject((float) $value)->format('Y-m-d');
            } catch (Throwable) {
                return null;
            }
        }

        try {
            return \Carbon\CarbonImmutable::parse((string) $value)->format('Y-m-d');
        } catch (Throwable) {
            return null;
        }
    }

    private function normalizeMethod(mixed $value): ?string
    {
        $method = strtolower(trim((string) $value));

        return match ($method) {
            'cash' => 'cash',
            'bank', 'bank_transfer', 'transfer' => 'bank_transfer',
            'check', 'cheque' => 'check',
            'card', 'credit_card', 'debit_card' => 'card',
            'electronic', 'electronic_wallet', 'wallet' => 'electronic_wallet',
            'direct_debit' => 'direct_debit',
            'other' => 'other',
            default => null,
        };
    }

    /** @return array{0:list<string>,1:list<list<string|int|float>>} */
    private function templateDefinition(string $type): array
    {
        if ($type === 'cash_movements') {
            return [[
                'movement_key', 'direction', 'party_name', 'category', 'amount', 'movement_date',
                'method', 'reference', 'account_label', 'invoice_external_number',
                'check_number', 'check_bank', 'check_due_date', 'notes',
            ], [
                ['PAY-001', 'outgoing', 'Supplier A', 'supplier_payment', 6000, '2026-01-15', 'bank_transfer', 'OLD-PAY-001', 'Main bank', 'PUR-100', '', '', '', '4000 invoice + 2000 supplier advance'],
                ['EXP-001', 'outgoing', '', 'rent', 1200, '2026-01-31', 'cash', 'OLD-RENT-01', 'Cash box', '', '', '', '', 'Legacy rent expense'],
                ['RCV-001', 'incoming', 'Customer A', 'customer_receipt', 2500, '2026-02-01', 'bank_transfer', 'OLD-RCV-001', 'Main bank', 'SAL-200', '', '', '', 'Legacy receipt'],
            ]];
        }

        return [[
            'document_key', 'external_number', 'party_name', 'issue_date', 'due_date',
            'line_description', 'unit', 'quantity', 'unit_price', 'discount_percent',
            'tax_rate', 'shipping_total', 'notes',
        ], [
            ['INV-001', $type === 'sales_invoices' ? 'SAL-100' : 'PUR-100', $type === 'sales_invoices' ? 'Customer A' : 'Supplier A', '2026-01-10', '2026-02-10', 'Legacy line 1', 'unit', 2, 100, 5, 0, 0, 'Imported invoice'],
            ['INV-001', $type === 'sales_invoices' ? 'SAL-100' : 'PUR-100', $type === 'sales_invoices' ? 'Customer A' : 'Supplier A', '2026-01-10', '2026-02-10', 'Legacy line 2', 'unit', 1, 50, 0, 0, 0, 'Same document_key groups lines into one invoice'],
        ]];
    }

    /** @return array{0:list<string>,1:list<string>} */
    private function requiredColumns(string $type): array
    {
        if ($type === 'cash_movements') {
            return [[
                'movement_key', 'direction', 'category', 'amount', 'movement_date', 'method',
            ], []];
        }

        return [[
            'document_key', 'party_name', 'issue_date', 'line_description', 'quantity', 'unit_price',
        ], []];
    }

    private function authorizeType(Request $request, string $type): void
    {
        if ($type === 'cash_movements') {
            abort_unless(
                FinanceAuthorization::allows($request->user(), 'finance.cash.pay')
                || FinanceAuthorization::allows($request->user(), 'finance.cash.receive'),
                403,
            );

            return;
        }

        $permission = match ($type) {
            'sales_invoices' => 'finance.sales.manage',
            'purchase_invoices' => 'finance.purchases.manage',
            default => abort(404),
        };

        FinanceAuthorization::authorize($request->user(), $permission);
    }

    /** @param list<array{row:int,message:string}> $errors */
    private function pushError(array &$errors, int $row, string $message): void
    {
        if (count($errors) < 50) {
            $errors[] = ['row' => $row, 'message' => $message];
        }
    }
}
