<?php

namespace App\Services\AI;

use DateTimeInterface;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

final class AiTemporaryFileUrl
{
    /**
     * Regenerate a short-lived URL from the durable disk/path reference.
     *
     * AI-related records should persist the disk and path, never this returned
     * URL, because the URL is intentionally disposable.
     */
    public function make(
        string $disk,
        string $path,
        ?DateTimeInterface $expiresAt = null,
    ): string {
        $filesystem = Storage::disk($disk);

        if (! $filesystem->exists($path)) {
            throw new RuntimeException('AI file reference does not exist.');
        }

        if (! $filesystem->providesTemporaryUrls()) {
            throw new RuntimeException('The configured filesystem cannot create temporary URLs.');
        }

        return $filesystem->temporaryUrl(
            $path,
            $expiresAt
                ?? now()->addMinutes(
                    max(
                        1,
                        (int) config('ai.files.temporary_url_minutes', 10),
                    ),
                ),
        );
    }
}
