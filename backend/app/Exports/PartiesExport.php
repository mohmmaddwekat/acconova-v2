<?php

namespace App\Exports;

use App\Models\Party;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;

class PartiesExport implements FromCollection, ShouldAutoSize, WithHeadings, WithMapping
{
    /**
     * Store the complete filtered Party collection and export language.
     *
     * @param  Collection<int, Party>  $parties
     */
    public function __construct(
        private readonly Collection $parties,
        private readonly string $locale,
    ) {}

    /**
     * Return all matching Party records, not one pagination page.
     *
     * @return Collection<int, Party>
     */
    public function collection(): Collection
    {
        return $this->parties;
    }

    /**
     * Return localized spreadsheet column labels.
     *
     * @return list<string>
     */
    public function headings(): array
    {
        return [
            __(
                'exports.parties.columns.type',
                [],
                $this->locale,
            ),
            __(
                'exports.parties.columns.name',
                [],
                $this->locale,
            ),
            __(
                'exports.parties.columns.roles',
                [],
                $this->locale,
            ),
            __(
                'exports.parties.columns.email',
                [],
                $this->locale,
            ),
            __(
                'exports.parties.columns.phone',
                [],
                $this->locale,
            ),
            __(
                'exports.parties.columns.tax_number',
                [],
                $this->locale,
            ),
            __(
                'exports.parties.columns.address',
                [],
                $this->locale,
            ),
            __(
                'exports.parties.columns.city',
                [],
                $this->locale,
            ),
            __(
                'exports.parties.columns.state',
                [],
                $this->locale,
            ),
            __(
                'exports.parties.columns.postal_code',
                [],
                $this->locale,
            ),
            __(
                'exports.parties.columns.country',
                [],
                $this->locale,
            ),
            __(
                'exports.parties.columns.created_at',
                [],
                $this->locale,
            ),
        ];
    }

    /**
     * Map one Party into the localized spreadsheet row.
     *
     * @return list<string|null>
     */
    public function map(
        mixed $row,
    ): array {
        /** @var Party $row */
        $name =
            $row->type->value
            === 'company'
            ? $row->company_name
            : $row->name;

        $roles =
            $row->roles
                ->map(
                    /**
                     * Localize one Party role.
                     */
                    fn (
                        $role,
                    ): string => __(
                        'exports.parties.roles.'
                            .$role->role->value,
                        [],
                        $this->locale,
                    ),
                )
                ->implode(', ');

        $address =
            collect([
                $row->address_line_1,
                $row->address_line_2,
            ])
                ->filter()
                ->implode(', ');

        return [
            __(
                'exports.parties.types.'
                    .$row->type->value,
                [],
                $this->locale,
            ),
            $name,
            $roles,
            $row->email,
            $row->phone,
            $row->tax_number,
            $address,
            $row->city,
            $row->state,
            $row->postal_code,
            $row->country_code,
            $row->created_at?->format(
                'Y-m-d H:i',
            ),
        ];
    }
}
