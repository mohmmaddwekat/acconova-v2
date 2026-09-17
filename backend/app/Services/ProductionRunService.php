<?php

namespace App\Services;

use App\Enums\ProductionRunStatus;
use App\Enums\ProductType;
use App\Events\ProductionRecorded;
use App\Events\ProductionRunOutputReversed;
use App\Events\ProductionRunPosted;
use App\Events\ProductionRunReversed;
use App\Exceptions\SafeValidationException;
use App\Models\InventoryBalance;
use App\Models\Product;
use App\Models\ProductionRecipe;
use App\Models\ProductionRecipeUsage;
use App\Models\ProductionRun;
use App\Models\ProductionRunMaterial;
use App\Models\ProductionRunOutput;
use App\Models\Warehouse;
use App\Support\InventoryQuantity;
use App\Support\ProductionSuggestion;
use Illuminate\Support\Facades\DB;

class ProductionRunService
{
    public function __construct(
        private readonly ProductionRunNumberGenerator $numbers,
        private readonly ProductionSuggestion $suggestions,
        private readonly ProductionRunStockService $stock,
    ) {}

    /**
     * Create one editable Production Draft.
     *
     * @param  array<string, mixed>  $data
     */
    public function createDraft(
        array $data,
        int $actorId,
    ): ProductionRun {
        return DB::transaction(
            function () use (
                $data,
                $actorId,
            ): ProductionRun {
                $run =
                    ProductionRun::create([
                        'run_number' => $this->numbers->next(),

                        'occurred_on' => $data['occurred_on'],

                        'status' => ProductionRunStatus::Draft,

                        'revision' => 1,

                        'note' => $data['note']
                            ?? null,

                        'created_by' => $actorId,
                    ]);

                $this->replaceDraftOutputs(
                    $run,
                    $data['outputs'],
                );

                return $this->loadRun(
                    $run,
                );
            },
            3,
        );
    }

    /**
     * Replace all editable Production Draft contents.
     *
     * @param  array<string, mixed>  $data
     */
    public function updateDraft(
        ProductionRun $run,
        array $data,
    ): ProductionRun {
        return DB::transaction(
            function () use (
                $run,
                $data,
            ): ProductionRun {
                $locked =
                    ProductionRun::query()
                        ->lockForUpdate()
                        ->findOrFail(
                            $run->id,
                        );

                $this->guardDraft(
                    $locked,
                );

                $this->guardRevision(
                    $locked,
                    (int) $data['expected_revision'],
                );

                $this->replaceDraftOutputs(
                    $locked,
                    $data['outputs'],
                );

                $locked->forceFill([
                    'occurred_on' => $data['occurred_on'],

                    'note' => $data['note']
                        ?? null,

                    'revision' => $locked->revision
                        + 1,
                ])->save();

                return $this->loadRun(
                    $locked,
                );
            },
            3,
        );
    }

    /**
     * Soft-delete an unposted Production Draft.
     */
    public function deleteDraft(
        ProductionRun $run,
        int $expectedRevision,
    ): void {
        DB::transaction(
            function () use (
                $run,
                $expectedRevision,
            ): void {
                $locked =
                    ProductionRun::query()
                        ->lockForUpdate()
                        ->findOrFail(
                            $run->id,
                        );

                $this->guardDraft(
                    $locked,
                );

                $this->guardRevision(
                    $locked,
                    $expectedRevision,
                );

                $locked->delete();
            },
            3,
        );
    }

    /**
     * Preview actual Inventory consumption and optional Recipe suggestions.
     *
     * @return array<string, mixed>
     */
    public function preview(
        ProductionRun $run,
    ): array {
        $run =
            ProductionRun::query()
                ->with(
                    $this->productionRelations(),
                )
                ->findOrFail(
                    $run->id,
                );

        $this->guardDraft(
            $run,
        );

        return $this->buildPreview(
            $run,
        );
    }

