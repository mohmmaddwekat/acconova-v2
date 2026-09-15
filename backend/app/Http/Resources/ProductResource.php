<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductResource extends JsonResource
{
    /**
     * Transform a Product into the stable public catalog API contract.
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

            'usable_for_new_business' => $this->isUsableForNewBusiness(),

            'deleted_at' => $this->deleted_at,

            'created_at' => $this->created_at,

            'updated_at' => $this->updated_at,
        ];
    }
}
