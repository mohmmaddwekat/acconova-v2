<?php

namespace App\Http\Requests;

use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

class BulkProductActionRequest extends FormRequest
{
    /**
     * Require normal Product-list access before resolving selected records.
     *
     * Per-record delete/restore authorization is performed before mutations.
     */
    public function authorize(): bool
    {
        return $this->user()?->can(
            'viewAny',
            Product::class,
        ) ?? false;
    }

    /**
     * Validate a bounded bulk Product lifecycle operation.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'action' => [
                'required',
                Rule::in([
                    'archive',
                    'restore',
                ]),
            ],

            'product_ids' => [
                'required',
                'array',
                'min:1',
                'max:100',
            ],

            'product_ids.*' => [
                'required',
                'integer',
                'distinct',
                'min:1',
            ],
        ];
    }

    /**
     * Normalize selected Product IDs.
     */
    protected function prepareForValidation(): void
    {
        if (
            ! is_array(
                $this->input(
                    'product_ids',
                ),
            )
        ) {
            return;
        }

        $this->merge([
            'product_ids' => collect(
                $this->input(
                    'product_ids',
                ),
            )
                ->map(
                    /**
                     * Normalize one Product identifier.
                     */
                    fn (
                        mixed $id,
                    ): int => (int) $id,
                )
                ->values()
                ->all(),
        ]);
    }

    /**
     * Resolve every selected Product from the current tenant and lifecycle.
     *
     * Returning 404 if any ID cannot be resolved prevents cross-tenant ID
     * probing and prevents partially applying a selection.
     *
     * @return Collection<int, Product>
     */
    public function products(): Collection
    {
        $ids =
            $this->validated(
                'product_ids',
            );

        $action =
            $this->validated(
                'action',
            );

        $query =
            $action === 'restore'
            ? Product::onlyTrashed()
            : Product::query();

        $resolved =
            $query
                ->whereKey(
                    $ids,
                )
                ->get()
                ->keyBy(
                    'id',
                );

        abort_if(
            $resolved->count()
                !== count(
                    $ids,
                ),
            404,
        );

        return collect(
            $ids,
        )->map(
            /**
             * Preserve the exact client selection order.
             */
            fn (
                int $id,
            ): Product => $resolved->get(
                $id,
            ),
        );
    }
}
