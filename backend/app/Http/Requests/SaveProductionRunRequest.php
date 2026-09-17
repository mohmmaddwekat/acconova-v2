<?php

namespace App\Http\Requests;

use App\Support\ProductionRunAccess;
use Illuminate\Foundation\Http\FormRequest;

class SaveProductionRunRequest extends FormRequest
{
    /**
     * Allow Production Draft mutation only to workspace members that can
     * manage physical Inventory.
     */
    public function authorize(): bool
    {
        return ProductionRunAccess::canManage(
            $this->user(),
        );
    }

    /**
     * Validate one Production Draft.
     *
     * Recipe is optional and provides suggestions only. Actual material rows
     * remain the authoritative physical consumption values.
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
                'distinct',
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

            /*
             * Recipe is optional. A factory can record Actual Consumption even
             * when no standard BOM/Recipe exists for the finished Product.
             */
            'outputs.*.recipe_id' => [
                'sometimes',
                'nullable',
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
     * Normalize optional text and Recipe fields before validation.
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

                        if (
                            array_key_exists(
                                'recipe_id',
                                $output,
                            )
                            && (
                                $output['recipe_id'] ===
                                    ''
                                || $output['recipe_id'] ===
                                    null
                            )
                        ) {
                            $output['recipe_id'] =
                                null;
                        }

                        $output['selections'] =
                            $output['selections']
                            ?? [];

                        $output['materials'] =
                            collect(
                                $output['materials']
                                ?? [],
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
                                            $materialNote ===
                                                ''
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
