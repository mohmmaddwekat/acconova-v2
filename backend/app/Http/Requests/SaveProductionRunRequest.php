<?php

namespace App\Http\Requests;

use App\Enums\OrganizationRole;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;

class SaveProductionRunRequest extends FormRequest
{
    /**
     * Restrict production mutation to operational management roles.
     */
    public function authorize(): bool
    {
        return in_array(
            app(
                TenantContext::class,
            )->role(),
            [
                OrganizationRole::Owner,
                OrganizationRole::Admin,
                OrganizationRole::Manager,
            ],
            true,
        );
    }

    /**
     * Validate one complete Production Draft.
     *
     * Recipe data is planning information. materials.*.actual_quantity is the
     * authoritative physical consumption that will affect Inventory.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'expected_revision' => [
                $this->isMethod('PATCH')
                    ? 'required'
                    : 'sometimes',
                'integer',
                'min:1',
            ],

            'occurred_on' => [
                'required',
                'date_format:Y-m-d',
                'before_or_equal:today',
            ],

            'note' => [
                'nullable',
                'string',
                'max:2000',
            ],

            'outputs' => [
                'required',
                'array',
                'min:1',
                'max:100',
            ],

            'outputs.*.product_id' => [
                'required',
                'integer',
                'min:1',
            ],

            'outputs.*.warehouse_id' => [
                'required',
                'integer',
                'min:1',
            ],

            'outputs.*.quantity' => [
                'required',
                'numeric',
                'gt:0',
                'regex:/^\d{1,14}(?:\.\d{1,4})?$/',
            ],

            'outputs.*.recipe_id' => [
                'required',
                'integer',
                'min:1',
            ],

            'outputs.*.selections' => [
                'sometimes',
                'array',
                'max:50',
            ],

            'outputs.*.selections.*' => [
                'required',
                'integer',
                'min:1',
            ],

            'outputs.*.materials' => [
                'required',
                'array',
                'min:1',
                'max:100',
            ],

            'outputs.*.materials.*.raw_material_id' => [
                'required',
                'integer',
                'min:1',
            ],

            'outputs.*.materials.*.warehouse_id' => [
                'required',
                'integer',
                'min:1',
            ],

            'outputs.*.materials.*.actual_quantity' => [
                'required',
                'numeric',
                'gt:0',
                'regex:/^\d{1,14}(?:\.\d{1,4})?$/',
            ],

            'outputs.*.materials.*.note' => [
                'nullable',
                'string',
                'max:500',
            ],
        ];
    }

    /**
     * Normalize optional notes before validation.
     */
    protected function prepareForValidation(): void
    {
        $note =
            trim(
                (string) (
                    $this->input('note')
                    ?? ''
                ),
            );

        $outputs =
            collect(
                $this->input(
                    'outputs',
                    [],
                ),
            )
                ->map(
                    function (
                        mixed $output,
                    ): mixed {
                        if (! is_array($output)) {
                            return $output;
                        }

                        $output['materials'] =
                            collect(
                                $output['materials'] ?? [],
                            )
                                ->map(
                                    function (
                                        mixed $material,
                                    ): mixed {
                                        if (
                                            ! is_array(
                                                $material,
                                            )
                                        ) {
                                            return $material;
                                        }

                                        $materialNote =
                                            trim(
                                                (string) (
                                                    $material['note']
                                                    ?? ''
                                                ),
                                            );

                                        $material['note'] =
                                            $materialNote === ''
                                            ? null
                                            : $materialNote;

                                        return $material;
                                    },
                                )
                                ->all();

                        return $output;
                    },
                )
                ->all();

        $this->merge([
            'note' => $note === ''
                ? null
                : $note,

            'outputs' => $outputs,
        ]);
    }
}
