<?php

namespace App\Services\AI\Tools\Concerns;

use Illuminate\Support\Collection;

/**
 * Shared by every smart-import write tool that needs to translate a draft's
 * raw extracted rows into the target entity's field contract before handing
 * them to that entity's `preview()`/`commit()`. Extracted so
 * `SmartImportProposeTool`, `SmartImportReviseTool`, and
 * `SmartImportConfirmTool` apply exactly the same source-column -> target-field
 * remapping instead of each keeping its own copy.
 */
trait RemapsImportRows
{
    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @param  array<string, string>  $fieldMapping
     * @return Collection<int, array<string, mixed>>
     */
    protected function remapRows(Collection $rows, array $fieldMapping): Collection
    {
        return $rows->map(fn (array $row): array => $this->remapRow($row, $fieldMapping));
    }

    /**
     * Translate one source-file row into the target entity's field
     * contract: `$fieldMapping` maps source column name -> target field
     * name, so only mapped columns reach the entity, keyed by the target
     * name rather than the original source column name.
     *
     * @param  array<string, mixed>  $row
     * @param  array<string, string>  $fieldMapping
     * @return array<string, mixed>
     */
    protected function remapRow(array $row, array $fieldMapping): array
    {
        $remapped = [];

        foreach ($fieldMapping as $sourceColumn => $targetField) {
            if (array_key_exists($sourceColumn, $row)) {
                $remapped[$targetField] = $row[$sourceColumn];
            }
        }

        return $remapped;
    }
}
