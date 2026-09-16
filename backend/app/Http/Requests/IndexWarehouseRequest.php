<?php

namespace App\Http\Requests;

use App\Models\Warehouse;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class IndexWarehouseRequest extends FormRequest
{
    /**
     * Authorize warehouse discovery through WarehousePolicy.
     */
    public function authorize(): bool
    {
        return $this->user()?->can(
            'viewAny',
            Warehouse::class,
        ) ?? false;
    }

    /**
     * Validate lifecycle filtering.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'status' => [
                'nullable',
                Rule::in([
                    'active',
                    'deleted',
                    'all',
                ]),
            ],
        ];
    }
}
