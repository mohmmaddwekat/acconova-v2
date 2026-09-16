<?php

namespace App\Http\Resources;

use App\Models\StockMovement;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductionResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'quantity' => $this->quantity,
            'warehouse' => $this->warehouse?->name,
            'created_at' => $this->created_at->toIso8601String(),
            'note' => $this->note,
            'materials' => $this->materials->map(fn (StockMovement $movement): array => [
                'id' => $movement->product_id,
                'name' => $movement->product?->name,
                'quantity' => ltrim($movement->quantity, '-'),
                'unit' => $movement->product?->unit,
            ])->all(),
        ];
    }
}
