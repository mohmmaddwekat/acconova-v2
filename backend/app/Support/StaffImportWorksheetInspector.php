<?php

namespace App\Support;

use XMLReader;
use ZipArchive;

class StaffImportWorksheetInspector
{
    /**
     * Return the real worksheet bounds based on cells that contain values/formulas,
     * not on formatted-but-empty Excel rows. Non-XLSX formats fall back to the
     * reader metadata because they do not expose OOXML worksheet XML.
     *
     * @return array{last_data_row:int,data_row_count:int}
     */
    public function inspect(
        string $path,
        string $sheetName,
        int $fallbackLastRow,
    ): array {
        if (strtolower((string) pathinfo($path, PATHINFO_EXTENSION)) !== 'xlsx') {
            return [
                'last_data_row' => max(0, $fallbackLastRow),
                'data_row_count' => max(0, $fallbackLastRow),
            ];
        }

        $zip = new ZipArchive();

        if ($zip->open($path) !== true) {
            return $this->fallback($fallbackLastRow);
        }

        try {
            $target = $this->worksheetTarget($path, $sheetName);

            if ($target === null || $zip->locateName($target) === false) {
                return $this->fallback($fallbackLastRow);
            }
        } finally {
            $zip->close();
        }

        $reader = new XMLReader();
        $uri = 'zip://'.str_replace('\\', '/', realpath($path) ?: $path).'#'.$target;

        if (! @$reader->open($uri, null, LIBXML_NONET | LIBXML_COMPACT)) {
            return $this->fallback($fallbackLastRow);
        }

        $lastDataRow = 0;
        $dataRowCount = 0;
        $currentRow = 0;
        $rowHasData = false;
        $insideRow = false;

        try {
            while ($reader->read()) {
                if ($reader->nodeType === XMLReader::ELEMENT && $reader->localName === 'row') {
                    $insideRow = true;
                    $rowHasData = false;
                    $rowNumber = (int) $reader->getAttribute('r');
                    $currentRow = $rowNumber > 0 ? $rowNumber : ($currentRow + 1);

                    if ($reader->isEmptyElement) {
                        $insideRow = false;
                    }

                    continue;
                }

                if (
                    $insideRow
                    && $reader->nodeType === XMLReader::ELEMENT
                    && in_array($reader->localName, ['v', 'f', 'is'], true)
                ) {
                    // Styled empty cells are represented by <c .../> without any of
                    // these value/formula nodes, so they do not inflate row counts.
                    $rowHasData = true;
                    continue;
                }

                if (
                    $insideRow
                    && $reader->nodeType === XMLReader::END_ELEMENT
                    && $reader->localName === 'row'
                ) {
                    if ($rowHasData) {
                        $lastDataRow = max($lastDataRow, $currentRow);
                        $dataRowCount++;
                    }

                    $insideRow = false;
                }
            }
        } finally {
            $reader->close();
        }

        return [
            'last_data_row' => $lastDataRow,
            'data_row_count' => $dataRowCount,
        ];
    }

    private function worksheetTarget(string $path, string $sheetName): ?string
    {
        $workbookReader = new XMLReader();
        $workbookUri = 'zip://'.str_replace('\\', '/', realpath($path) ?: $path).'#xl/workbook.xml';

        if (! @$workbookReader->open($workbookUri, null, LIBXML_NONET | LIBXML_COMPACT)) {
            return null;
        }

        $relationshipId = null;

        try {
            while ($workbookReader->read()) {
                if (
                    $workbookReader->nodeType !== XMLReader::ELEMENT
                    || $workbookReader->localName !== 'sheet'
                    || (string) $workbookReader->getAttribute('name') !== $sheetName
                ) {
                    continue;
                }

                $relationshipId = $workbookReader->getAttributeNs(
                    'id',
                    'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
                ) ?: $workbookReader->getAttribute('r:id');
                break;
            }
        } finally {
            $workbookReader->close();
        }

        if (! $relationshipId) {
            return null;
        }

        $relsReader = new XMLReader();
        $relsUri = 'zip://'.str_replace('\\', '/', realpath($path) ?: $path).'#xl/_rels/workbook.xml.rels';

        if (! @$relsReader->open($relsUri, null, LIBXML_NONET | LIBXML_COMPACT)) {
            return null;
        }

        try {
            while ($relsReader->read()) {
                if (
                    $relsReader->nodeType !== XMLReader::ELEMENT
                    || $relsReader->localName !== 'Relationship'
                    || (string) $relsReader->getAttribute('Id') !== $relationshipId
                ) {
                    continue;
                }

                $target = trim((string) $relsReader->getAttribute('Target'));

                if ($target === '') {
                    return null;
                }

                return $this->normalizeTarget($target);
            }
        } finally {
            $relsReader->close();
        }

        return null;
    }

    private function normalizeTarget(string $target): string
    {
        $path = str_starts_with($target, '/')
            ? ltrim($target, '/')
            : 'xl/'.$target;
        $segments = [];

        foreach (explode('/', str_replace('\\', '/', $path)) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }

            if ($segment === '..') {
                array_pop($segments);
                continue;
            }

            $segments[] = $segment;
        }

        return implode('/', $segments);
    }

    /** @return array{last_data_row:int,data_row_count:int} */
    private function fallback(int $lastRow): array
    {
        return [
            'last_data_row' => max(0, $lastRow),
            'data_row_count' => max(0, $lastRow),
        ];
    }
}
