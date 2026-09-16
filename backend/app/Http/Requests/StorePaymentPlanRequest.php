<?php

namespace App\Http\Requests;

use App\Models\PaymentPlan;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePaymentPlanRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $this->merge(['currency' => app(TenantContext::class)->organization()->preferences['currency'] ?? 'ILS']);
    }

    public function authorize(): bool
    {
        return $this->user()?->can('create', PaymentPlan::class) ?? false;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'direction' => ['required', Rule::in(['outgoing', 'incoming'])],
            'amount' => ['required', 'numeric', 'gt:0', 'regex:/^\d{1,10}(?:\.\d{1,4})?$/'],
            'currency' => ['required', 'regex:/^[A-Z]{3}$/'],
            'interval_count' => ['sometimes', 'required', 'integer', 'between:1,365'],
            'frequency' => ['required', Rule::in(['once', 'weekly', 'monthly', 'yearly'])],
            'next_due_on' => ['required', 'date_format:Y-m-d'],
            'reminder_days' => ['required', 'integer', 'between:0,30'],
            'counterparty' => ['nullable', 'string', 'max:255'],
        ];
    }
}
