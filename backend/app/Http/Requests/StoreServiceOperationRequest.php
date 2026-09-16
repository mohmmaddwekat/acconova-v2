<?php

namespace App\Http\Requests;

use App\Enums\ProductType;
use App\Models\Product;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreServiceOperationRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        $product = Product::query()->where('type', ProductType::Service)->findOrFail($this->route('product'));

        return $this->user()?->can('update', $product) ?? false;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'party_id' => ['required', 'integer', Rule::exists('parties', 'id')
                ->where('organization_id', app(TenantContext::class)->id())->whereNull('deleted_at')],
            'performed_on' => ['required', 'date_format:Y-m-d'],
            'quantity' => ['required', 'numeric', 'gt:0', 'max:999999', 'regex:/^\d{1,6}(?:\.\d{1,4})?$/'],
            'unit_price' => ['required', 'numeric', 'min:0', 'max:999999', 'regex:/^\d{1,6}(?:\.\d{1,4})?$/'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ];
    }
}
