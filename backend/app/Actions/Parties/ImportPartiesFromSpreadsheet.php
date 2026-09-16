<?php

namespace App\Actions\Parties;

use App\Enums\PartyRole;
use App\Enums\PartyType;
use App\Models\Party;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ImportPartiesFromSpreadsheet
{
    /**
     * Build the Party spreadsheet importer around the same domain actions used
     * by the normal UI so bulk imports do not bypass business events or rules.
     */
    public function __construct(
        private readonly CreateParty $createParty,
        private readonly UpdateParty $updateParty,
    ) {}

    /**
     * Analyze spreadsheet rows without changing database state.
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
     * Import every valid row atomically.
     *
     * Files containing invalid rows are rejected before any Party is changed,
     * keeping large migrations predictable and reversible.
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

                        $party =
                            Party::query()
                                ->findOrFail(
                                    $existingId,
                                );

                        $this->updateParty
                            ->execute(
                                $party,
                                $entry['payload'],
                            );

                        $updated++;

                        continue;
                    }

                    $this->createParty
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
     * Normalize, validate, and classify spreadsheet rows.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array<string, mixed>
     */
    private function analyze(
        Collection $rows,
        string $duplicateMode,
    ): array {
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

        $seenEmails = [];

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

            $email =
                $payload['email'];

            if (
                $email !== null
            ) {
                if (
                    isset(
                        $seenEmails[$email],
                    )
                ) {
                    $errors[] = [
                        'row' => $rowNumber,

                        'code' => 'duplicate',
                        'message' => __('feedback.import_duplicate'),
                    ];

                    continue;
                }

                $seenEmails[$email] =
                    $rowNumber;
            }

            $existing = null;

            if (
                $email !== null
            ) {
                $existing =
                    Party::query()
                        ->withTrashed()
                        ->where(
                            'email',
                            $email,
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
                    $duplicateMode
                    === 'update'
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
                count($sample)
                < 8
            ) {
                $sample[] = [
                    'row' => $rowNumber,

                    'name' => $payload['type']
                        === PartyType::Company->value
                        ? $payload['company_name']
                        : $payload['name'],

                    'email' => $email,

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
     * Normalize one spreadsheet row into the stable Party write contract.
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

        $email =
            $this->nullableString(
                $row['email']
                    ?? null,
            );

        if (
            $email !== null
        ) {
            $email =
                strtolower(
                    $email,
                );
        }

        $countryCode =
            $this->nullableString(
                $row['country_code']
                    ?? null,
            );

        if (
            $countryCode !== null
        ) {
            $countryCode =
                strtoupper(
                    $countryCode,
                );
        }

        return [
            'type' => $type,

            'name' => $this->nullableString(
                $row['name']
                    ?? null,
            ),

            'company_name' => $this->nullableString(
                $row['company_name']
                    ?? null,
            ),

            'email' => $email,

            'phone' => $this->nullableString(
                $row['phone']
                    ?? null,
            ),

            'tax_number' => $this->nullableString(
                $row['tax_number']
                    ?? null,
            ),

            'address_line_1' => $this->nullableString(
                $row['address_line_1']
                    ?? null,
            ),

            'address_line_2' => $this->nullableString(
                $row['address_line_2']
                    ?? null,
            ),

            'city' => $this->nullableString(
                $row['city']
                    ?? null,
            ),

            'state' => $this->nullableString(
                $row['state']
                    ?? null,
            ),

            'postal_code' => $this->nullableString(
                $row['postal_code']
                    ?? null,
            ),

            'country_code' => $countryCode,

            'roles' => $this->roles(
                $row['roles']
                    ?? '',
            ),
        ];
    }

    /**
     * Return Party spreadsheet validation rules.
     *
     * @return array<string, mixed>
     */
    private function rules(): array
    {
        return [
            'type' => [
                'required',
                Rule::enum(
                    PartyType::class,
                ),
            ],

            'name' => [
                'nullable',
                'string',
                'max:255',
                'required_if:type,person',
                'prohibited_if:type,company',
            ],

            'company_name' => [
                'nullable',
                'string',
                'max:255',
                'required_if:type,company',
                'prohibited_if:type,person',
            ],

            'email' => [
                'nullable',
                'email',
                'max:255',
            ],

            'phone' => [
                'nullable',
                'string',
                'max:50',
            ],

            'tax_number' => [
                'nullable',
                'string',
                'max:100',
            ],

            'address_line_1' => [
                'nullable',
                'string',
                'max:255',
            ],

            'address_line_2' => [
                'nullable',
                'string',
                'max:255',
            ],

            'city' => [
                'nullable',
                'string',
                'max:100',
            ],

            'state' => [
                'nullable',
                'string',
                'max:100',
            ],

            'postal_code' => [
                'nullable',
                'string',
                'max:30',
            ],

            'country_code' => [
                'nullable',
                'string',
                'size:2',
            ],

            'roles' => [
                'required',
                'array',
                'min:1',
                'max:2',
            ],

            'roles.*' => [
                'required',
                'distinct',
                Rule::enum(
                    PartyRole::class,
                ),
            ],
        ];
    }

    /**
     * Return clear spreadsheet-specific validation feedback.
     *
     * @return array<string, string>
     */
    private function messages(): array
    {
        return [
            'name.required_if' => 'Person rows require a name.',

            'company_name.required_if' => 'Company rows require a company_name.',

            'roles.required' => 'Every row requires at least one role.',

            'roles.min' => 'Every row requires at least one role.',
        ];
    }

    /**
     * Normalize a nullable spreadsheet scalar.
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
     * Convert customer/supplier spreadsheet text into Party role values.
     *
     * @return list<string>
     */
    private function roles(
        mixed $value,
    ): array {
        if (
            is_array(
                $value,
            )
        ) {
            $roles =
                $value;
        } else {
            $roles =
                preg_split(
                    '/[;,|]+/',
                    (string) $value,
                    -1,
                    PREG_SPLIT_NO_EMPTY,
                ) ?: [];
        }

        return collect(
            $roles,
        )
            ->map(
                /**
                 * Normalize one spreadsheet role value.
                 */
                fn (
                    mixed $role,
                ): string => strtolower(
                    trim(
                        (string) $role,
                    ),
                ),
            )
            ->filter()
            ->unique()
            ->values()
            ->all();
    }
}