    /**
     * Post authoritative actual consumption to Inventory atomically.
     *
     * Recipe suggestions never determine the stock quantities moved here.
     */
    public function post(
        ProductionRun $run,
        int $expectedRevision,
        int $actorId,
    ): ProductionRun {
        return DB::transaction(
            function () use (
                $run,
                $expectedRevision,
                $actorId,
            ): ProductionRun {
                $locked =
                    ProductionRun::query()
                        ->lockForUpdate()
                        ->findOrFail(
                            $run->id,
                        );

                $this->guardDraft(
                    $locked,
                );

                $this->guardRevision(
                    $locked,
                    $expectedRevision,
                );

                $locked->load(
                    $this->productionRelations(),
                );

                $movements =
                    $this->stock->post(
                        $locked,
                        $actorId,
                    );

                foreach (
                    $locked->outputs as $output
                ) {
                    $movement =
                        $movements[$output->id];

                    if (
                        $output
                            ->production_recipe_id !==
                            null
                            && $output
                                ->recipe_snapshot !==
                                null
                    ) {
                        ProductionRecipeUsage::create([
                            'production_movement_id' => $movement->id,

                            'production_recipe_id' => $output
                                ->production_recipe_id,

                            'snapshot' => $output
                                ->recipe_snapshot,
                        ]);
                    }

                    $output->forceFill([
                        'posted_movement_id' => $movement->id,
                    ])->save();

                    ProductionRecorded::dispatch(
                        (int) $locked
                            ->organization_id,
                        $output->product_id,
                        $movement->id,
                        $output
                            ->production_recipe_id
                            !== null
                            ? (int) $output
                                ->production_recipe_id
                            : null,
                        isset(
                            $output
                                ->recipe_snapshot['recipe_version'],
                        )
                            ? (int) $output
                                ->recipe_snapshot['recipe_version']
                            : null,
                        $actorId,
                    );
                }

                $locked->forceFill([
                    'status' => ProductionRunStatus::Posted,

                    'posted_by' => $actorId,

                    'posted_at' => now(),

                    'revision' => $locked->revision
                        + 1,
                ])->save();

                ProductionRunPosted::dispatch(
                    (int) $locked
                        ->organization_id,
                    $locked->id,
                    $locked->run_number,
                    $locked->outputs->count(),
                    $actorId,
                );

                return $this->loadRun(
                    $locked,
                );
            },
            3,
        );
    }

    /**
     * Reverse every still-active output atomically.
     */
    public function reverseRun(
        ProductionRun $run,
        int $expectedRevision,
        string $reason,
        int $actorId,
    ): ProductionRun {
        return DB::transaction(
            function () use (
                $run,
                $expectedRevision,
                $reason,
                $actorId,
            ): ProductionRun {
                $locked =
                    ProductionRun::query()
                        ->lockForUpdate()
                        ->findOrFail(
                            $run->id,
                        );

                $this->guardReversibleRun(
                    $locked,
                );

                $this->guardRevision(
                    $locked,
                    $expectedRevision,
                );

                $locked->load(
                    $this->productionRelations(),
                );

                $outputs =
                    $locked
                        ->outputs
                        ->filter(
                            fn (
                                ProductionRunOutput $output,
                            ): bool => ! $output->isReversed(),
                        )
                        ->values();

                if ($outputs->isEmpty()) {
                    throw SafeValidationException::forField(
                        'run',
                        'production_run_already_reversed',
                    );
                }

                $this->stock->reverseOutputs(
                    $locked,
                    $outputs,
                    $reason,
                    $actorId,
                );

                foreach (
                    $outputs as $output
                ) {
                    $this->markOutputReversed(
                        $locked,
                        $output,
                        $reason,
                        $actorId,
                    );
                }

                $locked->forceFill([
                    'status' => ProductionRunStatus::Reversed,

                    'reversed_by' => $actorId,

                    'reversed_at' => now(),

                    'reversal_reason' => $reason,

                    'revision' => $locked->revision
                        + 1,
                ])->save();

                ProductionRunReversed::dispatch(
                    (int) $locked
                        ->organization_id,
                    $locked->id,
                    $locked->run_number,
                    $reason,
                    $actorId,
                );

                return $this->loadRun(
                    $locked,
                );
            },
            3,
        );
    }

