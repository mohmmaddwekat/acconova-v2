<?php

namespace App\Services\Finance;

use App\Models\CashMovement;
use App\Services\Products\InvoiceProductBackfill;
use App\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use RuntimeException;

class ExpenseImporter
{
    /** Bill types that are expenses, mapped to cash categories. */
    private const BILL_CATEGORIES = [
        'كهرباء' => 'utilities',
        'نقل' => 'shipping_customs',
        'اجرة مصنع' => 'rent',
        'ضريبة' => 'tax_payment',
        'محاسب' => 'operating_expense',
        'طباعه' => 'operating_expense',
        'ارباح المصنع' => 'other',
    ];

    /** Workbook sheets (trimmed names) and the category of their payments. */
    private const SHEET_CATEGORIES = [
        'شحن كهرباء' => 'utilities',
        'نقل' => 'shipping_customs',
        'مشتريات يومية' => 'operating_expense',
        'صيانة' => 'maintenance',
        'اجرة مخازن' => 'rent',
    ];

    public function __construct(
        private readonly TenantContext $tenant,
        private readonly CashMovementService $cash,
        private readonly InvoiceProductBackfill $names,
    ) {}

    /**
     * Bills file: (id, date, reference, type, extra, amount). "رصيد سابق" is a
     * carried-over balance, not an expense, so it is reported and skipped.
     *
     * @return array{entries: list<array<string, mixed>>, skipped: list<string>}
     */
    public function parseBills(string $path): array
    {
        $entries = [];
        $skipped = [];

        foreach ($this->lines($path) as $line) {
            if (preg_match("/VALUES\('([^']*)', '(\d{4}-\d{2}-\d{2})', (\d+), '([^']*)', ([\d.]+), ([\d.]+)(?:, [\d.]+)?\)/u", $line, $m) !== 1) {
                continue;
            }

            $category = self::BILL_CATEGORIES[$m[4]] ?? null;

            if ($category === null) {
                $skipped[] = $m[4];

                continue;
            }

            $entries[] = [
                'date' => $m[2],
                'category' => $category,
                'amount' => (float) $m[6],
                'reference' => 'BILL-'.$m[3],
                'notes' => 'دفعة '.$m[4].' (فاتورة '.$m[3].') - مستورد من bills',
                'merge' => false,
                'kind' => 'bill',
            ];
        }

        return ['entries' => $entries, 'skipped' => array_count_values($skipped)];
    }

    /**
     * Petty cash file: (id, name, date, amount, description, ...). Small daily
     * items of the same category and day are merged later into one movement.
     *
     * @return list<array<string, mixed>>
     */
    public function parsePetty(string $path): array
    {
        $entries = [];

        foreach ($this->lines($path) as $line) {
            if (preg_match("/^\('([^']*)', '([^']*)', '(\d{4}-\d{2}-\d{2})', ([\d.]+), (NULL|'[^']*'),/u", $line, $m) !== 1) {
                continue;
            }

            $name = trim($m[2]);
            [$category, $merge] = $this->pettyCategory($name);

            $entries[] = [
                'date' => $m[3],
                'category' => $category,
                'amount' => (float) $m[4],
                'reference' => 'PETTY-'.substr($m[1], 0, 8),
                'notes' => $name,
                'merge' => $merge,
                'kind' => 'petty',
            ];
        }

        return $entries;
    }

