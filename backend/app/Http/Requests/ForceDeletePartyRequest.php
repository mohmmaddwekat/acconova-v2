<?php

namespace App\Http\Requests;

use App\Models\Party;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class ForceDeletePartyRequest extends FormRequest
{
    private ?Party $resolvedParty =
        null;

    /**
     * Resolve only an archived current-tenant Party and authorize permanent
     * deletion through PartyPolicy.
     */
    public function authorize(): bool
    {
        $this->resolvedParty =
            Party::query()
                ->onlyTrashed()
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
            'forceDelete',
            $this->resolvedParty,
        ) ?? false;
    }

    /**
     * Permanent deletion has no editable request payload.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Return the archived Party resolved during authorization.
     */
    public function party(): Party
    {
        return $this->resolvedParty
            ?? throw new LogicException(
                'Party was not resolved.',
            );
    }
}
