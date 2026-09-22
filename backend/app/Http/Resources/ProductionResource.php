<?php

namespace App\Http\Resources;

use App\Models\ProductionRecipeUsage;
use App\Models\StockMovement;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductionResource extends JsonResource
{
    /**
     * Transform one immutable production batch.
     *
     * @return array<string, mixed>
     */
    public function toArray(
        Request $request,
    ): array {
        /** @var ProductionRecipeUsage|null $usage */
        $usage =
            $this->relationLoaded(
                'recipeUsage',
            )
            ? $this->getRelation(
                'recipeUsage',
            )
            : null;

        $runOutput =
            $this->relationLoaded(
                'productionRunOutput',
            )
            ? $this->getRelation(
                'productionRunOutput',
            )
            : null;

        $recipe =
            $usage?->recipe
            ?? $runOutput?->recipe;

        $recipeSnapshot =
            $usage?->snapshot
            ?? $runOutput?->recipe_snapshot;

        return [
            'id' => $this->id,

            'quantity' => $this->quantity,

            'warehouse' => $this->warehouse?->name,

            'created_at' => $this
                ->created_at
                ->toIso8601String(),

            'note' => $this->note,

            'recipe_version' => $recipe?->version,

            'recipe_snapshot' => $recipeSnapshot,

            'materials' => $this
                ->materials
                ->map(
                    fn (
                        StockMovement $movement,
                    ): array => [
                        'id' => $movement->product_id,

                        'name' => $movement->product?->name,

                        'quantity' => ltrim(
                            $movement->quantity,
                            '-',
                        ),

                        'unit' => $movement->product?->unit,
                    ],
                )
                ->all(),
        ];
    }
}
