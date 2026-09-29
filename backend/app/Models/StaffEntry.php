<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use App\Support\InventoryQuantity as Decimal;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

class StaffEntry extends Model
{
    use BelongsToOrganization;
    use SoftDeletes;

    protected $guarded = ['id', 'organization_id'];

    protected static function booted(): void
    {
        static::saved(function (StaffEntry $entry): void {
            $entry->normalizeImportedAttendanceMonth();
        });

        static::deleted(function (StaffEntry $entry): void {
            $entry->normalizeImportedAttendanceMonth();
        });

        static::restored(function (StaffEntry $entry): void {
            $entry->normalizeImportedAttendanceMonth();
        });
    }

    protected function casts(): array
    {
        return ['amount' => 'decimal:4', 'rate' => 'decimal:4', 'quantity' => 'decimal:4', 'terms' => 'array'];
    }

    /**
     * Imported attendance creates one work entry per present day. For salaried-style
     * hourly workers, normalize the month so a complete month lands on the intended
     * monthly salary instead of exceeding it in 27-workday months.
     *
     * The intended monthly salary is inferred from the stored hourly rate using the
     * standard 208 monthly hours (26 days x 8 hours), then rounded to the nearest
     * whole currency unit. Attendance still reduces the entitlement proportionally.
     */
    private function normalizeImportedAttendanceMonth(): void
    {
        $terms = is_array($this->terms) ? $this->terms : [];

        if (
            $this->kind !== 'work'
            || ! isset($terms['attendance_id'])
            || ! ($terms['imported'] ?? false)
            || ! $this->staff_member_id
            || ! $this->occurred_on
        ) {
            return;
        }

        $date = CarbonImmutable::parse((string) $this->occurred_on);
        $monthStart = $date->startOfMonth()->toDateString();
        $monthEnd = $date->endOfMonth()->toDateString();

        $entries = self::query()
            ->where('staff_member_id', $this->staff_member_id)
            ->where('kind', 'work')
            ->whereBetween('occurred_on', [$monthStart, $monthEnd])
            ->orderBy('occurred_on')
            ->orderBy('id')
            ->get()
            ->filter(function (StaffEntry $entry): bool {
                $entryTerms = is_array($entry->terms) ? $entry->terms : [];

                return isset($entryTerms['attendance_id']) && ($entryTerms['imported'] ?? false);
            })
            ->values();

        if ($entries->isEmpty()) {
            return;
        }

        $rate = (string) ($entries->last()?->rate ?? '0');
        $rateUnits = Decimal::toUnits($rate);

        if ($rateUnits <= 0) {
            return;
        }

        // 208 = 26 normal work days x 8 hours. This converts the hourly rate back
        // to the employee's intended monthly salary, e.g. 14.4231 -> 3000.
        $monthlySalaryUnits = (int) round(($rateUnits * 208) / 10000) * 10000;

        $expectedWorkDays = 0;
        for ($cursor = $date->startOfMonth(); $cursor->lte($date->endOfMonth()); $cursor = $cursor->addDay()) {
            if (! $cursor->isFriday()) {
                $expectedWorkDays++;
            }
        }

        if ($expectedWorkDays <= 0) {
            return;
        }

        $expectedHoursUnits = $expectedWorkDays * 8 * 10000;
        $presentHours = DB::table('staff_attendances')
            ->where('staff_member_id', $this->staff_member_id)
            ->whereBetween('occurred_on', [$monthStart, $monthEnd])
            ->where('status', 'present')
            ->sum('quantity');
        $presentHoursUnits = min(Decimal::toUnits((string) $presentHours), $expectedHoursUnits);

        if ($presentHoursUnits <= 0) {
            $desiredMonthUnits = 0;
        } else {
            $proratedUnits = intdiv(
                $monthlySalaryUnits * $presentHoursUnits + intdiv($expectedHoursUnits, 2),
                $expectedHoursUnits,
            );

            // Payroll cards should show clean whole-currency totals: 2999.9 -> 3000.
            $desiredMonthUnits = intdiv($proratedUnits + 5000, 10000) * 10000;
        }

        $totalQuantityUnits = $entries->sum(
            fn (StaffEntry $entry): int => max(0, Decimal::toUnits((string) $entry->quantity))
        );

        if ($totalQuantityUnits <= 0) {
            return;
        }

        $remainingAmountUnits = $desiredMonthUnits;
        $remainingQuantityUnits = $totalQuantityUnits;
        $lastIndex = $entries->count() - 1;

        foreach ($entries as $index => $entry) {
            $quantityUnits = max(0, Decimal::toUnits((string) $entry->quantity));

            if ($index === $lastIndex || $remainingQuantityUnits <= 0) {
                $amountUnits = $remainingAmountUnits;
            } else {
                $amountUnits = intdiv(
                    $remainingAmountUnits * $quantityUnits,
                    $remainingQuantityUnits,
                );
            }

            DB::table('staff_entries')
                ->where('id', $entry->id)
                ->update([
                    'amount' => Decimal::fromUnits($amountUnits),
                    'updated_at' => now(),
                ]);

            $remainingAmountUnits -= $amountUnits;
            $remainingQuantityUnits -= $quantityUnits;
        }
    }
}
