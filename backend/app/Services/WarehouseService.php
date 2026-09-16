<?php

namespace App\Services;

use App\Exceptions\SafeValidationException;
use App\Models\InventoryBalance;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Tenancy\TenantContext;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

class WarehouseService
{
    /**
     * Build warehouse lifecycle operations around monotonic workspace codes.
     */
    public function __construct(
        private readonly WarehouseCodeGenerator $codes,
    ) {}

    /**
     * Create one warehouse.
     *
     * The first warehouse automatically becomes the default. Later warehouse
     * creation never changes the current default implicitly.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(
        array $data,
    ): Warehouse {
        return DB::transaction(
            function () use ($data): Warehouse {
                $this->lockOrganization();

                $hasDefault =
                    Warehouse::query()
                        ->default()
                        ->exists();

                return Warehouse::create([
                    'code' => $this->codes->next(),

                    'name' => $data['name'],

                    'is_default' => ! $hasDefault,
                ])->refresh();
            },
            3,
        );
    }

    /**
     * Rename one active warehouse without changing its default state.
     *
     * Default selection is handled as an explicit warehouse lifecycle action.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(
        Warehouse $warehouse,
        array $data,
    ): Warehouse {
        return DB::transaction(
            function () use (
                $warehouse,
                $data,
            ): Warehouse {
                $locked =
                    Warehouse::query()
                        ->lockForUpdate()
                        ->findOrFail(
                            $warehouse->id,
                        );

                $locked->name =
                    $data['name'];

                $locked->save();

                return $locked->refresh();
            },
            3,
        );
    }

    /**
     * Promote one active warehouse to the organization default atomically.
     *
     * Organization locking prevents concurrent requests from leaving more
     * than one warehouse marked as default inside the same workspace.
     */
    public function makeDefault(
        Warehouse $warehouse,
    ): Warehouse {
        return DB::transaction(
            function () use (
                $warehouse,
            ): Warehouse {
                $this->lockOrganization();

                $locked =
                    Warehouse::query()
                        ->lockForUpdate()
                        ->findOrFail(
                            $warehouse->id,
                        );

                if (
                    $locked->is_default
                ) {
                    return $locked;
                }

                $this->clearDefaultWarehouse();

                $locked->is_default =
                    true;

                $locked->save();

                return $locked->refresh();
            },
            3,
        );
    }

    /**
     * Archive one warehouse only when doing so cannot hide physical stock.
     */
    public function archive(
        Warehouse $warehouse,
    ): void {
        DB::transaction(
            function () use (
                $warehouse,
            ): void {
                $this->lockOrganization();

                $locked =
                    Warehouse::query()
                        ->lockForUpdate()
                        ->findOrFail(
                            $warehouse->id,
                        );

                if (
                    $locked->is_default
                ) {
                    throw SafeValidationException::forField(
                        'warehouse',
                        'warehouse_default_archive_blocked',
                    );
                }

                if (
                    $this->hasPhysicalStock(
                        $locked->id,
                    )
                ) {
                    throw SafeValidationException::forField(
                        'warehouse',
                        'warehouse_stock_archive_blocked',
                    );
                }

                $locked->delete();
            },
            3,
        );
    }

    /**
     * Restore one archived warehouse while preserving its stable code.
     *
     * A restored warehouse becomes default only if the organization currently
     * has no active default warehouse.
     */
    public function restore(
        Warehouse $warehouse,
    ): Warehouse {
        return DB::transaction(
            function () use (
                $warehouse,
            ): Warehouse {
                $this->lockOrganization();

                $locked =
                    Warehouse::query()
                        ->onlyTrashed()
                        ->lockForUpdate()
                        ->findOrFail(
                            $warehouse->id,
                        );

                $hasDefault =
                    Warehouse::query()
                        ->default()
                        ->exists();

                $locked->restore();

                $locked->is_default =
                    ! $hasDefault;

                $locked->save();

                return $locked->refresh();
            },
            3,
        );
    }

    /**
     * Permanently delete one archived warehouse only when it has no stock and
     * no historical stock movement records.
     *
     * Zero-value balance rows are disposable materialized state, while stock
     * movements are audit history and therefore block permanent deletion.
     */
    public function forceDelete(
        Warehouse $warehouse,
    ): void {
        try {
            DB::transaction(
                function () use (
                    $warehouse,
                ): void {
                    $this->lockOrganization();

                    $locked =
                        Warehouse::query()
                            ->onlyTrashed()
                            ->lockForUpdate()
                            ->findOrFail(
                                $warehouse->id,
                            );

                    if (
                        $locked->is_default
                    ) {
                        throw SafeValidationException::forField(
                            'warehouse',
                            'permanent_delete_blocked',
                        );
                    }

                    if (
                        $this->hasPhysicalStock(
                            $locked->id,
                        )
                    ) {
                        throw SafeValidationException::forField(
                            'warehouse',
                            'permanent_delete_blocked',
                        );
                    }

                    $hasHistory =
                        StockMovement::query()
                            ->where(
                                'warehouse_id',
                                $locked->id,
                            )
                            ->exists();

                    if (
                        $hasHistory
                    ) {
                        throw SafeValidationException::forField(
                            'warehouse',
                            'permanent_delete_blocked',
                        );
                    }

                    InventoryBalance::query()
                        ->where(
                            'warehouse_id',
                            $locked->id,
                        )
                        ->delete();

                    $locked->forceDelete();
                },
                3,
            );
        } catch (
            QueryException $exception
        ) {
            if (
                ! $this->isIntegrityViolation(
                    $exception,
                )
            ) {
                throw $exception;
            }

            throw SafeValidationException::forField(
                'warehouse',
                'permanent_delete_blocked',
            );
        }
    }

    /**
     * Determine whether one warehouse contains physical or reserved stock.
     */
    private function hasPhysicalStock(
        int $warehouseId,
    ): bool {
        return InventoryBalance::query()
            ->where(
                'warehouse_id',
                $warehouseId,
            )
            ->where(
                function ($query): void {
                    $query
                        ->where(
                            'on_hand',
                            '!=',
                            0,
                        )
                        ->orWhere(
                            'reserved',
                            '!=',
                            0,
                        );
                },
            )
            ->exists();
    }

    /**
     * Serialize organization-wide default warehouse changes.
     */
    private function lockOrganization(): void
    {
        DB::table(
            'organizations',
        )
            ->where(
                'id',
                app(
                    TenantContext::class,
                )->id(),
            )
            ->lockForUpdate()
            ->firstOrFail();
    }

    /**
     * Clear the current organization's existing default warehouse.
     */
    private function clearDefaultWarehouse(): void
    {
        Warehouse::query()
            ->where(
                'is_default',
                true,
            )
            ->update([
                'is_default' => false,
            ]);
    }

    /**
     * Recognize common database integrity violations without leaking database
     * implementation details into user-facing responses.
     */
    private function isIntegrityViolation(
        QueryException $exception,
    ): bool {
        $sqlState =
            (string) (
                $exception->errorInfo[0]
                ?? ''
            );

        $driverCode =
            (string) (
                $exception->errorInfo[1]
                ?? ''
            );

        return in_array(
            $sqlState,
            [
                '23000',
                '23503',
            ],
            true,
        ) || in_array(
            $driverCode,
            [
                '19',
                '1451',
                '23503',
            ],
            true,
        );
    }
}
