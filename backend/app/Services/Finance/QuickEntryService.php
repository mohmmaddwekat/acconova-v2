<?php

namespace App\Services\Finance;

use App\Exceptions\SafeValidationException;
use App\Http\Controllers\Finance\PettyExpenseController;
use App\Http\Controllers\Staff\StaffController;
use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\Product;
use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\Governance\ApprovalWorkflowService;
use App\Services\Production\QuickProductionEntryService;
use App\Services\Staff\StaffBulkAttendanceService;
use App\Support\InventoryQuantity as Decimal;
use App\Support\ProductionRunAccess;
use App\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Ramsey\Uuid\Uuid;

/**
 * Bulk entry of historical paper documents: sales and purchase invoices (with
 * products), walk-in sales, and receipts or payments. Every row is saved in its
 * own transaction, so one bad row never blocks the others, and rows are
 * processed oldest first so a later payment can settle an earlier invoice.
 *
 * Money moved by a row is allocated to the party's open invoices, starting
 * with invoices dated on or before the row and going back in time. Whatever is
 * left stays as an unallocated advance.
 */
class QuickEntryService
{
    private const EPSILON = 0.00005;

    private const METHODS = [
        'cash' => 'cash',
        'transfer' => 'bank_transfer',
        'check' => 'check',
    ];

