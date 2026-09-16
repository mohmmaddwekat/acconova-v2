<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StockMovementResource extends JsonResource
{
    /**
     * Transform one stock movement into audit-friendly Inventory API data.
     *
     * @return array<string, mixed>
     */
    public function toArray(
        Request $request,
    ): array {
        return [
            'id' => $this->id,

            'type' => $this->type->value,

            'quantity' => $this->quantity,

            'balance_after' => $this->balance_after,

            'note' => $this->note,

            'transfer_group_uuid' => $this->transfer_group_uuid,

            'product' => $this->product
                ? [
                    'id' => $this->product->id,

                    'name' => $this->product->name,

                    'sku' => $this->product->sku,
                ]
                : null,

            'warehouse' => $this->warehouse
                ? [
                    'id' => $this->warehouse->id,

                    'code' => $this->warehouse->code,

                    'name' => $this->warehouse->name,
                ]
                : null,

            'created_at' => $this->created_at,
        ];
    }
}
