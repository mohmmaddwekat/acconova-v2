<?php

namespace App\Models;

use App\Models\Concerns\BelongsToOrganization;
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
