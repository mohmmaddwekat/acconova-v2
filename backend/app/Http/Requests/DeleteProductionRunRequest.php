<?php

namespace App\Http\Requests;

use App\Support\ProductionRunAccess;
use Illuminate\Foundation\Http\FormRequest;

class DeleteProductionRunRequest extends FormRequest
{
    /**
     * Restrict Production Draft deletion to Inventory management members.
     */
    public function authorize(): bool
    {
        return ProductionRunAccess::canManage(
            $this->user(),
        );
    }

    /**
     * Require the revision the user actually reviewed before deletion.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'expected_revision' => [
                'required',
                'integer',
                'min:1',
            ],
        ];
    }
}
