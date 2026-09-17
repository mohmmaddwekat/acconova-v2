<?php

namespace App\Models;

use App\Enums\ProductionRunStatus;
use App\Models\Concerns\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ProductionRun extends Model
{
    use BelongsToOrganization;
    use SoftDeletes;

    protected $guarded = [
        'id',
        'organization_id',
    ];

    /**
     * Cast lifecycle values.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'occurred_on' => 'date:Y-m-d',
            'status' => ProductionRunStatus::class,
            'revision' => 'integer',
            'posted_at' => 'datetime',
            'reversed_at' => 'datetime',
        ];
    }

    /**
     * Return all finished Products belonging to this run.
     */
    public function outputs(): HasMany
    {
        return $this
            ->hasMany(
                ProductionRunOutput::class,
            )
            ->orderBy('line_number');
    }

    /**
     * Return the user who created the Draft.
     */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(
            User::class,
            'created_by',
        );
    }

    /**
     * Return the user who Posted the run.
     */
    public function postedBy(): BelongsTo
    {
        return $this->belongsTo(
            User::class,
            'posted_by',
        );
    }

    /**
     * Return the user who completed the full reversal.
     */
    public function reversedBy(): BelongsTo
    {
        return $this->belongsTo(
            User::class,
            'reversed_by',
        );
    }

    /**
     * Determine whether Draft contents may still change.
     */
    public function isDraft(): bool
    {
        return $this->status ===
            ProductionRunStatus::Draft;
    }

    /**
     * Determine whether at least one posted output remains active.
     */
    public function hasPostedInventory(): bool
    {
        return in_array(
            $this->status,
            [
                ProductionRunStatus::Posted,
                ProductionRunStatus::PartiallyReversed,
            ],
            true,
        );
    }

    /**
     * Determine whether every output has been reversed.
     */
    public function isReversed(): bool
    {
        return $this->status ===
            ProductionRunStatus::Reversed;
    }
}
