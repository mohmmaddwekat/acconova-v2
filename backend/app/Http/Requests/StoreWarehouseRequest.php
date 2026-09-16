<?php

namespace App\Http\Requests;

use App\Models\Warehouse;
use Illuminate\Foundation\Http\FormRequest;

class StoreWarehouseRequest extends FormRequest
{
    /**
     * Authorize creation of inventory locations.
     */
    public function authorize(): bool
    {
        return $this->user()?->can(
            'create',
            Warehouse::class,
        ) ?? false;
    }

    /**
     * Validate warehouse creation.
     *
     * Default state is deliberately absent because it is controlled by the
     * warehouse lifecycle rather than by new-record input.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => [
                'required',
                'string',
                'max:160',
            ],
        ];
    }

    /**
     * Normalize the warehouse display name.
     */
    protected function prepareForValidation(): void
    {
        $this->merge([
            'name' => trim(
                (string) $this->input(
                    'name',
                ),
            ),
        ]);
    }
}
