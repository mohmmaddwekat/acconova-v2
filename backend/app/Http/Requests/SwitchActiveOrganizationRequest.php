<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SwitchActiveOrganizationRequest extends FormRequest
{
    /**
     * Only authenticated users may request an active organization change.
     */
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Validate the requested organization identifier before tenant resolution.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'organization_id' => [
                'required',
                'integer',
                'min:1',
            ],
        ];
    }
}
