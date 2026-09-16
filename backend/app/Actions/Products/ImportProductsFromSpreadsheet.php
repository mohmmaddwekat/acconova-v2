<?php

namespace App\Actions\Products;

use App\Enums\ProductType;
use App\Models\Product;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ImportProductsFromSpreadsheet
{
    /**
     * Reuse normal Product domain actions so imports preserve transactional
     * behavior and Product domain events.
     */
    public function __construct(
        private readonly CreateProduct $createProduct,
        private readonly UpdateProduct $updateProduct,
    ) {}

    /**
     * Analyze Product spreadsheet rows without changing database state.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array<string, mixed>
     */
    public function preview(
        Collection $rows,
        string $duplicateMode,
    ): array {
        $analysis =
            $this->analyze(
                $rows,
                $duplicateMode,
            );

        unset(
            $analysis['entries'],
        );

        return $analysis;
    }

    /**
     * Import every valid Product row atomically.
     *
     * Any invalid row prevents the entire workbook from being committed so a
     * business migration cannot silently leave a half-imported catalog.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array<string, int>
     */
    public function execute(
        Collection $rows,
        string $duplicateMode,
    ): array {
        $analysis =
            $this->analyze(
                $rows,
                $duplicateMode,
            );

        if (
            $analysis['error_rows']
            > 0
        ) {
            throw ValidationException::withMessages([
                'file' => [
                    __('feedback.import_fix'),
                ],
            ]);
        }

        $created = 0;
        $updated = 0;
        $skipped = 0;

        DB::transaction(
            function () use (
                $analysis,
                $duplicateMode,
                &$created,
                &$updated,
                &$skipped,
            ): void {
                foreach (
                    $analysis['entries'] as $entry
                ) {
                    $existingId =
                        $entry['existing_id'];

                    if (
                        $existingId !== null
                    ) {
                        if (
                            $duplicateMode
                            === 'skip'
                        ) {
                            $skipped++;

                            continue;
                        }

                        $product =
                            Product::query()
                                ->findOrFail(
                                    $existingId,
                                );

                        $this->updateProduct
                            ->execute(
                                $product,
                                $entry['payload'],
                            );

                        $updated++;

                        continue;
                    }

                    $this->createProduct
                        ->execute(
                            $entry['payload'],
                        );

                    $created++;
                }
            },
        );

        return [
            'created' => $created,

            'updated' => $updated,

            'skipped' => $skipped,

            'total' => $created
                + $updated
                + $skipped,
        ];
    }

    /**
     * Normalize, validate, and classify Product spreadsheet rows.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array<string, mixed>
     */
    private function analyze(
        Collection $rows,
        string $duplicateMode,
    ): array {
        if (
            ! in_array(
                $duplicateMode,
                [
                    'skip',
                    'update',
                ],
                true,
            )
        ) {
            throw ValidationException::withMessages([
                'duplicate_mode' => [
                    __('feedback.import_mode'),
                ],
            ]);
        }

        if (
            $rows->count()
            > 5000
        ) {
            throw ValidationException::withMessages([
                'file' => [
                    __('feedback.import_limit'),
                ],
            ]);
        }

        $errors = [];
        $entries = [];
        $sample = [];

        $duplicateRows = 0;

        $seenSkus = [];

        foreach (
            $rows->values() as $index => $rawRow
        ) {
            $rowNumber =
                $index + 2;

            $payload =
                $this->normalizeRow(
                    (array) $rawRow,
                );

            $validator =
                Validator::make(
                    $payload,
                    $this->rules(),
                    $this->messages(),
                );

            if (
                $validator->fails()
            ) {
                $errors[] = [
                    'row' => $rowNumber,

                    'code' => 'invalid',
                    'fields' => array_keys($validator->errors()->toArray()),
                    'message' => __('feedback.import_invalid'),
                ];

                continue;
            }

            $sku =
                $payload['sku'];

            if (
                $sku !== null
            ) {
                if (
                    isset(
                        $seenSkus[$sku],
                    )
                ) {
                    $errors[] = [
                        'row' => $rowNumber,

                        'code' => 'duplicate',
                        'message' => __('feedback.import_duplicate'),
                    ];

                    continue;
                }

                $seenSkus[$sku] =
                    $rowNumber;
            }

            $existing = null;

            if (
                $sku !== null
            ) {
                $existing =
                    Product::query()
                        ->withTrashed()
                        ->where(
                            'sku',
                            $sku,
                        )
                        ->first();
            }

            if (
                $existing?->trashed()
            ) {
                $errors[] = [
                    'row' => $rowNumber,

                    'code' => 'archived',
                    'message' => __('feedback.import_archived'),
                ];

                continue;
            }

            $duplicate =
                $existing !== null;

            if ($duplicate) {
                $duplicateRows++;
            }

            $status =
                $duplicate
                ? (
                    $duplicateMode === 'update'
                    ? 'update'
                    : 'skip'
                )
                : 'create';

            $entries[] = [
                'row' => $rowNumber,

                'payload' => $payload,

                'existing_id' => $existing?->id,

                'duplicate' => $duplicate,
            ];

            if (
                count(
                    $sample,
                ) < 8
            ) {
                $sample[] = [
                    'row' => $rowNumber,

                    'type' => $payload['type'],

                    'name' => $payload['name'],

                    'sku' => $sku,

                    'unit_price' => $payload['unit_price'],

                    'status' => $status,
                ];
            }
        }

        return [
            'total_rows' => $rows->count(),

            'valid_rows' => count(
                $entries,
            ),

            'duplicate_rows' => $duplicateRows,

            'error_rows' => count(
                $errors,
            ),

            'sample' => $sample,

            'errors' => array_slice(
                $errors,
                0,
                50,
            ),

            'entries' => $entries,
        ];
    }

    /**
     * Normalize one spreadsheet row into the Product write contract.
     *
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function normalizeRow(
        array $row,
    ): array {
        $type = strtolower(
            trim(
                (string) (
                    $row['type']
                    ?? ''
                ),
            ),
        );

        $sku =
            $this->nullableString(
                $row['sku']
                    ?? null,
            );

        if (
            $sku !== null
        ) {
            $sku = strtoupper(
                $sku,
            );
        }

        return [
            'type' => $type,

            'name' => trim(
                (string) (
                    $row['name']
                    ?? ''
                ),
            ),

            'sku' => $sku,

            'description' => $this->nullableString(
                $row['description']
                    ?? null,
            ),

            'unit' => trim(
                (string) (
                    $row['unit']
                    ?? ''
                ),
            ),

            'unit_price' => $this->nullableNumber(
                $row['unit_price']
                    ?? null,
            ),

            'cost_price' => $this->nullableNumber(
                $row['cost_price']
                    ?? null,
            ),

            'tax_rate' => $this->nullableNumber(
                $row['tax_rate']
                    ?? null,
            ),
        ];
    }

    /**
     * Return validation rules for one imported Product row.
     *
     * @return array<string, mixed>
     */
    private function rules(): array
    {
        return [
            'type' => [
                'required',
                Rule::enum(
                    ProductType::class,
                ),
            ],

            'name' => [
                'required',
                'string',
                'max:255',
            ],

            'sku' => [
                'nullable',
                'string',
                'max:100',
            ],

            'description' => [
                'nullable',
                'string',
                'max:5000',
            ],

            'unit' => [
                'required',
                'string',
                'max:50',
            ],

            'unit_price' => [
                'required',
                'numeric',
                'min:0',
            ],

            'cost_price' => [
                'nullable',
                'numeric',
                'min:0',
            ],

            'tax_rate' => [
                'required',
                'numeric',
                'min:0',
                'max:100',
            ],
        ];
    }

    /**
     * Provide spreadsheet-specific validation feedback.
     *
     * @return array<string, string>
     */
    private function messages(): array
    {
        return [
            'type.required' => 'Every row requires a Product or Service type.',

            'name.required' => 'Every row requires a name.',

            'unit.required' => 'Every row requires a unit.',

            'unit_price.required' => 'Every row requires a selling price.',

            'tax_rate.required' => 'Every row requires a tax rate.',
        ];
    }

    /**
     * Normalize a nullable spreadsheet string.
     */
    private function nullableString(
        mixed $value,
    ): ?string {
        if (
            $value === null
        ) {
            return null;
        }

        $value = trim(
            (string) $value,
        );

        return $value === ''
            ? null
            : $value;
    }

    /**
     * Normalize spreadsheet numeric cells into decimal-safe strings.
     */
    private function nullableNumber(
        mixed $value,
    ): ?string {
        if (
            $value === null
        ) {
            return null;
        }

        $value = trim(
            (string) $value,
        );

        return $value === ''
            ? null
            : $value;
    }
}
