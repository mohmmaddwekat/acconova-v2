<?php

namespace App\Http\Requests;

use App\Enums\ProductType;
use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;

class RecordProductionRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        $product = Product::query()->where('type', ProductType::Product)->findOrFail($this->route('product'));

        return $this->user()?->can('manageInventory', $product) ?? false;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'warehouse_id' => ['required', 'integer', 'min:1'],
            'quantity' => ['required', 'numeric', 'gt:0', 'regex:/^\d{1,14}(?:\.\d{1,4})?$/'],
            'materials' => ['required', 'array', 'min:1', 'max:50'],
            'materials.*.product_id' => ['required', 'integer', 'min:1', 'distinct'],
            'materials.*.rate' => ['sometimes', 'required', 'numeric', 'gt:0', 'regex:/^\d{1,14}(?:\.\d{1,4})?$/'],
            'materials.*.quantity' => ['required_without:materials.*.rate', 'numeric', 'gt:0', 'regex:/^\d{1,14}(?:\.\d{1,4})?$/'],
            'note' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
