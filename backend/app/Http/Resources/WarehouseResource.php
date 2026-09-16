<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WarehouseResource extends JsonResource
{
    /**
     * Transform one warehouse into the Inventory API contract.
     *
     * @return array<string, mixed>
     */
    public function toArray(
        Request $request,
    ): array {
        return [
            'id' => $this->id,

            'code' => $this->code,

            'name' => $this->name,

            'is_default' => (bool) $this->is_default,

            'stocked_products_count' => (int) (
                $this->stocked_products_count
                ?? 0
            ),

            'stock_movements_count' => (int) (
                $this->stock_movements_count
                ?? 0
            ),

            'deleted_at' => $this->deleted_at,

            'created_at' => $this->created_at,

            'updated_at' => $this->updated_at,
        ];
    }
}
