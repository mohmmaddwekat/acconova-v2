<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Create the multi-warehouse inventory foundation.
     *
     * Inventory balances are optimized read models while stock movements
     * remain the durable operational trail behind every quantity change.
     *
     * Index names are explicitly shortened for portability across MySQL,
     * SQLite, and other supported database engines.
     */
    public function up(): void
    {
        Schema::table(
            'products',
            function (Blueprint $table): void {
                $table
                    ->boolean('track_inventory')
                    ->default(false)
                    ->after('tax_rate');

                $table
                    ->decimal(
                        'low_stock_threshold',
                        18,
                        4,
                    )
                    ->nullable()
                    ->after('track_inventory');

                $table->index(
                    [
                        'organization_id',
                        'track_inventory',
                    ],
                    'products_org_track_inventory_idx',
                );
            },
        );

        Schema::create(
            'warehouses',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->string(
                        'code',
                        32,
                    );

                $table
                    ->string(
                        'name',
                        160,
                    );

                $table
                    ->boolean('is_default')
                    ->default(false);

                $table->timestamps();

                $table->softDeletes();

                $table->unique(
                    [
                        'organization_id',
                        'code',
                    ],
                    'warehouses_org_code_uq',
                );

                $table->index(
                    [
                        'organization_id',
                        'is_default',
                    ],
                    'warehouses_org_default_idx',
                );

                $table->index(
                    [
                        'organization_id',
                        'deleted_at',
                    ],
                    'warehouses_org_deleted_idx',
                );
            },
        );

        Schema::create(
            'inventory_balances',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                /*
                 * A warehouse carrying inventory history must not disappear
                 * underneath its persisted balances.
                 */
                $table
                    ->foreignId('warehouse_id')
                    ->constrained()
                    ->restrictOnDelete();

                /*
                 * Product deletion is likewise blocked while inventory
                 * balances still reference that catalog identity.
                 */
                $table
                    ->foreignId('product_id')
                    ->constrained()
                    ->restrictOnDelete();

                $table
                    ->decimal(
                        'on_hand',
                        18,
                        4,
                    )
                    ->default(0);

                $table
                    ->decimal(
                        'reserved',
                        18,
                        4,
                    )
                    ->default(0);

                $table->timestamps();

                /*
                 * One Product may have exactly one materialized balance per
                 * warehouse inside one organization.
                 *
                 * Keep the name intentionally short because MySQL limits
                 * identifier names.
                 */
                $table->unique(
                    [
                        'organization_id',
                        'warehouse_id',
                        'product_id',
                    ],
                    'inventory_balance_org_wh_product_uq',
                );

                $table->index(
                    [
                        'organization_id',
                        'product_id',
                    ],
                    'inventory_balance_org_product_idx',
                );

                $table->index(
                    [
                        'organization_id',
                        'warehouse_id',
                    ],
                    'inventory_balance_org_warehouse_idx',
                );
            },
        );

        Schema::create(
            'stock_movements',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->foreignId('warehouse_id')
                    ->constrained()
                    ->restrictOnDelete();

                $table
                    ->foreignId('product_id')
                    ->constrained()
                    ->restrictOnDelete();

                /*
                 * Historical inventory activity remains readable even if the
                 * employee responsible for it is later removed.
                 */
                $table
                    ->foreignId('created_by')
                    ->nullable()
                    ->constrained('users')
                    ->nullOnDelete();

                $table
                    ->string(
                        'type',
                        32,
                    );

                /*
                 * Movement quantities are signed:
                 * positive adds stock and negative removes stock.
                 */
                $table
                    ->decimal(
                        'quantity',
                        18,
                        4,
                    );

                $table
                    ->decimal(
                        'balance_after',
                        18,
                        4,
                    );

                /*
                 * The outbound and inbound sides of a warehouse transfer
                 * share the same transfer UUID.
                 */
                $table
                    ->uuid('transfer_group_uuid')
                    ->nullable();

                /*
                 * Future invoices, purchases, returns, and other documents can
                 * identify the business record that produced this movement.
                 */
                $table
                    ->string(
                        'reference_type',
                        64,
                    )
                    ->nullable();

                $table
                    ->unsignedBigInteger(
                        'reference_id',
                    )
                    ->nullable();

                $table
                    ->text('note')
                    ->nullable();

                $table->timestamps();

                $table->index(
                    [
                        'organization_id',
                        'product_id',
                        'created_at',
                    ],
                    'stock_move_org_product_created_idx',
                );

                $table->index(
                    [
                        'organization_id',
                        'warehouse_id',
                        'created_at',
                    ],
                    'stock_move_org_warehouse_created_idx',
                );

                $table->index(
                    'transfer_group_uuid',
                    'stock_move_transfer_group_idx',
                );
            },
        );
    }

    /**
     * Remove the Inventory foundation in dependency-safe order.
     */
    public function down(): void
    {
        Schema::dropIfExists(
            'stock_movements',
        );

        Schema::dropIfExists(
            'inventory_balances',
        );

        Schema::dropIfExists(
            'warehouses',
        );

        Schema::table(
            'products',
            function (Blueprint $table): void {
                $table->dropIndex(
                    'products_org_track_inventory_idx',
                );

                $table->dropColumn([
                    'track_inventory',
                    'low_stock_threshold',
                ]);
            },
        );
    }
};
