<?php

namespace App\Services\AI\Import\Contracts;

use Illuminate\Support\Collection;

interface ImportableEntity
{
    /**
     * Return the stable catalog key other layers use to address this entity.
     */
    public function key(): string;

    /**
     * Return the human-readable label shown when offering this destination.
     */
    public function label(): string;

    /**
     * Describe the importable fields so callers can map spreadsheet or
     * AI-extracted columns onto this entity without reading its action.
     *
     * @return array<string, mixed>
     */
    public function fieldSchema(): array;

    /**
     * Return the workspace permission key that gates committing rows to
     * this entity.
     */
    public function requiredPermission(): string;

    /**
     * Commit every row through the entity's existing domain import action.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array{created:int,updated:int,skipped:int,total:int}
     */
    public function commit(Collection $rows): array;
}
