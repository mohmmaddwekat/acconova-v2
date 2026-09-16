<?php

namespace App\Http\Requests;

use App\Models\Warehouse;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class DeleteWarehouseRequest extends FormRequest
{
    private ?Warehouse $resolvedWarehouse =
        null;

    /**
     * Resolve and authorize warehouse archival.
     */
    public function authorize(): bool
    {
        $this->resolvedWarehouse =
            Warehouse::query()
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
            'delete',
            $this->resolvedWarehouse,
        ) ?? false;
    }

    /**
     * Warehouse archival has no request payload.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Return the authorized active warehouse.
     */
    public function warehouse(): Warehouse
    {
        return $this->resolvedWarehouse
            ?? throw new LogicException(
                'Warehouse was not resolved.',
            );
    }
}
