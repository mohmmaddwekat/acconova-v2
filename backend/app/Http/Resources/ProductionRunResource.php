<?php

namespace App\Http\Resources;

use App\Enums\ProductionRunStatus;
use App\Models\ProductionRunMaterial;
use App\Models\ProductionRunOutput;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductionRunResource extends JsonResource
{
    /**
     * Transform one Production Run into a lifecycle-safe API representation.
     *
     * @return array<string, mixed>
     */
    public function toArray(
        Request $request,
    ): array {
        return [
            'id' => $this->id,

            'run_number' => $this->run_number,

            'occurred_on' => $this
                ->occurred_on
                ->format('Y-m-d'),

            'status' => $this->status->value,

            'revision' => $this->revision,

            'note' => $this->note,

            'created_at' => $this
                ->created_at
                ->toIso8601String(),

            'posted_at' => $this
                ->posted_at
                ?->toIso8601String(),

            'reversed_at' => $this
                ->reversed_at
                ?->toIso8601String(),

            'reversal_reason' => $this->reversal_reason,

            'is_mutable' => $this->status ===
                    ProductionRunStatus::Draft,

            'can_post' => $this->status ===
                    ProductionRunStatus::Draft,

            'can_reverse' => in_array(
                $this->status,
                [
                    ProductionRunStatus::Posted,
                    ProductionRunStatus::PartiallyReversed,
                ],
                true,
            ),

            'outputs' => $this->whenLoaded(
                'outputs',
                fn () => $this
                    ->outputs
                    ->map(
                        fn (
                            ProductionRunOutput $output,
                        ): array => [
                            'id' => $output->id,

                            'line_number' => $output->line_number,

                            'quantity' => $output->quantity,

                            'selections' => $output->selections
                                ?? [],

                            'recipe_snapshot' => $output
                                ->recipe_snapshot,

                            'posted_movement_id' => $output
                                ->posted_movement_id,

                            'reversed_at' => $output
                                ->reversed_at
                                ?->toIso8601String(),

                            'reversal_reason' => $output
                                ->reversal_reason,

                            'can_reverse' => ! $output->isReversed()
                                && in_array(
                                    $this->status,
                                    [
                                        ProductionRunStatus::Posted,
                                        ProductionRunStatus::PartiallyReversed,
                                    ],
                                    true,
                                ),

                            'product' => [
                                'id' => $output
                                    ->product
                                    ->id,

                                'name' => $output
                                    ->product
                                    ->name,

                                'sku' => $output
                                    ->product
                                    ->sku,

                                'unit' => $output
                                    ->product
                                    ->unit,
                                ],

                            'warehouse' => [
                                'id' => $output
                                    ->warehouse
                                    ->id,

                                'name' => $output
                                    ->warehouse
                                    ->name,

                                'code' => $output
                                    ->warehouse
                                    ->code,
                                ],

                            'recipe' => $output->recipe
                                    ? [
                                        'id' => $output
                                            ->recipe
                                            ->id,

                                        'version' => $output
                                            ->recipe
                                            ->version,
                                    ]
                                    : null,

                            'materials' => $output
                                ->materials
                                ->map(
                                    fn (
                                        ProductionRunMaterial $material,
                                    ): array => [
                                        'id' => $material
                                            ->id,

                                        'actual_quantity' => $material
                                            ->actual_quantity,

                                        'note' => $material
                                            ->note,

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
                                    ],
                                )
                                ->values(),
                        ],
                    )
                    ->values(),
            ),
        ];
    }
}