    public function __construct(
        private readonly FinanceDocumentService $documents,
        private readonly CashMovementService $cash,
        private readonly MiscSaleService $miscSales,
        private readonly ApprovalWorkflowService $approvals,
        private readonly TenantContext $tenant,
        private readonly SameDayInvoiceMergeService $merger,
        private readonly QuickProductionEntryService $production,
        private readonly StaffBulkAttendanceService $attendance,
    ) {}

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    public function process(array $rows, User $user): array
    {
        $ordered = collect($rows)
            ->map(fn (array $row, int $index): array => [...$row, '_index' => $index])
            ->sortBy([['date', 'asc'], ['_index', 'asc']])
            ->values();

        $results = [];

        foreach ($ordered as $row) {
            $index = $row['_index'];

            try {
                $results[$index] = [
                    'index' => $index,
                    'ok' => true,
                    ...DB::transaction(fn (): array => $this->processRow($row, $user)),
                ];
            } catch (ValidationException $exception) {
                $results[$index] = [
                    'index' => $index,
                    'ok' => false,
                    'code' => $exception instanceof SafeValidationException ? 'safe' : 'validation',
                    'errors' => $exception->errors(),
                    'message' => collect($exception->errors())->flatten()->first(),
                ];
            }
        }

        ksort($results);

        return array_values($results);
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function processRow(array $row, User $user): array
    {
        return match ($row['type']) {
            'misc' => $this->miscSale($row, $user),
            'sale', 'purchase' => $this->invoice($row, $user),
            'petty' => $this->pettyExpense($row, $user),
            'prod' => $this->productionRun($row, $user),
            'staff' => $this->staffEntry($row, $user),
            'attendance' => $this->attendanceEntry($row, $user),
            default => $this->standalonePayment($row, $user),
        };
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function miscSale(array $row, User $user): array
    {
        $this->allow($user, 'finance.sales.manage');
        $this->allow($user, 'finance.cash.receive');

        $lines = $this->lines($row, 'sale');

        $invoice = $this->miscSales->create([
            'issue_date' => $row['date'],
            'notes' => filled($row['reference'] ?? null) ? 'رقم ورقي: '.$row['reference'] : null,
            'document_discount_type' => $row['discount_type'] ?? 'percent',
            'document_discount_value' => $row['discount_value'] ?? '0',
            'lines' => $lines,
        ], $user->id);

        return [
            'document_id' => $invoice->id,
            'document_number' => $invoice->number,
            'total' => $invoice->total,
            'paid' => $invoice->total,
            'allocated' => '0.0000',
            'advance' => '0.0000',
        ];
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function invoice(array $row, User $user): array
    {
        $sale = $row['type'] === 'sale';
        $this->allow($user, $sale ? 'finance.sales.manage' : 'finance.purchases.manage');

        $party = $this->party($row);
        $kind = $sale ? 'sale_invoice' : 'purchase_invoice';
        if ($this->wantsPayment($row)) {
            $this->allow($user, $sale ? 'finance.cash.receive' : 'finance.cash.pay');
        }

        $existing = $this->merger->find($kind, $party->id, $row['date']);
        $newLines = $this->lines($row, $sale ? 'sale' : 'purchase');
        $addedTotal = null;

        if ($existing) {
            $invoice = $this->merger->merge($existing, $newLines, $row['discount_type'] ?? 'percent', (float) ($row['discount_value'] ?? 0), $row['reference'] ?? null, $user->id);
            $addedTotal = round((float) $invoice->total - (float) $existing->total, 4);
        } else {
            $draft = $this->documents->createDraft([
                'kind' => $kind,
                'party_id' => $party->id,
                'external_number' => $row['reference'] ?? null,
                'issue_date' => $row['date'],
                'due_date' => null,
                'currency' => $this->currency(),
                'exchange_rate' => '1',
                'shipping_total' => '0',
                'document_discount_type' => $row['discount_type'] ?? 'percent',
                'document_discount_value' => $row['discount_value'] ?? '0',
                'lines' => $newLines,
            ], $user->id);

            $this->approvals->assertDocumentApproved($draft, $user->id);

            $invoice = $this->documents->issue($draft, $user->id, true);
        }

        $result = [
            'document_id' => $invoice->id,
            'document_number' => $invoice->number,
            'merged' => $existing !== null,
            'total' => $invoice->total,
            'paid' => '0.0000',
            'allocated' => '0.0000',
            'advance' => '0.0000',
        ];

        $payment = $this->payment($row, $addedTotal ?? (float) $invoice->total);

        if ($payment === null) {
            return $result;
        }

        $movement = $this->settle($row, $party, $kind, $payment, $sale, $user);

        return [
            ...$result,
            'movement_id' => $movement['movement_id'],
            'movement_number' => $movement['movement_number'],
            'paid' => $movement['amount'],
            'allocated' => $movement['allocated'],
            'advance' => $movement['advance'],
        ];
    }

    /**
     * One petty expense: a posted cash payment with no payee.
     *
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function pettyExpense(array $row, User $user): array
    {
        $this->allow($user, 'finance.cash.pay');

        $category = (string) ($row['category'] ?? '');
        $amount = (float) ($row['amount'] ?? 0);

        if (! in_array($category, PettyExpenseController::CATEGORIES, true) || $amount <= 0) {
            throw ValidationException::withMessages(['amount' => ['أدخل تصنيف النثرية ومبلغها.']]);
        }

        $movement = $this->cash->createDraft([
            'direction' => 'outgoing',
            'party_id' => null,
            'government_obligation_id' => null,
            'department_id' => null,
            'category' => $category,
            'amount' => number_format($amount, 4, '.', ''),
            'currency' => $this->currency(),
            'movement_date' => $row['date'],
            'method' => 'cash',
            'account_label' => null,
            'branch_label' => null,
            'cost_center' => null,
            'reference' => 'PETTY-'.str_replace('-', '', $row['date']).'-'.$category,
            'check_number' => null,
            'check_bank' => null,
            'check_due_date' => null,
            'check_status' => null,
            'notes' => filled($row['notes'] ?? null) ? $row['notes'] : null,
            'allocations' => [],
        ], $user->id);

        $this->approvals->assertPaymentApproved($movement, $user->id);

        $posted = $this->cash->post($movement, $user->id);

        return [
            'movement_id' => $posted->id,
            'movement_number' => $posted->number,
            'paid' => number_format($amount, 4, '.', ''),
            'allocated' => '0.0000',
            'advance' => '0.0000',
        ];
    }

    /**
     * One production run from the product's active recipe.
     *
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function productionRun(array $row, User $user): array
    {
        if (! ProductionRunAccess::canManage($user)) {
            throw ValidationException::withMessages(['permission' => ['ليس لديك صلاحية الإنتاج.']]);
        }

        $warehouseId = (int) ($row['warehouse_id'] ?? 0)
            ?: (int) (Warehouse::query()->where('is_default', true)->value('id') ?? Warehouse::query()->value('id'));

        if (! $warehouseId) {
            throw ValidationException::withMessages(['warehouse_id' => ['لا يوجد مستودع لتسجيل الإنتاج فيه.']]);
        }

        $result = $this->production->enter([[
            'occurred_on' => $row['date'],
            'product_id' => (int) ($row['product_id'] ?? 0),
            'quantity' => $row['quantity'] ?? 0,
        ]], $warehouseId, true, $user->id)[0];

        if ($result['status'] === 'failed') {
            $reasons = [
                'no_active_recipe' => 'لا توجد وصفة فعّالة لهذا المنتج.',
                'product_not_found' => 'المنتج غير موجود.',
                'no_materials_available' => 'لا توجد مواد متاحة في الوصفة.',
            ];

            throw ValidationException::withMessages(['product_id' => [$reasons[$result['message']] ?? (string) $result['message']]]);
        }

        return [
            'run_id' => $result['run_id'],
            'document_number' => $result['run_number'],
            'status' => $result['status'],
            'message' => $result['message'],
        ];
    }

    /**
     * One payroll transaction (advance, deduction, bonus…) for an employee.
     *
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function staffEntry(array $row, User $user): array
    {
        $all = StaffController::allowed('staff.pay');

        if (! $all && ! StaffController::allowed('staff.team_pay')) {
            throw ValidationException::withMessages(['permission' => ['ليس لديك صلاحية دفعات الموظفين.']]);
        }

        $kind = (string) ($row['staff_kind'] ?? '');
        $amount = (string) ($row['amount'] ?? '');

        if (! in_array($kind, ['payment', 'bonus', 'allowance', 'deduction', 'advance'], true) || ! preg_match('/^\d+(\.\d{1,4})?$/', $amount) || (float) $amount <= 0) {
            throw ValidationException::withMessages(['amount' => ['أدخل نوع الحركة ومبلغاً صحيحاً.']]);
        }

        $member = StaffMember::query()
            ->when(! $all, fn ($query) => $query->whereIn('department_id', StaffController::managedDepartmentIds()))
            ->find((int) ($row['staff_id'] ?? 0));

        if (! $member || ! StaffController::canPay($member)) {
            throw ValidationException::withMessages(['staff_id' => ['اختر موظفاً مسموحاً لك بالدفع له.']]);
        }

        $units = Decimal::toUnits($amount);
        $negative = in_array($kind, ['deduction', 'payment', 'advance'], true);

        $entry = StaffEntry::create([
            'staff_member_id' => $member->id,
            'created_by' => $user->id,
            'request_id' => Uuid::uuid4()->toString(),
            'kind' => $kind,
            'occurred_on' => $row['date'],
            'amount' => Decimal::fromUnits($negative ? -$units : $units),
            'quantity' => null,
            'rate' => null,
            'notes' => filled($row['notes'] ?? null) ? $row['notes'] : null,
            'terms' => [
                'basis' => $member->basis,
                'unit' => $member->unit,
                'currency' => $member->currency,
                'monthly_allowance' => $member->monthly_allowance,
                'bulk' => true,
            ],
        ]);

        return ['staff_entry_id' => $entry->id, 'document_number' => $member->name];
    }

    /**
     * Present or absent for one employee on one day. Saving the same day again
     * updates the existing attendance row instead of duplicating it.
     *
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function attendanceEntry(array $row, User $user): array
    {
        $all = StaffController::allowed('staff.attendance');

        if (! $all && ! StaffController::allowed('staff.team_attendance')) {
            throw ValidationException::withMessages(['permission' => ['ليس لديك صلاحية الحضور والغياب.']]);
        }

        $status = (string) ($row['attendance_status'] ?? '');

        if (! in_array($status, ['present', 'absent'], true)) {
            throw ValidationException::withMessages(['attendance_status' => ['اختر حاضر أو غائب.']]);
        }

        $member = StaffMember::query()
            ->where('active', true)
            ->whereDate('started_on', '<=', $row['date'])
            ->when(! $all, fn ($query) => $query->whereIn('department_id', StaffController::managedDepartmentIds()))
            ->find((int) ($row['staff_id'] ?? 0));

        if (! $member) {
            throw ValidationException::withMessages(['staff_id' => ['الموظف غير متاح في هذا التاريخ (غير فعّال أو بدأ بعده).']]);
        }

        $quantity = (float) ($row['quantity'] ?? 0);

        $result = $this->attendance->save(
            collect([$member]),
            $row['date'],
            [
                'status' => $status,
                'quantity' => $quantity > 0 ? (string) $quantity : '0',
                'overtime_hours' => '0',
                'overtime_rate' => '0',
                'notes' => filled($row['notes'] ?? null) ? $row['notes'] : null,
            ],
            [],
            $user->id,
        );

        if ($result['skipped'] !== []) {
            throw ValidationException::withMessages(['staff_id' => ['تعذّر تسجيل الحضور: '.($result['skipped'][0]['reason'] ?? 'غير مسموح')]]);
        }

        return ['document_number' => $member->name];
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function standalonePayment(array $row, User $user): array
    {
        $sale = $row['type'] === 'receipt';
        $this->allow($user, $sale ? 'finance.cash.receive' : 'finance.cash.pay');

        $party = $this->party($row);
        $payment = $this->payment($row);

        if ($payment === null) {
            throw ValidationException::withMessages([
                'payment' => ['أدخل مبلغ السند.'],
            ]);
        }

        $movement = $this->settle(
            $row,
            $party,
            $sale ? 'sale_invoice' : 'purchase_invoice',
            $payment,
            $sale,
            $user,
        );

        return [
            'movement_id' => $movement['movement_id'],
            'movement_number' => $movement['movement_number'],
            'paid' => $movement['amount'],
            'allocated' => $movement['allocated'],
            'advance' => $movement['advance'],
        ];
    }

    /**
     * Create and post one cash movement and allocate it to the party's open
     * invoices, newest first from the movement date backwards.
     *
     * @param  array<string, mixed>  $row
     * @param  array{amount: float, method: string, endorsed_id: ?int, check_number: ?string, check_due_date: ?string}  $payment
     * @return array<string, mixed>
     */
    private function settle(array $row, Party $party, string $kind, array $payment, bool $incoming, User $user): array
    {
        [$allocations, $advance] = $this->allocate($party->id, $kind, $row['date'], $payment['amount']);

        $movement = $this->cash->createDraft([
            'direction' => $incoming ? 'incoming' : 'outgoing',
            'party_id' => $party->id,
            'government_obligation_id' => null,
            'department_id' => null,
            'category' => $incoming ? 'customer_receipt' : 'supplier_payment',
            'amount' => number_format($payment['amount'], 4, '.', ''),
            'currency' => $this->currency(),
            'movement_date' => $row['date'],
            'method' => self::METHODS[$payment['method']],
            'account_label' => null,
            'branch_label' => null,
            'cost_center' => null,
            'reference' => $row['reference'] ?? null,
            'check_number' => $payment['check_number'],
            'check_bank' => null,
            'check_due_date' => $payment['check_due_date'],
            'method_details' => $payment['endorsed_id'] !== null && ! $incoming
                ? ['endorsed_movement_id' => $payment['endorsed_id']]
                : null,
            'notes' => 'إدخال سريع من مستندات ورقية',
            'allocations' => $allocations,
        ], $user->id);

        $this->approvals->assertPaymentApproved($movement, $user->id);

        $posted = $this->cash->post($movement, $user->id);

        return [
            'movement_id' => $posted->id,
            'movement_number' => $posted->number,
            'amount' => number_format($payment['amount'], 4, '.', ''),
            'allocated' => number_format(collect($allocations)->sum(fn (array $allocation): float => (float) $allocation['amount']), 4, '.', ''),
            'advance' => number_format($advance, 4, '.', ''),
        ];
    }

    /**
     * @return array{0: list<array{financial_document_id: int, amount: string}>, 1: float}
     */
    private function allocate(int $partyId, string $kind, string $date, float $amount): array
    {
        $open = FinancialDocument::query()
            ->where('party_id', $partyId)
            ->where('kind', $kind)
            ->whereIn('status', ['issued', 'partially_paid'])
            ->where('balance_due', '>', 0)
            ->whereDate('issue_date', '<=', $date)
            ->orderByDesc('issue_date')
            ->orderByDesc('id')
            ->get();

        $remaining = round($amount, 4);
        $allocations = [];

        foreach ($open as $document) {
            if ($remaining <= self::EPSILON) {
                break;
            }

            $part = round(min($remaining, (float) $document->balance_due), 4);

            $allocations[] = [
                'financial_document_id' => $document->id,
                'amount' => number_format($part, 4, '.', ''),
            ];

            $remaining = round($remaining - $part, 4);
        }

        return [$allocations, max($remaining, 0)];
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array{amount: float, method: string, endorsed_id: ?int, check_number: ?string, check_due_date: ?string}|null
     */
    private function payment(array $row, ?float $invoiceTotal = null): ?array
    {
        $payment = $row['payment'] ?? null;
        $amount = ($payment['full'] ?? false) && $invoiceTotal !== null
            ? round($invoiceTotal, 4)
            : round((float) ($payment['amount'] ?? 0), 4);

        if ($amount <= 0) {
            return null;
        }

        $method = $payment['method'] ?? 'cash';

        $endorsedId = $method === 'check' && filled($payment['endorsed_movement_id'] ?? null) ? (int) $payment['endorsed_movement_id'] : null;

        if ($method === 'check' && $endorsedId === null && (blank($payment['check_number'] ?? null) || blank($payment['check_due_date'] ?? null))) {
            throw ValidationException::withMessages([
                'payment' => ['أدخل رقم الشيك وتاريخ استحقاقه.'],
            ]);
        }

        return [
            'amount' => $amount,
            'method' => $method,
            'endorsed_id' => $endorsedId,
            'check_number' => $method === 'check' ? (string) ($payment['check_number'] ?? '') : null,
            'check_due_date' => $method === 'check' ? (string) ($payment['check_due_date'] ?? '') : null,
        ];
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function wantsPayment(array $row): bool
    {
        $payment = $row['payment'] ?? null;

        return (bool) ($payment['full'] ?? false) || (float) ($payment['amount'] ?? 0) > 0;
    }

    /**
     * @param  array<string, mixed>  $row
     * @return list<array<string, mixed>>
     */
    private function lines(array $row, string $side): array
    {
        $lines = $row['lines'] ?? [];

        if ($lines === []) {
            throw ValidationException::withMessages([
                'lines' => ['أضف بنداً واحداً على الأقل.'],
            ]);
        }

        $products = Product::query()
            ->usableForNewBusiness()
            ->whereIn('id', collect($lines)->pluck('product_id'))
            ->get()
            ->keyBy('id');

        return collect($lines)->map(function (array $line) use ($products): array {
            $product = $products->get((int) $line['product_id']);

            if (! $product) {
                throw ValidationException::withMessages([
                    'lines' => ['منتج غير موجود أو غير متاح.'],
                ]);
            }

            return [
                'product_id' => $product->id,
                'description' => $product->name,
                'unit' => $product->unit,
                'quantity' => $line['quantity'],
                'unit_price' => $line['unit_price'],
                'price_status' => 'final',
                'discount_percent' => '0',
                'discount_type' => 'percent',
                'discount_value' => '0',
                'tax_rate' => $product->tax_rate ?? '0',
                'affects_inventory' => false,
            ];
        })->values()->all();
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function party(array $row): Party
    {
        if (blank($row['party_id'] ?? null)) {
            throw ValidationException::withMessages([
                'party_id' => ['اختر الطرف.'],
            ]);
        }

        return Party::query()
            ->usableForNewBusiness()
            ->findOrFail((int) $row['party_id']);
    }

    private function allow(User $user, string $permission): void
    {
        if (! FinanceAuthorization::allows($user, $permission)) {
            throw ValidationException::withMessages([
                'permission' => ['ليس لديك صلاحية لهذا النوع من المستندات.'],
            ]);
        }
    }

    private function currency(): string
    {
        return strtoupper((string) ($this->tenant->organization()->preferences['currency'] ?? 'ILS'));
    }
}