    /**
     * Workbook sheets of shipping, electricity top-ups and daily purchases:
     * blocks of columns that start at a "التاريخ" header, with a "المبلغ"
     * (amount) column and a type or note column.
     *
     * @return list<array<string, mixed>>
     */
    public function parseWorkbook(string $path): array
    {
        if (! is_file($path)) {
            throw new RuntimeException("File not found: {$path}");
        }

        $reader = IOFactory::createReaderForFile($path);
        $reader->setReadDataOnly(true);
        $workbook = $reader->load($path);
        $entries = [];

        foreach ($workbook->getWorksheetIterator() as $sheet) {
            if (trim($sheet->getTitle()) === 'ضريبة المصنع') {
                array_push($entries, ...$this->parseFeesSheet($sheet));

                continue;
            }

            $category = self::SHEET_CATEGORIES[trim($sheet->getTitle())] ?? null;

            if ($category === null) {
                continue;
            }

            $rowCount = $sheet->getHighestRow();
            $columnCount = min(Coordinate::columnIndexFromString($sheet->getHighestColumn()), 26);
            $blocks = [];

            for ($row = 1; $row <= $rowCount; $row++) {
                $values = [];

                for ($column = 1; $column <= $columnCount; $column++) {
                    $values[$column] = $sheet->getCell([$column, $row])->getValue();
                }

                $starts = array_keys(array_filter($values, fn ($value): bool => is_string($value) && trim($value) === 'التاريخ'));

                if ($starts !== []) {
                    foreach ($starts as $index => $start) {
                        $limit = ($starts[$index + 1] ?? $columnCount + 1) - 1;
                        $labels = [];

                        for ($column = $start; $column <= $limit; $column++) {
                            if (is_string($values[$column]) && trim($values[$column]) !== '') {
                                $labels[$column] = trim($values[$column]);
                            }
                        }

                        $blocks[$start] = ['limit' => max(array_keys($labels)), 'labels' => $labels];
                    }

                    continue;
                }

                foreach ($blocks as $start => $block) {
                    $date = $this->date($values[$start] ?? null);
                    $amountColumn = $this->column($block['labels'], 'المبلغ') ?? $this->column($block['labels'], 'قيمه');

                    if ($date === null || $amountColumn === null) {
                        continue;
                    }

                    $amount = $values[$amountColumn] ?? null;

                    if (! is_numeric($amount) || (float) $amount <= 0) {
                        continue;
                    }

                    $description = [];

                    foreach ($block['labels'] as $column => $label) {
                        if ($column !== $start && $column !== $amountColumn && (str_starts_with($label, 'نوع') || str_starts_with($label, 'ملاحظة') || str_starts_with($label, 'طريقة') || $label === 'الاسم') && ! empty($values[$column])) {
                            $description[] = trim((string) $values[$column]);
                        }
                    }

                    if (in_array('المجموع', $description, true)) {
                        continue;
                    }

                    $entries[] = [
                        'date' => $date,
                        'category' => $category,
                        'amount' => (float) $amount,
                        'reference' => 'XLS-'.trim($sheet->getTitle()).'-'.$date.'-'.$row.'-'.$start,
                        'notes' => trim(trim($sheet->getTitle()).' '.implode(' ', $description)).' - مستورد من حسابات مصنع الامانة',
                        'merge' => false,
                        'kind' => 'xls',
                    ];
                }
            }
        }

        return $entries;
    }

    /**
     * The factory tax sheet lists, per month, the accountant's fee (first
     * amount column) and the tax paid (second amount column) in two side by
     * side blocks. Each is one payment per month, so a month that appears twice
     * with the same amount (a repeated row) is imported once.
     *
     * @return list<array<string, mixed>>
     */
    private function parseFeesSheet(Worksheet $sheet): array
    {
        $entries = [];
        $seen = [];
        $columnCount = min(Coordinate::columnIndexFromString($sheet->getHighestColumn()), 26);
        $starts = [];

        for ($column = 1; $column <= $columnCount; $column++) {
            if (trim((string) $sheet->getCell([$column, 1])->getValue()) === 'التاريخ') {
                $starts[] = $column;
            }
        }

        foreach ($starts as $start) {
            for ($row = 2; $row <= $sheet->getHighestRow(); $row++) {
                $date = $this->date($sheet->getCell([$start, $row])->getValue());

                if ($date === null) {
                    continue;
                }

                foreach ([[$start + 1, 'operating_expense', 'أجرة محاسب'], [$start + 3, 'tax_payment', 'ضريبة المصنع']] as [$column, $category, $label]) {
                    $amount = $sheet->getCell([$column, $row])->getValue();

                    if (! is_numeric($amount) || (float) $amount <= 0) {
                        continue;
                    }

                    $key = $category.'|'.substr($date, 0, 7).'|'.$amount;

                    if (isset($seen[$key])) {
                        continue;
                    }

                    $seen[$key] = true;
                    $entries[] = [
                        'date' => $date,
                        'category' => $category,
                        'amount' => (float) $amount,
                        'reference' => 'XLS-ضريبة-'.$category.'-'.$date.'-'.$row.'-'.$start,
                        'notes' => $label.' - مستورد من حسابات مصنع الامانة',
                        'merge' => false,
                        'kind' => 'xls',
                    ];
                }
            }
        }

        return $entries;
    }