    /**
     * Reverse one incorrect finished Product independently.
     */
    public function reverseOutput(
        ProductionRun $run,
        int $outputId,
        int $expectedRevision,
        string $reason,
        int $actorId,
    ): ProductionRun {
        return DB::transaction(
            function () use (
                $run,
                $outputId,
                $expectedRevision,
                $reason,
                $actorId,
            ): ProductionRun {
                $locked =
                    ProductionRun::query()
                        ->lockForUpdate()
                        ->findOrFail(
                            $run->id,
                        );

                $this->guardReversibleRun(
                    $locked,
                );

                $this->guardRevision(
                    $locked,
                    $expectedRevision,
                );

                $output =
                    ProductionRunOutput::query()
                        ->where(
                            'production_run_id',
                            $locked->id,
                        )
                        ->with([
                            'product',
                            'warehouse',
                            'materials.rawMaterial',
                            'materials.warehouse',
                        ])
                        ->lockForUpdate()
                        ->findOrFail(
                            $outputId,
                        );

                if ($output->isReversed()) {
                    throw SafeValidationException::forField(
                        'output',
                        'production_run_output_already_reversed',
                    );
                }

                $this->stock->reverseOutputs(
                    $locked,
                    collect([
                        $output,
                    ]),
                    $reason,
                    $actorId,
                );

                $this->markOutputReversed(
                    $locked,
                    $output,
                    $reason,
                    $actorId,
                );

                $remaining =
                    ProductionRunOutput::query()
                        ->where(
                            'production_run_id',
                            $locked->id,
                        )
                        ->whereNull(
                            'reversed_at',
                        )
                        ->count();

                $fullyReversed =
                    $remaining ===
                    0;

                $locked->forceFill([
                    'status' => $fullyReversed
                        ? ProductionRunStatus::Reversed
                        : ProductionRunStatus::PartiallyReversed,

                    'reversed_by' => $fullyReversed
                        ? $actorId
                        : null,

                    'reversed_at' => $fullyReversed
                        ? now()
                        : null,

                    'reversal_reason' => $fullyReversed
                        ? $reason
                        : null,

                    'revision' => $locked->revision
                        + 1,
                ])->save();

                if ($fullyReversed) {
                    ProductionRunReversed::dispatch(
                        (int) $locked
                            ->organization_id,
                        $locked->id,
                        $locked->run_number,
                        $reason,
                        $actorId,
                    );
                }

                return $this->loadRun(
                    $locked,
                );
            },
            3,
        );
    }

