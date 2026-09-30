<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
use App\Services\Staff\StaffAttendanceEntitlementRepairService;
use App\Services\Staff\StaffMonthlyEntitlementService;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class StaffMember extends Model
{
    use BelongsToOrganization;
    use SoftDeletes;

    /**
     * Prevent entitlement synchronization from recursively re-entering while a
     * Staff member is being hydrated for a Staff API request.
     */
    private static bool $syncingEntitlements = false;

    /**
     * Load the linked system account so employee email can be exposed without
     * causing one query per employee.
     *
     * @var list<string>
     */
    protected $with = [
        'user:id,email',
    ];

    /**
     * Hide the internal account relationship from Staff API payloads.
     *
     * @var list<string>
     */
    protected $hidden = [
        'user',
    ];

    /**
     * Expose the linked account email as normal Staff information.
     *
     * @var list<string>
     */
    protected $appends = [
        'email',
    ];

    protected static function booted(): void
    {
        static::retrieved(function (StaffMember $member): void {
            if (
                self::$syncingEntitlements
                || ! auth()->check()
                || ! request()->is('api/staff*')
            ) {
                return;
            }

            self::$syncingEntitlements = true;

            try {
                app(StaffMonthlyEntitlementService::class)->syncMember(
                    $member,
                    (int) auth()->id(),
                );

                // Repair old/imported hourly, daily and piece attendance rows too.
                // In particular, existing work rows that were created with a
                // historical zero rate are recalculated using the configured
                // current rate instead of being left at amount = 0.
                app(StaffAttendanceEntitlementRepairService::class)->repair(
                    $member,
                    (int) auth()->id(),
                );

                // withSum(balance) is calculated before the retrieved event. If
                // synchronization repaired/created earnings, refresh the aliased
                // value now so the same API response contains the corrected sum.
                if (array_key_exists('balance', $member->getAttributes())) {
                    $member->setAttribute(
                        'balance',
                        StaffEntry::where('staff_member_id', $member->id)
                            ->where('kind', '!=', 'terms')
                            ->sum('amount'),
                    );
                }
            } finally {
                self::$syncingEntitlements = false;
            }
        });
    }

    /**
     * Return ledger entries belonging to the employee.
     */
    public function entries(): HasMany
    {
        return $this->hasMany(
            StaffEntry::class,
        );
    }

    /**
     * Return the AccoNova account linked to this Staff record.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(
            User::class,
        );
    }

    /**
     * Expose the linked account email without duplicating email storage on
     * staff_members.
     */
    protected function email(): Attribute
    {
        return Attribute::get(
            fn (): ?string => $this->user?->email,
        );
    }

    /**
     * Keep tenant identity and primary key immutable through mass assignment.
     *
     * @var list<string>
     */
    protected $guarded = [
        'id',
        'organization_id',
    ];

    /**
     * Cast fixed-point payroll fields and lifecycle status.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'rate' => 'decimal:4',

            'monthly_allowance' => 'decimal:4',

            'active' => 'boolean',
        ];
    }
}