    /**
     * Drop entries the system already has (same date, amount and category;
     * each existing movement cancels one entry), then merge the small items of
     * the same day and category into a single movement.
     *
     * Bills are different: the system already holds the same payments from an
     * older import with other dates and groupings, so exact matching would
     * count them twice. Each category and month is reconciled by total
     * instead: nothing is added when the system already has at least the
     * bills' total, only the shortfall is added when it has less, and the
     * bills are added one by one in months where the system has none.
     *
     * @param  list<array<string, mixed>>  $entries
     * @return array{new: list<array<string, mixed>>, duplicates: int, total: float}
     */
    public function plan(array $entries): array
    {
        $existing = [];

        foreach (CashMovement::query()->where('direction', 'outgoing')->where('status', 'posted')->get(['movement_date', 'category', 'amount']) as $movement) {
            $key = $this->key(substr((string) $movement->movement_date, 0, 10), (string) $movement->category, (float) $movement->amount);
            $existing[$key] = ($existing[$key] ?? 0) + 1;
        }

        $new = [];
        $duplicates = 0;
        [$entries, $billEntries, $covered] = $this->reconcileBills($entries);
        $new = $billEntries;
        $duplicates += $covered;

        foreach ($entries as $entry) {
            $key = $this->key($entry['date'], $entry['category'], $entry['amount']);

            if (($existing[$key] ?? 0) > 0) {
                $existing[$key]--;
                $duplicates++;

                continue;
            }

            $new[] = $entry;
        }

        $merged = [];

        foreach ($new as $entry) {
            if (! $entry['merge']) {
                $merged[] = $entry;

                continue;
            }

            $key = $entry['date'].'|'.$entry['category'];

            if (! isset($merged[$key])) {
                $merged[$key] = $entry + ['items' => []];
                $merged[$key]['amount'] = 0.0;
                $merged[$key]['reference'] = 'PETTY-'.str_replace('-', '', $entry['date']).'-'.$entry['category'];
            }

            $merged[$key]['amount'] += $entry['amount'];
            $merged[$key]['items'][] = $entry['notes'].' '.rtrim(rtrim(number_format($entry['amount'], 2, '.', ''), '0'), '.');
        }

        $final = [];
        $total = 0.0;

        foreach ($merged as $entry) {
            if (isset($entry['items'])) {
                $entry['notes'] = 'مصاريف نثرية: '.implode(' | ', $entry['items']);
            }

            $total += $entry['amount'];
            $final[] = $entry;
        }

        return ['new' => $final, 'duplicates' => $duplicates, 'total' => round($total, 2)];
    }

    /**
     * Create and post one cash outgoing movement per planned entry.
     *
     * @param  array{new: list<array<string, mixed>>}  $plan
     * @return array{created: int, skipped: int}
     */
    public function apply(array $plan, int $actorId): array
    {
        $currency = strtoupper((string) ($this->tenant->organization()->preferences['currency'] ?? 'ILS'));
        $created = 0;
        $skipped = 0;

        foreach ($plan['new'] as $entry) {
            $exists = CashMovement::query()->where('reference', $entry['reference'])->whereDate('movement_date', $entry['date'])->exists();

            if ($exists) {
                $skipped++;

                continue;
            }

            DB::transaction(function () use ($entry, $currency, $actorId): void {
                $draft = $this->cash->createDraft([
                    'direction' => 'outgoing',
                    'party_id' => null,
                    'government_obligation_id' => null,
                    'department_id' => null,
                    'category' => $entry['category'],
                    'amount' => number_format($entry['amount'], 4, '.', ''),
                    'currency' => $currency,
                    'movement_date' => $entry['date'],
                    'method' => 'cash',
                    'account_label' => null,
                    'branch_label' => null,
                    'cost_center' => null,
                    'reference' => $entry['reference'],
                    'check_number' => null,
                    'check_bank' => null,
                    'check_due_date' => null,
                    'check_status' => null,
                    'notes' => mb_substr((string) $entry['notes'], 0, 1000),
                    'allocations' => [],
                ], $actorId);

                $this->cash->post($draft, $actorId);
            }, 3);

            $created++;
        }

        return ['created' => $created, 'skipped' => $skipped];
    }

