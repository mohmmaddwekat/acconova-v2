<?php

namespace App\Services\Finance;

use App\Exceptions\SafeValidationException;
use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\Product;
use App\Models\User;
use App\Services\Governance\ApprovalWorkflowService;
use App\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

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
            'lines' => $this->lines($row, $sale ? 'sale' : 'purchase'),
        ], $user->id);

        $this->approvals->assertDocumentApproved($draft, $user->id);

        $invoice = $this->documents->issue($draft, $user->id, true);

        $result = [
            'document_id' => $invoice->id,
            'document_number' => $invoice->number,
            'total' => $invoice->total,
            'paid' => '0.0000',
            'allocated' => '0.0000',
            'advance' => '0.0000',
        ];

        $payment = $this->payment($row, (float) $invoice->total);

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
