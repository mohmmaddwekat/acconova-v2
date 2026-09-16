<?php

namespace App\Http\Requests;

use App\Models\User;
use App\Models\Warehouse;
use App\Policies\WarehousePolicy;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class ForceDeleteWarehouseRequest extends FormRequest
{
    private ?Warehouse $resolvedWarehouse =
        null;

    /**
     * Resolve one archived tenant warehouse and authorize permanent deletion.
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

        $user =
            $this->user();

        if (
            ! $user instanceof User
        ) {
            return false;
        }

        return app(
            WarehousePolicy::class,
        )->forceDelete(
            $user,
            $this->resolvedWarehouse,
        );
    }

    /**
     * Permanent warehouse deletion has no payload.
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
