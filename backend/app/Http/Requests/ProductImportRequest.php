<?php

namespace App\Http\Requests;

use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProductImportRequest extends FormRequest
{
    /**
     * Allow Product imports only to users who can create catalog items.
     */
    public function authorize(): bool
    {
        return $this->user()?->can(
            'create',
            Product::class,
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
