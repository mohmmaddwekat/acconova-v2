<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PaymentRecordResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'title' => $this->title, 'direction' => $this->direction,
            'amount' => $this->amount, 'currency' => $this->currency,
            'counterparty' => $this->counterparty, 'method' => $this->method, 'notes' => $this->notes,
            'due_on' => $this->due_on->format('Y-m-d'), 'paid_on' => $this->paid_on->format('Y-m-d'),
        ];
    }
}