    /**
     * Replace Draft outputs and their authoritative actual material rows.
     *
     * @param  list<array<string, mixed>>  $outputs
     */
    private function replaceDraftOutputs(
        ProductionRun $run,
        array $outputs,
    ): void {
        $this->guardDraft(
            $run,
        );

        if ($outputs === []) {
            throw SafeValidationException::forField(
                'outputs',
                'production_run_outputs_required',
            );
        }

        $run
            ->outputs()
            ->delete();

        foreach (
            $outputs as $outputIndex => $outputData
        ) {
            $product =
                Product::query()
                    ->findOrFail(
                        (int) $outputData['product_id'],
                    );

            if (
                $product->type !==
                ProductType::Product
            ) {
                throw SafeValidationException::forField(
                    'outputs',
                    'production_run_product_invalid',
                );
            }

            if (! $product->tracksInventory()) {
                throw SafeValidationException::forField(
                    'outputs',
                    'production_run_inventory_not_tracked',
                );
            }

            $warehouse =
                Warehouse::query()
                    ->findOrFail(
                        (int) $outputData['warehouse_id'],
                    );

            $quantityUnits =
                InventoryQuantity::toUnits(
                    (string) $outputData['quantity'],
                );

            if ($quantityUnits <= 0) {
                throw SafeValidationException::forField(
                    'outputs',
                    'production_run_quantity_positive',
                );
            }

            $recipeId =
                isset(
                    $outputData['recipe_id'],
                )
                ? (int) $outputData['recipe_id']
                : null;

            $recipe =
                $recipeId !==
                null
                ? ProductionRecipe::query()
                    ->findOrFail(
                        $recipeId,
                    )
                : null;

            if (
                $recipe !== null
                && (int) $recipe->product_id !==
                (int) $product->id
            ) {
                throw SafeValidationException::forField(
                    'outputs',
                    'production_run_recipe_invalid',
                );
            }

            $selections =
                $outputData['selections']
                ?? [];

            $quantity =
                InventoryQuantity::fromUnits(
                    $quantityUnits,
                );

            /*
             * Recipe calculation only creates the suggestion snapshot. An
             * inactive historical Recipe is acceptable because it has zero
             * authority over Inventory.
             */
            $snapshot =
                $this
                    ->suggestions
                    ->snapshot(
                        $product,
                        $recipe,
                        $quantity,
                        $selections,
                    );

            $output =
                ProductionRunOutput::create([
                    'production_run_id' => $run->id,

                    'line_number' => $outputIndex
                        + 1,

                    'product_id' => $product->id,

                    'warehouse_id' => $warehouse->id,

                    'production_recipe_id' => $recipe?->id,

                    'quantity' => $quantity,

                    'selections' => $recipe
                        ? $selections
                        : [],

                    'material_sources' => [],

                    'recipe_snapshot' => $snapshot,
                ]);

            $seenPairs = [];

            foreach (
                $outputData['materials'] as $materialIndex => $materialData
            ) {
                $raw =
                    Product::query()
                        ->findOrFail(
                            (int) $materialData['raw_material_id'],
                        );

                if (
                    $raw->type !==
                    ProductType::RawMaterial
                ) {
                    throw SafeValidationException::forField(
                        'outputs',
                        'production_run_material_invalid',
                    );
                }

                if (! $raw->tracksInventory()) {
                    throw SafeValidationException::forField(
                        'outputs',
                        'production_run_inventory_not_tracked',
                    );
                }

                $sourceWarehouse =
                    Warehouse::query()
                        ->findOrFail(
                            (int) $materialData['warehouse_id'],
                        );

                $actualUnits =
                    InventoryQuantity::toUnits(
                        (string) $materialData['actual_quantity'],
                    );

                if ($actualUnits <= 0) {
                    throw SafeValidationException::forField(
                        'outputs',
                        'production_run_quantity_positive',
                    );
                }

                $pair =
                    $raw->id
                    .':'
                    .$sourceWarehouse->id;

                if (
                    isset(
                        $seenPairs[$pair],
                    )
                ) {
                    throw SafeValidationException::forField(
                        'outputs',
                        'production_run_duplicate_material',
                    );
                }

                $seenPairs[$pair] =
                    true;

                ProductionRunMaterial::create([
                    'production_run_output_id' => $output->id,

                    'line_number' => $materialIndex
                        + 1,

                    'raw_material_id' => $raw->id,

                    'warehouse_id' => $sourceWarehouse->id,

                    'actual_quantity' => InventoryQuantity::fromUnits(
                        $actualUnits,
                    ),

                    'note' => $materialData['note']
                        ?? null,
                ]);
            }
        }
    }

    /**
     * Mark one output as historically reversed and emit its after-commit hook.
     */
    private function markOutputReversed(
        ProductionRun $run,
        ProductionRunOutput $output,
        string $reason,
        int $actorId,
    ): void {
        $output->forceFill([
            'reversed_by' => $actorId,

            'reversed_at' => now(),

            'reversal_reason' => $reason,
        ])->save();

        ProductionRunOutputReversed::dispatch(
            (int) $run
                ->organization_id,
            $run->id,
            $output->id,
            $output->product_id,
            $reason,
            $actorId,
        );
    }

