<?php

namespace App\Http\Requests;

use App\Models\User;
use App\Models\Warehouse;
use App\Policies\WarehousePolicy;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class UpdateWarehouseRequest extends FormRequest
{
    private ?Warehouse $resolvedWarehouse =
        null;

    /**
     * Resolve one active warehouse through the tenant scope and delegate role
     * authorization directly to WarehousePolicy.
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
     * Validate warehouse renaming.
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

    /**
     * Return the tenant-scoped warehouse resolved during authorization.
     */
    public function warehouse(): Warehouse
    {
        return $this->resolvedWarehouse
            ?? throw new LogicException(
                'Warehouse was not resolved.',
            );
    }
}
