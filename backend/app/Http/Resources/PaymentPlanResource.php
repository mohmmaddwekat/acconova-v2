<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PaymentPlanResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'interval_count' => $this->interval_count,
            'id' => $this->id, 'title' => $this->title, 'direction' => $this->direction,
            'amount' => $this->amount, 'currency' => $this->currency, 'frequency' => $this->frequency,
            'next_due_on' => $this->next_due_on->format('Y-m-d'), 'counterparty' => $this->counterparty,
            'reminder_days' => $this->reminder_days, 'active' => $this->active,
            'completed' => $this->frequency === 'once' && ($this->records_count ?? 0) > 0,
            'due' => $this->active && $this->next_due_on->lte(today()),
            'reminder' => $this->active && $this->next_due_on->lte(today()->addDays($this->reminder_days)),
        ];
    }
}
