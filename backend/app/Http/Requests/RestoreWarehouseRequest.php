<?php

namespace App\Http\Requests;

use App\Models\Warehouse;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class RestoreWarehouseRequest extends FormRequest
{
    private ?Warehouse $resolvedWarehouse =
        null;

    /**
     * Resolve and authorize one archived tenant-scoped warehouse.
     */
    public function authorize(): bool
    {
        $this->resolvedWarehouse =
            Warehouse::query()
                ->onlyTrashed()
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
            'restore',
            $this->resolvedWarehouse,
        ) ?? false;
    }

    /**
     * Warehouse restoration has no request payload.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Return the authorized archived warehouse.
     */
    public function warehouse(): Warehouse
    {
        return $this->resolvedWarehouse
            ?? throw new LogicException(
                'Warehouse was not resolved.',
            );
    }
}
