<?php

namespace App\Http\Requests;

use App\Models\Party;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class DeletePartyRequest extends FormRequest
{
    private ?Party $resolvedParty = null;

    /**
     * Resolve an active Party inside the current tenant and authorize its
     * soft deletion.
     */
    public function authorize(): bool
    {
        $this->resolvedParty = Party::query()
            ->with('roles')
            ->find($this->route('party'));

        abort_if(
            $this->resolvedParty === null,
            404,
        );

        return $this->user()?->can(
            'delete',
            $this->resolvedParty,
        ) ?? false;
    }

    /**
     * Party deletion accepts no request-body data.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Return the Party authorized for soft deletion.
     */
    public function party(): Party
    {
        return $this->resolvedParty
            ?? throw new LogicException(
                'Party was not resolved.',
            );
    }
}
