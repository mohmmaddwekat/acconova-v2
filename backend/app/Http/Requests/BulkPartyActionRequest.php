<?php

namespace App\Http\Requests;

use App\Models\Party;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

class BulkPartyActionRequest extends FormRequest
{
    /**
     * Require at least normal Party-list access before resolving bulk records.
     *
     * The controller performs the stronger delete/restore authorization for
     * every selected Party before any mutation occurs.
     */
    public function authorize(): bool
    {
        return $this->user()?->can(
            'viewAny',
            Party::class,
        ) ?? false;
    }

    /**
     * Validate a bounded bulk Party operation.
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

            'party_ids' => [
                'required',
                'array',
                'min:1',
                'max:100',
            ],

            'party_ids.*' => [
                'required',
                'integer',
                'distinct',
                'min:1',
            ],
        ];
    }

    /**
     * Normalize selected IDs before validation.
     */
    protected function prepareForValidation(): void
    {
        if (
            ! is_array(
                $this->input(
                    'party_ids',
                ),
            )
        ) {
            return;
        }

        $this->merge([
            'party_ids' => collect(
                $this->input(
                    'party_ids',
                ),
            )
                ->map(
                    /**
                     * Normalize one selected Party identifier.
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
     * Resolve all selected Parties from the current tenant and required
     * lifecycle state.
     *
     * Returning 404 when even one ID is unavailable prevents cross-tenant ID
     * probing and prevents partially applying a bulk operation.
     *
     * @return Collection<int, Party>
     */
    public function parties(): Collection
    {
        $ids =
            $this->validated(
                'party_ids',
            );

        $action =
            $this->validated(
                'action',
            );

        $query =
            $action === 'restore'
            ? Party::onlyTrashed()
            : Party::query();

        $resolved =
            $query
                ->whereKey(
                    $ids,
                )
                ->get()
                ->keyBy('id');

        abort_if(
            $resolved->count() !==
                count($ids),
            404,
        );

        return collect(
            $ids,
        )->map(
            /**
             * Preserve the exact selection order supplied by the client.
             */
            fn (
                int $id,
            ): Party => $resolved->get(
                $id,
            ),
        );
    }
}
