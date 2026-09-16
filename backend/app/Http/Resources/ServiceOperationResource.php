<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ServiceOperationResource extends JsonResource
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
            'product_id' => $this->product_id,
            'party_id' => $this->party_id,
            'service_name' => $this->service_name,
            'customer_name' => $this->customer_name,
            'unit' => $this->unit,
            'performed_on' => $this->performed_on->format('Y-m-d'),
            'quantity' => $this->quantity,
            'unit_price' => $this->unit_price,
            'subtotal' => $this->subtotal,
            'notes' => $this->notes,
        ];
    }
}
