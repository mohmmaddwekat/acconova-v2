<?php

namespace App\Http\Requests;

use App\Models\Warehouse;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class ShowWarehouseInventoryRequest extends FormRequest
{
    private ?Warehouse $resolvedWarehouse =
        null;

    /**
     * Resolve an active or archived tenant-scoped warehouse.
     */
    public function authorize(): bool
    {
        $this->resolvedWarehouse =
            Warehouse::query()
                ->withTrashed()
                ->find(
                    $this->route(
                        'warehouse',
                    ),
                );

        abort_if(
            $this->resolvedWarehouse ===
                null,
            404,
        );

        return $this->user()?->can(
            'view',
            $this->resolvedWarehouse,
        ) ?? false;
    }

    /**
     * Validate warehouse-product search.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'search' => [
                'nullable',
                'string',
                'max:100',
            ],
        ];
    }

    /**
     * Normalize search text.
     */
    protected function prepareForValidation(): void
    {
        $search =
            trim(
                (string) (
                    $this->input(
                        'search',
                    )
                    ?? ''
                ),
            );

        $this->merge([
            'search' => $search === ''
                ? null
                : $search,
        ]);
    }

    /**
     * Return the authorized warehouse.
     */
    public function warehouse(): Warehouse
    {
        return $this->resolvedWarehouse
            ?? throw new LogicException(
                'Warehouse was not resolved.',
            );
    }
}
