<?php

namespace App\Http\Requests;

use App\Models\Party;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

class ShowPartyRequest extends FormRequest
{
    private ?Party $resolvedParty = null;

    /**
     * Resolve the Party through the active tenant scope and authorize access.
     *
     * Foreign-tenant and soft-deleted Parties intentionally appear as 404.
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
            'view',
            $this->resolvedParty,
        ) ?? false;
    }

    /**
     * Showing one Party requires no request-body validation.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Return the tenant-scoped Party resolved during authorization.
     */
    public function party(): Party
    {
        return $this->resolvedParty
            ?? throw new LogicException(
                'Party was not resolved.',
            );
    }
}
