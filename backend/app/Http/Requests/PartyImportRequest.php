<?php

namespace App\Http\Requests;

use App\Models\Party;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PartyImportRequest extends FormRequest
{
    /**
     * Allow spreadsheet imports only to users who can create Parties.
     */
    public function authorize(): bool
    {
        return $this->user()?->can(
            'create',
            Party::class,
        ) ?? false;
    }

    /**
     * Validate the uploaded workbook and duplicate-handling strategy.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'file' => [
                'required',
                'file',
                'mimes:xlsx,xls,csv',
                'max:10240',
            ],

            'duplicate_mode' => [
                'required',
                Rule::in([
                    'skip',
                    'update',
                ]),
            ],
        ];
    }

    /**
     * Default imports to the safest duplicate behavior.
     */
    protected function prepareForValidation(): void
    {
        $this->merge([
            'duplicate_mode' => $this->input(
                'duplicate_mode',
                'skip',
            ),
        ]);
    }
}
