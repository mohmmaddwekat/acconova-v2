<?php

namespace App\Http\Requests;

use App\Models\User;
use App\Models\Warehouse;
use App\Policies\WarehousePolicy;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class SetDefaultWarehouseRequest extends FormRequest
{
    private ?Warehouse $resolvedWarehouse =
        null;

    /**
     * Resolve one active tenant warehouse and authorize default management.
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

        $user =
            $this->user();

        if (
            ! $user instanceof User
        ) {
            return false;
        }

        return app(
            WarehousePolicy::class,
        )->update(
            $user,
            $this->resolvedWarehouse,
        );
    }

    /**
     * Changing the default warehouse requires no request payload.
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
