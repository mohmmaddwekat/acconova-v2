<?php

namespace App\Http\Requests;

use App\Support\ProductionRunAccess;
use Illuminate\Foundation\Http\FormRequest;

class QuickProductionRunRequest extends FormRequest
{
    /**
     * Quick entry creates Production Runs, so it needs the same access as
     * saving a Production Draft.
     */
    public function authorize(): bool
    {
        return ProductionRunAccess::canManage($this->user());
    }

    /**
     * Validate a batch of one-product Production Runs.
     *
     * Materials are not sent: each row consumes its Product's active Recipe.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'warehouse_id' => ['required', 'integer', 'min:1'],
            'post' => ['sometimes', 'boolean'],
            'rows' => ['required', 'array', 'min:1', 'max:200'],
            'rows.*.occurred_on' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'rows.*.product_id' => ['required', 'integer', 'min:1'],
            'rows.*.quantity' => ['required', 'numeric', 'gt:0', 'regex:/^\d{1,14}(?:\.\d{1,4})?$/'],
        ];
    }
}