    /**
     * @param  list<array<string, mixed>>  $entries
     * @return array{0: list<array<string, mixed>>, 1: list<array<string, mixed>>, 2: int} the non-bill entries, the bill entries to create, and how many bills were already covered
     */
    private function reconcileBills(array $entries): array
    {
        $others = [];
        $groups = [];

        foreach ($entries as $entry) {
            if ($entry['kind'] !== 'bill') {
                $others[] = $entry;

                continue;
            }

            $groups[$entry['category'].'|'.substr($entry['date'], 0, 7)][] = $entry;
        }

        $system = CashMovement::query()
            ->where('direction', 'outgoing')
            ->where('status', 'posted')
            ->selectRaw("category, date_format(movement_date, '%Y-%m') as month, sum(amount) as total")
            ->groupBy('category', 'month')
            ->get()
            ->mapWithKeys(fn ($row): array => [$row->category.'|'.$row->month => (float) $row->total])
            ->all();

        $create = [];
        $covered = 0;

        foreach ($groups as $key => $group) {
            $billTotal = array_sum(array_column($group, 'amount'));
            $systemTotal = $system[$key] ?? 0.0;

            if ($systemTotal <= 0.0) {
                array_push($create, ...$group);

                continue;
            }

            $covered += count($group);

            if ($billTotal - $systemTotal > 0.009) {
                $last = $group[array_key_last($group)];
                $dates = array_column($group, 'date');
                sort($dates);
                $month = substr($last['date'], 0, 7);

                $create[] = [
                    'date' => end($dates),
                    'category' => $last['category'],
                    'amount' => round($billTotal - $systemTotal, 2),
                    'reference' => 'BILLDIFF-'.$last['category'].'-'.str_replace('-', '', $month),
                    'notes' => "فرق شهر {$month} عن ملف bills: الملف ".number_format($billTotal, 2).' والنظام '.number_format($systemTotal, 2),
                    'merge' => false,
                    'kind' => 'bill',
                ];
            }
        }

        return [$others, $create, $covered];
    }

    /** @return array{0: string, 1: bool} */
    private function pettyCategory(string $name): array
    {
        $key = $this->names->normalize($name);
        $has = fn (array $words): bool => (bool) array_filter($words, fn (string $word): bool => str_contains($key, $word));

        return match (true) {
            $has(['ارباح']) => ['other', false],
            $has(['اجره', 'اخره', 'ايجار']) => ['rent', false],
            $has(['ضريب']) => ['tax_payment', false],
            $has(['لابتوب']) => ['asset_purchase', false],
            $has(['المواصفات', 'رفترتسجيل']) => ['government_fee', false],
            $has(['صيان', 'سخانات', 'زيت', 'مكن', 'برابيش', 'طفايات', 'شباك']) => ['maintenance', true],
            $has(['نقل']) => ['shipping_customs', true],
            default => ['operating_expense', true],
        };
    }

    /** @param  array<int, string>  $labels */
    private function column(array $labels, string $name): ?int
    {
        foreach ($labels as $column => $label) {
            if (str_contains($label, $name)) {
                return $column;
            }
        }

        return null;
    }

    private function key(string $date, string $category, float $amount): string
    {
        return $date.'|'.$category.'|'.number_format($amount, 2, '.', '');
    }

    private function date(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_numeric($value)) {
            return $value > 40000 && $value < 50000 ? date('Y-m-d', (int) (($value - 25569) * 86400)) : null;
        }

        if (preg_match('~^\s*(\d{1,2})\D(\d{1,2})\D(\d{2,4})\s*$~', (string) $value, $m) === 1) {
            $year = $m[3] < 100 ? 2000 + (int) $m[3] : (int) $m[3];

            return checkdate((int) $m[2], (int) $m[1], $year) && $year >= 2020 && $year <= 2030
                ? sprintf('%04d-%02d-%02d', $year, $m[2], $m[1])
                : null;
        }

        return null;
    }

    /** @return list<string> */
    private function lines(string $path): array
    {
        if (! is_file($path)) {
            throw new RuntimeException("File not found: {$path}");
        }

        return file($path);
    }
}
