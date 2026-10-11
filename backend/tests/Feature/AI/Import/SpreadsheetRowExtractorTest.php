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
     * Stored import files (Task 7's upload pipeline) may not carry a
     * reliable extension. The mime must then be the only thing that lets
     * Excel::import() resolve the reader type instead of throwing
     * NoTypeDetectedException.
     */
    public function test_extracts_rows_from_extensionless_path_using_mime(): void
    {
        $path = $this->fixtureCsv("name,email\nJane,jane@example.com\n", withExtension: false);

        $rows = app(SpreadsheetRowExtractor::class)->extract($path, 'text/csv');

        $this->assertSame([['name' => 'Jane', 'email' => 'jane@example.com']], $rows->toArray());
    }

    /**
     * Write the given contents to a temporary CSV file on disk and return
     * its path, so the extractor can be exercised against a real file
     * rather than an in-memory stream.
     */
    private function fixtureCsv(string $contents, bool $withExtension = true): string
    {
        // tempnam() always appends an extension of its own on Windows
        // (".tmp"), which would hide the no-extension case this fixture
        // needs to reproduce. Build a dot-less basename by hand instead so
        // pathinfo() genuinely reports no extension.
        $path = sys_get_temp_dir().DIRECTORY_SEPARATOR.'row-extractor-'.bin2hex(random_bytes(6));

        if ($withExtension) {
            $path .= '.csv';
        }

        File::put($path, $contents);

        $this->beforeApplicationDestroyed(function () use ($path): void {
            if (File::exists($path)) {
                File::delete($path);
            }
        });

        return $path;
    }
}