    /**
     * Build aggregate Actual Consumption Preview plus optional Recipe variance.
     *
     * @return array<string, mixed>
     */
    private function buildPreview(
        ProductionRun $run,
    ): array {
        $requirements = [];

        $outputs = [];

        foreach (
            $run->outputs as $output
        ) {
            $actualByRaw = [];

            foreach (
                $output->materials as $material
            ) {
                $actualUnits =
                    InventoryQuantity::toUnits(
                        $material
                            ->actual_quantity,
                    );

                $actualByRaw[$material
                    ->raw_material_id] =
                    (
                        $actualByRaw[$material
                            ->raw_material_id]
                        ?? 0
                    )
                    + $actualUnits;

                $key =
                    $material->warehouse_id
                    .':'
                    .$material
                        ->raw_material_id;

                if (
                    ! isset(
                        $requirements[$key],
                    )
                ) {
                    $requirements[$key] = [
                        'material' => $material,

                        'required_units' => 0,
                    ];
                }

                $requirements[$key]['required_units'] +=
                    $actualUnits;
            }

            $suggestedByRaw = [];

            foreach (
                (
                    $output
                        ->recipe_snapshot['components']
                    ?? []
                ) as $component
            ) {
                $rawId =
                    (int) $component['raw_material_id'];

                $suggestedByRaw[$rawId] =
                    (
                        $suggestedByRaw[$rawId]
                        ?? 0
                    )
                    +
                    InventoryQuantity::toUnits(
                        (string) $component['required_quantity'],
                    );
            }

            $comparison = [];

            $rawIds =
                collect(
                    array_keys(
                        $actualByRaw,
                    ),
                )
                    ->merge(
                        array_keys(
                            $suggestedByRaw,
                        ),
                    )
                    ->unique()
                    ->sort()
                    ->values();

            foreach (
                $rawIds as $rawId
            ) {
                $actual =
                    $actualByRaw[$rawId]
                    ?? 0;

                $suggested =
                    $suggestedByRaw[$rawId]
                    ?? 0;

                $deviation =
                    $actual
                    - $suggested;

                $material =
                    $output
                        ->materials
                        ->firstWhere(
                            'raw_material_id',
                            $rawId,
                        );

                $snapshotComponent =
                    collect(
                        $output
                            ->recipe_snapshot['components']
                            ?? [],
                    )->firstWhere(
                        'raw_material_id',
                        $rawId,
                    );

                $name =
                    $material
                        ?->rawMaterial
                        ?->name
                    ??
                    $snapshotComponent['raw_material_name']
                    ?? '';

                $unit =
                    $material
                        ?->rawMaterial
                        ?->unit
                    ??
                    $snapshotComponent['unit']
                    ?? '';

                $comparison[] = [
                    'raw_material_id' => (int) $rawId,

                    'name' => $name,

                    'unit' => $unit,

                    'suggested' => InventoryQuantity::fromUnits(
                        $suggested,
                    ),

                    'actual' => InventoryQuantity::fromUnits(
                        $actual,
                    ),

                    'deviation' => InventoryQuantity::fromUnits(
                        $deviation,
                    ),

                    'deviation_percent' => $suggested > 0
                        ? round(
                            (
                                $deviation
                                / $suggested
                            )
                                * 100,
                            2,
                        )
                        : null,
                ];
            }

            $outputs[] = [
                'id' => $output->id,

                'product' => [
                    'id' => $output
                        ->product
                        ->id,

                    'name' => $output
                        ->product
                        ->name,

                    'unit' => $output
                        ->product
                        ->unit,
                ],

                'quantity' => $output->quantity,

                'warehouse' => [
                    'id' => $output
                        ->warehouse
                        ->id,

                    'name' => $output
                        ->warehouse
                        ->name,
                ],

                'recipe_version' => $output
                    ->recipe_snapshot['recipe_version']
                    ?? null,

                'comparison' => $comparison,
            ];
        }

        $productIds =
            collect(
                $requirements,
            )
                ->map(
                    fn (
                        array $requirement,
                    ): int => $requirement['material']->raw_material_id,
                )
                ->unique()
                ->values();

        $warehouseIds =
            collect(
                $requirements,
            )
                ->map(
                    fn (
                        array $requirement,
                    ): int => $requirement['material']->warehouse_id,
                )
                ->unique()
                ->values();

        $balances =
            InventoryBalance::query()
                ->whereIn(
                    'product_id',
                    $productIds,
                )
                ->whereIn(
                    'warehouse_id',
                    $warehouseIds,
                )
                ->get()
                ->keyBy(
                    fn (
                        InventoryBalance $balance,
                    ): string => $balance->warehouse_id
                        .':'
                        .$balance
                            ->product_id,
                );

        $allSufficient =
            true;

        $materials = [];

        foreach (
            $requirements as $key => $requirement
        ) {
            /** @var ProductionRunMaterial $material */
            $material =
                $requirement['material'];

            /** @var InventoryBalance|null $balance */
            $balance =
                $balances->get(
                    $key,
                );

            $onHand =
                $balance
                ? InventoryQuantity::toUnits(
                    $balance->on_hand,
                )
                : 0;

            $reserved =
                $balance
                ? InventoryQuantity::toUnits(
                    $balance->reserved,
                )
                : 0;

            $available =
                $onHand
                - $reserved;

            $required =
                $requirement['required_units'];

            $shortage =
                max(
                    0,
                    $required
                        - $available,
                );

            $sufficient =
                $shortage ===
                0;

            if (! $sufficient) {
                $allSufficient =
                    false;
            }

            $materials[] = [
                'raw_material' => [
                    'id' => $material
                        ->rawMaterial
                        ->id,

                    'name' => $material
                        ->rawMaterial
                        ->name,

                    'sku' => $material
                        ->rawMaterial
                        ->sku,

                    'unit' => $material
                        ->rawMaterial
                        ->unit,
                ],

                'warehouse' => [
                    'id' => $material
                        ->warehouse
                        ->id,

                    'name' => $material
                        ->warehouse
                        ->name,

                    'code' => $material
                        ->warehouse
                        ->code,
                ],

                'actual_required' => InventoryQuantity::fromUnits(
                    $required,
                ),

                'on_hand' => InventoryQuantity::fromUnits(
                    $onHand,
                ),

                'reserved' => InventoryQuantity::fromUnits(
                    $reserved,
                ),

                'available' => InventoryQuantity::fromUnits(
                    $available,
                ),

                'shortage' => InventoryQuantity::fromUnits(
                    $shortage,
                ),

                'sufficient' => $sufficient,
            ];
        }

        return [
            'run_id' => $run->id,

            'run_number' => $run->run_number,

            'revision' => $run->revision,

            'all_sufficient' => $allSufficient,

            'output_count' => $run
                ->outputs
                ->count(),

            'outputs' => $outputs,

            'materials' => $materials,
        ];
    }

