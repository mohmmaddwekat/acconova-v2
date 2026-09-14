<?php

namespace App\Http\Requests;

use App\Enums\PartyRole;
use App\Enums\PartyType;
use App\Models\Party;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class IndexPartyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', Party::class) ?? false;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string', 'max:255'],
            'type' => ['nullable', Rule::enum(PartyType::class)],
            'role' => ['nullable', Rule::enum(PartyRole::class)],
            'status' => ['nullable', Rule::in(['active', 'deleted', 'all'])],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }
}
