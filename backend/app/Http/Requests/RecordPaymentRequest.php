<?php

namespace App\Http\Requests;

use App\Models\PaymentPlan;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RecordPaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        $plan = PaymentPlan::findOrFail($this->route('plan'));

        return $this->user()?->can('update', $plan) ?? false;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'due_on' => ['required', 'date_format:Y-m-d'],
            'paid_on' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'amount' => ['required', 'numeric', 'gt:0', 'regex:/^\d{1,10}(?:\.\d{1,4})?$/'],
            'counterparty' => ['nullable', 'string', 'max:255'],
            'method' => ['required', Rule::in(['cash', 'bank', 'electronic'])],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
