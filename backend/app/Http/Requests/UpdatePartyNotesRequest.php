<?php

namespace App\Http\Requests;

use App\Models\Party;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class UpdatePartyNotesRequest extends FormRequest
{
    private ?Party $resolvedParty = null;

    /**
     * Resolve an active tenant-scoped Party and authorize note editing through
     * the existing Party update policy.
     */
    public function authorize(): bool
    {
        $this->resolvedParty =
            Party::query()
                ->with('roles')
                ->find(
                    $this->route(
                        'party',
                    ),
                );

        abort_if(
            $this->resolvedParty ===
                null,
            404,
        );

        return $this->user()?->can(
            'update',
            $this->resolvedParty,
        ) ?? false;
    }

    /**
     * Validate the internal Party note.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'notes' => [
                'nullable',
                'string',
                'max:5000',
            ],
        ];
    }

    /**
     * Normalize an empty note back to null.
     */
    protected function prepareForValidation(): void
    {
        if (
            ! $this->has(
                'notes',
            )
        ) {
            return;
        }

        $notes = trim(
            (string) (
                $this->input(
                    'notes',
                ) ?? ''
            ),
        );

        $this->merge([
            'notes' => $notes === ''
                ? null
                : $notes,
        ]);
    }

    /**
     * Return the authorized Party resolved by this request.
     */
    public function party(): Party
    {
        return $this->resolvedParty
            ?? throw new LogicException(
                'Party was not resolved.',
            );
    }
}
