<?php

namespace Tests\Feature\AI\Import;

use App\Services\AI\Import\SpreadsheetRowExtractor;
use Illuminate\Support\Facades\File;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class SpreadsheetRowExtractorTest extends TestCase
{
    public function test_extracts_rows_keyed_by_header(): void
    {
        $path = $this->fixtureCsv("name,email\nJane,jane@example.com\n");

        $rows = app(SpreadsheetRowExtractor::class)->extract($path, 'text/csv');

        $this->assertSame([['name' => 'Jane', 'email' => 'jane@example.com']], $rows->toArray());
    }

    public function test_throws_validation_exception_on_empty_file(): void
    {
        $this->expectException(ValidationException::class);

        app(SpreadsheetRowExtractor::class)->extract($this->fixtureCsv(''), 'text/csv');
    }

    /**
     * Write the given contents to a temporary CSV file on disk and return
     * its path, so the extractor can be exercised against a real file
     * rather than an in-memory stream.
     */
    private function fixtureCsv(string $contents): string
    {
        $path = tempnam(sys_get_temp_dir(), 'row-extractor-').'.csv';

        File::put($path, $contents);

        $this->beforeApplicationDestroyed(function () use ($path): void {
            if (File::exists($path)) {
                File::delete($path);
            }
        });

        return $path;
    }
}