    /**
     * Reject Draft mutation after Posting.
     */
    private function guardDraft(
        ProductionRun $run,
    ): void {
        if (! $run->isDraft()) {
            throw SafeValidationException::forField(
                'run',
                'production_run_not_draft',
            );
        }
    }

    /**
     * Restrict reversal to Posted or Partially Reversed runs.
     */
    private function guardReversibleRun(
        ProductionRun $run,
    ): void {
        if (! $run->hasPostedInventory()) {
            throw SafeValidationException::forField(
                'run',
                'production_run_must_be_posted',
            );
        }
    }

    /**
     * Reject stale browser writes.
     */
    private function guardRevision(
        ProductionRun $run,
        int $expectedRevision,
    ): void {
        if (
            $run->revision !==
            $expectedRevision
        ) {
            throw SafeValidationException::forField(
                'run',
                'production_run_revision_conflict',
            );
        }
    }

    /**
     * Return relations required for Posting and Preview.
     *
     * @return list<string>
     */
    private function productionRelations(): array
    {
        return [
            'outputs.product',
            'outputs.warehouse',
            'outputs.recipe',
            'outputs.materials.rawMaterial',
            'outputs.materials.warehouse',
        ];
    }

    /**
     * Reload the complete Production Run read model.
     */
    private function loadRun(
        ProductionRun $run,
    ): ProductionRun {
        return $run
            ->refresh()
            ->load([
                'createdBy:id,name',
                'postedBy:id,name',
                'reversedBy:id,name',
                'outputs.product',
                'outputs.warehouse',
                'outputs.recipe',
                'outputs.postedMovement',
                'outputs.reversedBy:id,name',
                'outputs.materials.rawMaterial',
                'outputs.materials.warehouse',
            ]);
    }
}
