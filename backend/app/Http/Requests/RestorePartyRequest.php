<?php

namespace App\Http\Requests;

use App\Models\Party;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class RestorePartyRequest extends FormRequest
{
    private ?Party $resolvedParty = null;

    /**
     * Resolve only a soft-deleted Party inside the active tenant and authorize
     * restoration through PartyPolicy.
     */
    public function authorize(): bool
    {
        $this->resolvedParty = Party::onlyTrashed()
            ->with('roles')
            ->find($this->route('party'));

        abort_if(
            $this->resolvedParty === null,
            404,
        );

        return $this->user()?->can(
            'restore',
            $this->resolvedParty,
        ) ?? false;
    }

    /**
     * Party restoration accepts no request-body data.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Return the soft-deleted Party authorized for restoration.
     */
    public function party(): Party
    {
        return $this->resolvedParty
            ?? throw new LogicException(
                'Restorable Party was not resolved.',
            );
    }
}
