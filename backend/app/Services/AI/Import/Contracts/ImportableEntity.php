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
     * Whether committing this entity writes financial data. Financial
     * entities need the extra finance approval permission to be committed.
     */
    public function isFinancial(): bool;

    /**
     * Register a listener called with (processed, total) as commit() works
     * through the rows, so callers can report progress.
     */
    public function onProgress(?callable $listener): void;

    /**
     * Commit every row through the entity's existing domain import action.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     *                                                       $duplicateMode is 'skip' (keep existing records) or 'update' (overwrite
     *                                                       the matched record).
     * @return array{created:int,updated:int,skipped:int,total:int}
     */
    public function commit(Collection $rows, string $duplicateMode = 'skip'): array;

    /**
     * Return what the most recent commit() created and overwrote, in the
     * shape rollback() accepts, so the change can be reversed later.
     *
     * @return array<string, mixed>
     */
    public function lastChanges(): array;

    /**
     * Reverse a previous commit() using its lastChanges() payload: archive
     * what it created and restore what it overwrote.
     *
     * @param  array<string, mixed>  $changes
     * @return array{removed:int,restored:int}
     */
    public function rollback(array $changes): array;

    /**
     * Validate every row against this entity's rules without writing to the
     * database, so callers can show what would succeed or fail before
     * committing.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array{valid_rows:int, error_rows:int, errors:list<array{row:int,message:string}>, duplicate_rows?:int}
     */
    public function preview(Collection $rows, string $duplicateMode = 'skip'): array;
}
