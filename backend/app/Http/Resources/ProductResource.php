<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductResource extends JsonResource
{
    /**
     * Transform one catalog item into the stable public Product API contract.
     *
     * Inventory eligibility is explicit so frontend surfaces never have to
     * infer whether a Service belongs in warehouse workflows.
     *
     * @return array<string, mixed>
     */
    public function toArray(
        Request $request,
    ): array {
        return [
            'id' => $this->id,

            'type' => $this->type->value,

            'name' => $this->name,

            'sku' => $this->sku,

            'description' => $this->description,

            'unit' => $this->unit,

            'unit_price' => $this->unit_price,

            'cost_price' => $this->cost_price,

            'tax_rate' => $this->tax_rate,

            'inventory_eligible' => $this->isInventoryEligible(),

            'stock_on_hand' => $this->whenHas('stock_on_hand', fn () => $this->tracksInventory() ? (string) ($this->stock_on_hand ?? '0') : null),
            'stock_reserved' => $this->whenHas('stock_reserved', fn () => $this->tracksInventory() ? (string) ($this->stock_reserved ?? '0') : null),

            'track_inventory' => $this->tracksInventory(),

            'low_stock_threshold' => $this->isInventoryEligible()
                ? $this->low_stock_threshold
                : null,

            'usable_for_new_business' => $this->isUsableForNewBusiness(),

            'deleted_at' => $this->deleted_at,

            'created_at' => $this->created_at,

            'updated_at' => $this->updated_at,
        ];
    }
}
